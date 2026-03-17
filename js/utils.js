// Utils module — pure helpers with no side effects
const Utils = (() => {

  // Returns today's date as YYYY-MM-DD in local time
  function todayString() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Maps feedback state to share emoji
  const EMOJI = { correct: '🟩', present: '🟨', absent: '⬛' };

  // Formats the shareable result string (NYTimes style)
  function formatShare(puzzleId, guesses, feedback, status) {
    const attempts = status === 'won' ? guesses.length : 'X';
    const header = `UnWordle ${puzzleId} ${attempts}/6`;
    const grid = feedback.map(row =>
      row.map(state => EMOJI[state]).join('')
    ).join('\n');
    return `${header}\n\n${grid}`;
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback for older browsers
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    return Promise.resolve();
  }

  function shareText(text) {
    if (!navigator.share) {
      return Promise.resolve({ shared: false, canceled: false, error: null });
    }
    return navigator.share({ text })
      .then(() => ({ shared: true, canceled: false, error: null }))
      .catch(err => {
        if (err && err.name === 'AbortError') {
          return { shared: false, canceled: true, error: null };
        }
        return { shared: false, canceled: false, error: err };
      });
  }

  // Wordle feedback algorithm — handles duplicate letters correctly
  // Returns array of 5 states: 'correct' | 'present' | 'absent'
  function computeFeedback(guess, target) {
    const result = Array(5).fill('absent');
    const targetArr = target.split('');
    const guessArr = guess.split('');

    // Pass 1: mark exact matches
    for (let i = 0; i < 5; i++) {
      if (guessArr[i] === targetArr[i]) {
        result[i] = 'correct';
        targetArr[i] = null;
        guessArr[i] = null;
      }
    }

    // Pass 2: mark letters present but in wrong position
    for (let i = 0; i < 5; i++) {
      if (guessArr[i] === null) continue;
      const idx = targetArr.indexOf(guessArr[i]);
      if (idx !== -1) {
        result[i] = 'present';
        targetArr[idx] = null;
      }
    }

    return result;
  }

  // Priority order for keyboard coloring
  const STATE_PRIORITY = { correct: 3, present: 2, absent: 1, '': 0 };

  function bestState(current, next) {
    return STATE_PRIORITY[next] > STATE_PRIORITY[current || ''] ? next : current;
  }

  return { todayString, formatShare, copyToClipboard, shareText, computeFeedback, bestState };
})();
