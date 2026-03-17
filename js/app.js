// App module — main controller. Wires Auth, Game, Firestore/AnonStorage and UI together.
// window.gameState is the single source of truth for the current session.
window.gameState = {
  currentGame: {
    date:         null,
    puzzleId:     null,
    targetWord:   null,
    guesses:      [],    // ['AUDIO', 'CRANE', ...]
    feedback:     [],    // [['absent','correct',...], ...]
    currentGuess: '',
    status:       'playing'  // 'playing' | 'won' | 'lost'
  },
  user:     { uid: null, displayName: null, email: null },
  stats:    { gamesPlayed: 0, gamesWon: 0, currentStreak: 0, maxStreak: 0, distribution: [0,0,0,0,0,0] },
  keyboard: {},  // letter → 'correct' | 'present' | 'absent'
  anonMode: false
};

const ANON_FLAG_KEY = 'unwordle_anon';

const App = (() => {

  // Returns the active storage adapter (Firestore or AnonStorage)
  function getStorage() {
    return window.gameState.anonMode ? AnonStorage : Firestore;
  }

  // ── Toast ──────────────────────────────────────────────────────────────────

  let toastTimer;
  function showToast(msg, duration) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('visible'), duration || 2000);
  }

  // ── Modal ──────────────────────────────────────────────────────────────────

  function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
  }

  function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
  }

  // ── Screen toggle ──────────────────────────────────────────────────────────

  function showLoginScreen() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('game-screen').classList.add('hidden');
  }

  function showGameScreen() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
  }

  // ── Stats UI ───────────────────────────────────────────────────────────────

  function renderStats() {
    const s = window.gameState.stats;
    const pct = s.gamesPlayed > 0 ? Math.round(s.gamesWon / s.gamesPlayed * 100) : 0;
    document.getElementById('stat-played').textContent    = s.gamesPlayed;
    document.getElementById('stat-winpct').textContent    = pct;
    document.getElementById('stat-streak').textContent    = s.currentStreak;
    document.getElementById('stat-maxstreak').textContent = s.maxStreak;

    const maxVal = Math.max(...s.distribution, 1);
    const dist = document.getElementById('distribution');
    dist.innerHTML = '';
    s.distribution.forEach((count, i) => {
      const bar = document.createElement('div');
      bar.classList.add('dist-row');
      const isCurrentGuess = window.gameState.currentGame.status !== 'playing' &&
        window.gameState.currentGame.guesses.length === i + 1 &&
        window.gameState.currentGame.status === 'won';
      bar.innerHTML = `
        <span class="dist-label">${i + 1}</span>
        <div class="dist-bar ${isCurrentGuess ? 'dist-bar-current' : ''}"
             style="width:${Math.max(8, Math.round(count / maxVal * 100))}%">
          <span>${count}</span>
        </div>`;
      dist.appendChild(bar);
    });

    const shareBtn = document.getElementById('share-btn');
    if (window.gameState.currentGame.status !== 'playing') {
      shareBtn.classList.remove('hidden');
    } else {
      shareBtn.classList.add('hidden');
    }
  }

  // ── History UI ─────────────────────────────────────────────────────────────

  function renderHistory(games) {
    const list = document.getElementById('history-list');
    if (!games.length) {
      list.innerHTML = `<p class="history-empty">${I18n.t('history.empty')}</p>`;
      return;
    }
    list.innerHTML = '';
    games.forEach(game => {
      const item = document.createElement('div');
      item.classList.add('history-item');
      const resultClass = game.result === 'win' ? 'history-win' : 'history-loss';
      const resultLabel = game.result === 'win' ? `${game.attempts}/6` : 'X/6';
      const grid = game.feedback.map(row =>
        row.map(s => ({ correct:'🟩', present:'🟨', absent:'⬛' }[s])).join('')
      ).join('\n');
      item.innerHTML = `
        <div class="history-header">
          <span class="history-date">${game.date}</span>
          <span class="history-word">${game.targetWord}</span>
          <span class="history-result ${resultClass}">${resultLabel}</span>
        </div>
        <pre class="history-grid">${grid}</pre>`;
      list.appendChild(item);
    });
  }

  // ── Key handling ───────────────────────────────────────────────────────────

  function handleKey(key) {
    const gs = window.gameState.currentGame;
    if (gs.status !== 'playing') return;

    if (key === '⌫' || key === 'Backspace') {
      if (gs.currentGuess.length > 0) {
        gs.currentGuess = gs.currentGuess.slice(0, -1);
        const col = gs.currentGuess.length;
        Game.setTileLetter(gs.guesses.length, col, '');
      }
      return;
    }

    if (key === 'ENTER' || key === 'Enter') {
      submitGuess();
      return;
    }

    if (/^[A-Za-z]$/.test(key)) {
      if (gs.currentGuess.length < 5) {
        const col = gs.currentGuess.length;
        gs.currentGuess += key.toUpperCase();
        Game.setTileLetter(gs.guesses.length, col, key.toUpperCase());
      }
    }
  }

  function submitGuess() {
    const gs = window.gameState.currentGame;
    if (gs.currentGuess.length < 5) {
      showToast(I18n.t('toast.short'));
      Game.shakeRow(gs.guesses.length);
      return;
    }

    if (!Game.isValidWord(gs.currentGuess)) {
      showToast(I18n.t('toast.invalid'));
      Game.shakeRow(gs.guesses.length);
      return;
    }

    const guess    = gs.currentGuess;
    const feedback = Utils.computeFeedback(guess, gs.targetWord);
    const rowIdx   = gs.guesses.length;

    // Update keyboard state
    guess.split('').forEach((letter, i) => {
      window.gameState.keyboard[letter] = Utils.bestState(
        window.gameState.keyboard[letter], feedback[i]
      );
    });

    Game.revealRow(rowIdx, guess.split(''), feedback).then(() => {
      Game.updateKeyboard(window.gameState.keyboard);
      gs.guesses.push(guess);
      gs.feedback.push(feedback);
      gs.currentGuess = '';

      const won = feedback.every(s => s === 'correct');
      if (won) {
        gs.status = 'won';
        setTimeout(() => {
          Game.bounceRow(rowIdx);
          showToast(I18n.t('win.' + (gs.guesses.length - 1)), 3000);
        }, 400);
        finishGame('win');
      } else if (gs.guesses.length >= 6) {
        gs.status = 'lost';
        setTimeout(() => showToast(gs.targetWord, 4000), 400);
        finishGame('loss');
      } else {
        // Game still in progress — persist current state so user can resume later
        getStorage().saveGameProgress(window.gameState.user.uid, gs)
          .catch(err => console.warn('Could not save progress:', err));
      }
    });
  }

  const WIN_MESSAGES = []; // kept for backwards compat — strings now in I18n

  // ── Game finish ────────────────────────────────────────────────────────────

  function finishGame(result) {
    const gs    = window.gameState.currentGame;
    const stats = window.gameState.stats;
    const uid   = window.gameState.user.uid;

    // Update stats
    stats.gamesPlayed++;
    if (result === 'win') {
      stats.gamesWon++;
      stats.currentStreak++;
      if (stats.currentStreak > stats.maxStreak) stats.maxStreak = stats.currentStreak;
      stats.distribution[gs.guesses.length - 1]++;
    } else {
      stats.currentStreak = 0;
    }

    const gameRecord = {
      date:        gs.date,
      puzzleId:    gs.puzzleId,
      targetWord:  gs.targetWord,
      guesses:     gs.guesses,
      feedback:    gs.feedback,
      result:      result,
      attempts:    gs.guesses.length,
      completedAt: firebase.firestore.Timestamp.now()
    };

    getStorage().saveGame(uid, gameRecord)
      .then(() => getStorage().saveStats(uid, stats))
      .then(() => {
        setTimeout(() => {
          renderStats();
          openModal('stats-modal');
        }, 1800);
      });
  }

  // ── Date navigation ────────────────────────────────────────────────────────

  function dateAddDays(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatDateLabel(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function updateDateNav() {
    const gs    = window.gameState.currentGame;
    const today = Utils.todayString();

    document.getElementById('date-nav-puzzle').textContent =
      gs.puzzleId ? `Wordle #${gs.puzzleId}` : '';
    document.getElementById('date-nav-date').textContent = formatDateLabel(gs.date);

    document.getElementById('nav-next').disabled = (gs.date >= today);
  }

  function loadDate(date) {
    const uid = window.gameState.user.uid;

    // Reset game state for the new date
    window.gameState.currentGame = {
      date, puzzleId: null, targetWord: null,
      guesses: [], feedback: [], currentGuess: '', status: 'playing'
    };
    window.gameState.keyboard = {};

    Game.buildBoard();
    Game.buildKeyboard();
    updateDateNav();

    getStorage().loadGame(uid, date)
      .then(existingGame => {
        if (existingGame) {
          const gs = window.gameState.currentGame;
          gs.targetWord = existingGame.targetWord;
          gs.puzzleId   = existingGame.puzzleId;
          gs.guesses    = existingGame.guesses;
          gs.feedback   = existingGame.feedback;

          existingGame.guesses.forEach((guess, ri) => {
            guess.split('').forEach((letter, ci) => {
              window.gameState.keyboard[letter] = Utils.bestState(
                window.gameState.keyboard[letter], existingGame.feedback[ri][ci]
              );
            });
          });

          Game.restoreBoard(existingGame.guesses, existingGame.feedback);
          Game.updateKeyboard(window.gameState.keyboard);
          updateDateNav();

          if (existingGame.result === 'playing') {
            // Resume in-progress game — board is interactive, no toast
            gs.status = 'playing';
          } else {
            gs.status = existingGame.result === 'win' ? 'won' : 'lost';
            const today  = Utils.todayString();
            const isToday = date === today;
            const msg = existingGame.result === 'win'
              ? I18n.t(isToday ? 'toast.won_today' : 'toast.won_past', { n: existingGame.attempts })
              : I18n.t(isToday ? 'toast.lost_today' : 'toast.lost_past', { word: existingGame.targetWord });
            setTimeout(() => showToast(msg, 4000), 300);
          }
        } else {
          return Game.fetchTodayWord(date).then(({ word, puzzleId }) => {
            window.gameState.currentGame.targetWord = word;
            window.gameState.currentGame.puzzleId   = puzzleId;
            updateDateNav();
          });
        }
      })
      .catch(err => {
        console.error('Error loading game:', err);
        showToast(I18n.t('toast.load_error'), 4000);
      });
  }

  function startGame(user) {
    window.gameState.user = { uid: user.uid, displayName: user.displayName, email: user.email };

    Game.buildBoard();
    Game.buildKeyboard();
    showGameScreen();

    // Prefetch word list in background so it's ready when the user submits
    Game.loadWordList().catch(err => console.warn('Word list non caricata:', err));

    getStorage().saveUserProfile(user.uid, { displayName: user.displayName, email: user.email });

    getStorage().loadStats(user.uid)
      .then(stats => {
        window.gameState.stats = stats;
        loadDate(Utils.todayString());
      });
  }

  function startAnonGame() {
    window.gameState.anonMode = true;
    localStorage.setItem(ANON_FLAG_KEY, '1');
    window.gameState.user = { uid: 'anon', displayName: 'Anonymous', email: '' };

    Game.buildBoard();
    Game.buildKeyboard();
    showGameScreen();

    Game.loadWordList().catch(err => console.warn('Word list non caricata:', err));

    AnonStorage.loadStats('anon').then(stats => {
      window.gameState.stats = stats;
      loadDate(Utils.todayString());
    });
  }

  // ── Keyboard input ─────────────────────────────────────────────────────────

  function initKeyboardListener() {
    document.addEventListener('keydown', e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Prevent Space/Enter from re-activating a focused on-screen keyboard button
      if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
      handleKey(e.key);
    });
  }

  // ── Event listeners ────────────────────────────────────────────────────────

  function resetGameState() {
    window.gameState = {
      currentGame: { date: null, puzzleId: null, targetWord: null, guesses: [], feedback: [], currentGuess: '', status: 'playing' },
      user:     { uid: null, displayName: null, email: null },
      stats:    { gamesPlayed: 0, gamesWon: 0, currentStreak: 0, maxStreak: 0, distribution: [0,0,0,0,0,0] },
      keyboard: {},
      anonMode: false
    };
  }

  function initUI() {
    // Login
    document.getElementById('login-btn').addEventListener('click', () => {
      Auth.signIn().catch(err => {
        console.error('Login error:', err);
        showToast(I18n.t('toast.login_error'), 3000);
      });
    });

    // Anonymous login
    document.getElementById('anon-btn').addEventListener('click', () => {
      startAnonGame();
    });

    // Logout (works for both authenticated and anonymous mode)
    document.getElementById('logout-btn').addEventListener('click', () => {
      if (window.gameState.anonMode) {
        localStorage.removeItem(ANON_FLAG_KEY);
        resetGameState();
        showLoginScreen();
      } else {
        Auth.signOut().then(() => {
          resetGameState();
          showLoginScreen();
        });
      }
    });

    // Stats button
    document.getElementById('stats-btn').addEventListener('click', () => {
      renderStats();
      openModal('stats-modal');
    });

    // History button
    document.getElementById('history-btn').addEventListener('click', () => {
      const uid = window.gameState.user.uid;
      if (!uid) return;
      getStorage().loadHistory(uid, 30).then(games => {
        renderHistory(games);
        openModal('history-modal');
      });
    });

    // Date navigation arrows
    document.getElementById('nav-prev').addEventListener('click', () => {
      const prevDate = dateAddDays(window.gameState.currentGame.date, -1);
      loadDate(prevDate);
    });

    document.getElementById('nav-next').addEventListener('click', () => {
      const gs    = window.gameState.currentGame;
      const today = Utils.todayString();
      if (gs.date >= today) return;
      loadDate(dateAddDays(gs.date, 1));
    });

    document.getElementById('title-home').addEventListener('click', (e) => {
      e.preventDefault();
      e.currentTarget.blur(); // prevent the link from keeping focus (Enter would re-trigger it)
      loadDate(Utils.todayString());
    });

    // Share button
    document.getElementById('share-btn').addEventListener('click', () => {
      const gs  = window.gameState.currentGame;
      const text = Utils.formatShare(gs.puzzleId, gs.guesses, gs.feedback, gs.status);
      const shouldUseNativeShare = Utils.isMobileUserAgent();
      const shareFlow = shouldUseNativeShare
        ? Utils.shareText(text)
        : Promise.resolve({ shared: false, canceled: false, error: null });

      shareFlow
        .then(shareResult => {
          return Utils.copyToClipboard(text).then(() => shareResult);
        })
        .then(shareResult => {
          if (shareResult.shared) {
            showToast(I18n.t('toast.shared_copied'), 2200);
            return;
          }
          if (shareResult.error) {
            showToast(I18n.t('toast.share_failed_copied'), 2500);
            return;
          }
          showToast(I18n.t('toast.copied'), 2000);
        })
        .catch(() => {
          showToast(I18n.t('toast.copy_error'), 2500);
        });
    });

    // Close modals
    document.querySelectorAll('.modal-close, .modal-backdrop').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
      });
    });

    // Close modal on Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
      }
    });
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  function init() {
    I18n.applyToDOM();
    initUI();
    initKeyboardListener();

    // Always register the auth listener so Google login works even after
    // leaving anonymous mode (which skips Firebase auth entirely).
    Auth.onAuthChange(user => {
      // Ignore Firebase auth events while in anonymous mode.
      if (localStorage.getItem(ANON_FLAG_KEY)) return;
      if (user) {
        startGame(user);
      } else {
        showLoginScreen();
      }
    });

    // If the user had previously chosen anonymous mode, resume it immediately
    // without waiting for Firebase Auth (which would redirect to login).
    if (localStorage.getItem(ANON_FLAG_KEY)) {
      startAnonGame();
    }
  }

  document.addEventListener('DOMContentLoaded', init);

  return { handleKey };
})();
