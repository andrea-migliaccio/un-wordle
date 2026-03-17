// Game module — board rendering, input handling, word fetching
const Game = (() => {
  const WORD_LENGTH  = 5;
  const MAX_ATTEMPTS = 6;

  const NYTIMES_BASE = 'https://www.nytimes.com/svc/wordle/v2/';

  // CORS proxy fallback chain — tried in order until one succeeds.
  // Primary source is Firestore (populated by Cloud Function), these are last-resort.
  const CORS_PROXIES = [
    url => 'https://corsproxy.io/?' + encodeURIComponent(url),
    url => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url),
    // Optional custom proxy: define window.CUSTOM_CORS_PROXY in firebase-config.js
    // e.g. window.CUSTOM_CORS_PROXY = 'https://my-worker.workers.dev/?';
  ];

  const KEYBOARD_ROWS = [
    ['Q','W','E','R','T','Y','U','I','O','P'],
    ['A','S','D','F','G','H','J','K','L'],
    ['ENTER','Z','X','C','V','B','N','M','⌫']
  ];
  const VIRTUAL_KEY_DEBOUNCE_MS = 50;
  let lastVirtualKeyPressAt = 0;

  // ── localStorage cache ────────────────────────────────────────────────────

  function cacheKey(date) { return 'wordle_word_' + date; }

  function readCache(date) {
    try {
      const raw = localStorage.getItem(cacheKey(date));
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function writeCache(date, data) {
    try { localStorage.setItem(cacheKey(date), JSON.stringify(data)); } catch (_) {}
  }

  // ── Firestore read (primary source — populated by Cloud Function) ──────────

  function fetchFromFirestore(date) {
    return firebase.firestore()
      .collection('words').doc(date)
      .get()
      .then(doc => {
        if (!doc.exists) throw new Error('not in Firestore');
        const d = doc.data();
        return { word: d.word, puzzleId: d.puzzleId };
      });
  }

  // ── NYTimes via proxy chain (fallback) ────────────────────────────────────

  function fetchFromProxy(date) {
    const nytUrl  = NYTIMES_BASE + date + '.json';
    const proxies = typeof window.CUSTOM_CORS_PROXY === 'string'
      ? [url => window.CUSTOM_CORS_PROXY + encodeURIComponent(url), ...CORS_PROXIES]
      : CORS_PROXIES;

    // Try each proxy in sequence, stopping at first success
    return proxies.reduce(
      (chain, makeUrl) => chain.catch(() =>
        fetch(makeUrl(nytUrl))
          .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(data => ({ word: data.solution.toUpperCase(), puzzleId: data.days_since_launch || data.id || 0 }))
      ),
      Promise.reject(new Error('start'))
    );
  }

  // ── Public: fetch word for a date ─────────────────────────────────────────
  // Resolution order:
  //   Authenticated: localStorage cache → Firestore → proxy chain
  //   Anonymous:     localStorage cache → proxy chain (Firestore skipped)

  function fetchTodayWord(date) {
    const cached = readCache(date);
    if (cached) return Promise.resolve(cached);

    const remote = (window.gameState && window.gameState.anonMode)
      ? fetchFromProxy(date)
      : fetchFromFirestore(date).catch(() => fetchFromProxy(date));

    return remote.then(data => {
      writeCache(date, data);
      return data;
    });
  }

  // ── Board ─────────────────────────────────────────────────────────────────

  function buildBoard() {
    const board = document.getElementById('board');
    board.innerHTML = '';
    for (let r = 0; r < MAX_ATTEMPTS; r++) {
      const row = document.createElement('div');
      row.classList.add('row');
      row.dataset.row = r;
      for (let c = 0; c < WORD_LENGTH; c++) {
        const tile = document.createElement('div');
        tile.classList.add('tile');
        tile.dataset.row = r;
        tile.dataset.col = c;
        row.appendChild(tile);
      }
      board.appendChild(row);
    }
  }

  function getTile(row, col) {
    return document.querySelector(`.tile[data-row="${row}"][data-col="${col}"]`);
  }

  function getRow(row) {
    return document.querySelector(`.row[data-row="${row}"]`);
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────

  function buildKeyboard() {
    const container = document.getElementById('keyboard');
    container.innerHTML = '';
    KEYBOARD_ROWS.forEach(keys => {
      const row = document.createElement('div');
      row.classList.add('keyboard-row');
      keys.forEach(key => {
        const btn = document.createElement('button');
        btn.type = 'button'; // prevent Enter key from re-triggering click when focused
        btn.classList.add('key');
        btn.textContent = key;
        btn.dataset.key = key;
        if (key === 'ENTER') btn.classList.add('key-wide');
        if (key === '⌫')    btn.classList.add('key-wide');
        btn.addEventListener('click', () => {
          const now = Date.now();
          if (now - lastVirtualKeyPressAt < VIRTUAL_KEY_DEBOUNCE_MS) return;
          lastVirtualKeyPressAt = now;
          btn.blur(); // return focus to document so Enter keydown isn't captured by the button
          App.handleKey(key);
        });
        row.appendChild(btn);
      });
      container.appendChild(row);
    });
  }

  function updateKeyboard(keyboardState) {
    Object.entries(keyboardState).forEach(([letter, state]) => {
      const btn = document.querySelector(`.key[data-key="${letter}"]`);
      if (btn) {
        btn.dataset.state = state;
      }
    });
  }

  // ── Tile rendering ────────────────────────────────────────────────────────

  function setTileLetter(row, col, letter) {
    const tile = getTile(row, col);
    tile.textContent = letter;
    tile.dataset.state = letter ? 'tbd' : 'empty';
    if (letter) {
      tile.classList.add('pop');
      tile.addEventListener('animationend', () => tile.classList.remove('pop'), { once: true });
    }
  }

  // Reveals a row of tiles with flip animation, staggered per tile
  function revealRow(row, letters, feedback) {
    return new Promise(resolve => {
      const FLIP_DURATION = 350; // ms per tile
      const GAP = 100;           // ms between tiles

      letters.forEach((letter, col) => {
        const tile = getTile(row, col);
        const delay = col * GAP;

        setTimeout(() => {
          // Phase 1: collapse (scale Y to 0)
          tile.classList.add('flip-out');
          setTimeout(() => {
            // Mid-flip: apply new state
            tile.dataset.state = feedback[col];
            tile.textContent = letter;
            tile.classList.remove('flip-out');
            tile.classList.add('flip-in');
            setTimeout(() => {
              tile.classList.remove('flip-in');
            }, FLIP_DURATION);
          }, FLIP_DURATION);
        }, delay);
      });

      // Resolve after all tiles have been revealed
      const total = (letters.length - 1) * GAP + FLIP_DURATION * 2;
      setTimeout(resolve, total);
    });
  }

  function shakeRow(rowIndex) {
    const row = getRow(rowIndex);
    row.classList.add('shake');
    row.addEventListener('animationend', () => row.classList.remove('shake'), { once: true });
  }

  function bounceRow(rowIndex) {
    for (let c = 0; c < WORD_LENGTH; c++) {
      const tile = getTile(rowIndex, c);
      setTimeout(() => {
        tile.classList.add('bounce');
        tile.addEventListener('animationend', () => tile.classList.remove('bounce'), { once: true });
      }, c * 100);
    }
  }

  // Restores a completed game on the board (no animation)
  function restoreBoard(guesses, feedback) {
    guesses.forEach((guess, rowIdx) => {
      guess.split('').forEach((letter, col) => {
        const tile = getTile(rowIdx, col);
        tile.textContent = letter;
        tile.dataset.state = feedback[rowIdx][col];
      });
    });
  }

  // ── Word list validation ──────────────────────────────────────────────────

  const WORD_LIST_URL = 'https://raw.githubusercontent.com/tabatkins/wordle-list/main/words';
  let validWords = null; // Set<string>, loaded once

  function loadWordList() {
    if (validWords !== null) return Promise.resolve(validWords);
    return fetch(WORD_LIST_URL)
      .then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(text => {
        validWords = new Set(text.trim().split('\n').map(w => w.trim().toUpperCase()));
        return validWords;
      });
  }

  function isValidWord(word) {
    // If list not loaded yet, accept the word (fail-open)
    if (validWords === null) return true;
    return validWords.has(word.toUpperCase());
  }

  return {
    fetchTodayWord,
    loadWordList,
    isValidWord,
    buildBoard,
    buildKeyboard,
    updateKeyboard,
    setTileLetter,
    revealRow,
    shakeRow,
    bounceRow,
    restoreBoard
  };
})();
