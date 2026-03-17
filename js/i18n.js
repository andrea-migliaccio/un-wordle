// I18n module — browser language detection and string lookup
// Detects language from navigator.language; falls back to English.
// Usage: I18n.t('key'), I18n.t('key.with.{placeholder}', { placeholder: value })
const I18n = (() => {

  const translations = {
    it: {
      // Login
      'login.desc':          'Indovina la parola in 6 tentativi.\nAccedi per salvare le tue statistiche.',
      'login.btn':           'Accedi con Google',
      'login.anon_link':     'Entra in modalità anonima',
      'login.anon_note':     'I dati saranno salvati solo su questo dispositivo',

      // Header tooltips
      'header.history':      'Storico partite',
      'header.stats':        'Statistiche',
      'header.logout':       'Esci',

      // Stats modal
      'stats.title':         'STATISTICHE',
      'stats.played':        'Partite',
      'stats.winpct':        '% Vittorie',
      'stats.streak':        'Streak',
      'stats.maxstreak':     'Max Streak',
      'stats.distribution':  'DISTRIBUZIONE TENTATIVI',
      'stats.share':         'Condividi 🔗',

      // History modal
      'history.title':       'STORICO PARTITE',
      'history.empty':       'Nessuna partita ancora.',

      // Toasts
      'toast.short':         'Parola troppo corta!',
      'toast.invalid':       'Parola non valida!',
      'toast.copied':        'Copiato negli appunti!',
      'toast.shared_copied': 'Condiviso e copiato negli appunti!',
      'toast.share_failed_copied': 'Condivisione non riuscita, copiato negli appunti.',
      'toast.copy_error':    'Impossibile copiare negli appunti.',
      'toast.login_error':   'Errore durante il login. Riprova.',
      'toast.load_error':    'Errore nel caricamento della parola. Riprova.',
      'toast.won_today':     'Hai già vinto oggi con {n}/6!',
      'toast.lost_today':    'La parola di oggi era: {word}',
      'toast.won_past':      'Hai vinto con {n}/6!',
      'toast.lost_past':     'La parola era: {word}',

      // Win messages (index = attempts - 1)
      'win.0':               'Genio!',
      'win.1':               'Magnifico!',
      'win.2':               'Impressionante!',
      'win.3':               'Splendido!',
      'win.4':               'Bravo!',
      'win.5':               'Uff, per un pelo!',
    },

    en: {
      // Login
      'login.desc':          'Guess the word in 6 tries.\nSign in to save your statistics.',
      'login.btn':           'Sign in with Google',
      'login.anon_link':     'Play anonymously',
      'login.anon_note':     'Data will only be saved on this device',

      // Header tooltips
      'header.history':      'Game history',
      'header.stats':        'Statistics',
      'header.logout':       'Sign out',

      // Stats modal
      'stats.title':         'STATISTICS',
      'stats.played':        'Played',
      'stats.winpct':        'Win %',
      'stats.streak':        'Streak',
      'stats.maxstreak':     'Max Streak',
      'stats.distribution':  'GUESS DISTRIBUTION',
      'stats.share':         'Share 🔗',

      // History modal
      'history.title':       'GAME HISTORY',
      'history.empty':       'No games yet.',

      // Toasts
      'toast.short':         'Not enough letters!',
      'toast.invalid':       'Not in word list!',
      'toast.copied':        'Copied to clipboard!',
      'toast.shared_copied': 'Shared and copied to clipboard!',
      'toast.share_failed_copied': 'Share failed, copied to clipboard instead.',
      'toast.copy_error':    'Unable to copy to clipboard.',
      'toast.login_error':   'Login error. Please try again.',
      'toast.load_error':    'Error loading word. Please try again.',
      'toast.won_today':     'You already won today with {n}/6!',
      'toast.lost_today':    "Today's word was: {word}",
      'toast.won_past':      'You won with {n}/6!',
      'toast.lost_past':     'The word was: {word}',

      // Win messages
      'win.0':               'Genius!',
      'win.1':               'Magnificent!',
      'win.2':               'Impressive!',
      'win.3':               'Splendid!',
      'win.4':               'Great!',
      'win.5':               'Phew!',
    }
  };

  // Resolve language: 'it' if browser locale starts with 'it', else 'en'
  const lang = (navigator.language || 'en').toLowerCase().startsWith('it') ? 'it' : 'en';

  // Set <html lang> attribute to match resolved language
  document.documentElement.lang = lang;

  // Look up a key, interpolating {placeholders} with values object
  function t(key, values) {
    const str = (translations[lang] && translations[lang][key]) ||
                (translations.en[key]) ||
                key;
    if (!values) return str;
    return str.replace(/\{(\w+)\}/g, (_, k) => (values[k] !== undefined ? values[k] : '{' + k + '}'));
  }

  // Apply translations to DOM elements with data-i18n="key" (textContent)
  // and data-i18n-title="key" (title + aria-label attributes)
  function applyToDOM() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.dataset.i18nTitle;
      const val = t(key);
      el.title      = val;
      el.setAttribute('aria-label', val);
    });
  }

  return { t, applyToDOM, lang };
})();
