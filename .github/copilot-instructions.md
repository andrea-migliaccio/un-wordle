# Copilot Instructions — UnWordle - A Wordle Clone

## Project Overview
Client-side Wordle replica: Plain JavaScript (ES6), HTML5, CSS3 with Firebase Auth + Firestore. No frameworks, no npm dependencies, no build tools. Deployed to GitHub Pages via GitHub Actions.

**Core Features:** Google/Gmail login (required) → Daily word via NYTimes endpoint → Play, navigate past days, save stats, view history, share results. Word validation against the official Wordle word list.

## Architecture Decisions

### Tech Stack
- **Frontend:** Vanilla JavaScript (ES6), HTML5, CSS3 only
- **External Libraries:** Firebase SDK via CDN (`<script>` tags only) — **No npm, no bundling**
- **Hosting:** GitHub Pages, deployed via `.github/workflows/deploy.yml` on push to `main`
- **Database:** Firebase Firestore (client-side only)
- **Auth:** Firebase Authentication (Google provider)
- **Daily Word:** NYTimes public endpoint (`https://www.nytimes.com/svc/wordle/v2/YYYY-MM-DD.json`) — requires CORS proxy (`https://corsproxy.io/?`) because NYTimes does not set `Access-Control-Allow-Origin`
- **Word Validation:** `https://raw.githubusercontent.com/tabatkins/wordle-list/main/words` — CORS open, no proxy needed; loaded once at login and cached as a `Set<string>`

### Repository Structure
```
wordle/
├── index.html                    # Main entry point
├── css/
│   └── style.css                 # All styling (responsive, dark theme, animations)
├── js/
│   ├── app.js                    # Main controller: auth flow, game lifecycle, UI events
│   ├── game.js                   # Board/keyboard rendering, NYTimes fetch, word list
│   ├── auth.js                   # Firebase Auth (Google provider, login/logout)
│   ├── firebase-config.js        # Firebase project config (public keys — no secrets)
│   ├── firestore.js              # All Firestore operations (games, stats, profile)
│   ├── anon-storage.js           # localStorage adapter — same API as Firestore module
│   ├── i18n.js                   # Browser language detection + string lookup (it/en)
│   └── utils.js                  # Pure helpers: feedback algo, share format, date
├── .github/
│   ├── workflows/deploy.yml      # GitHub Pages deploy on push to main
│   └── copilot-instructions.md  # This file
└── README.md                     # Dev notes (local server instructions, word backfill scripts)
```

### Key Conventions

1. **Firebase CDN Setup**
   - Firebase imported via `<script src="https://www.gstatic.com/firebasejs/10.8.0/...">` in `index.html`
   - Compat mode (`firebase-app-compat.js`) — use `firebase.auth()`, `firebase.firestore()` globals
   - Config in `js/firebase-config.js` — safe to commit (access controlled by Firestore Security Rules)
   - Add both `localhost` and the GitHub Pages domain to Firebase Auth → Authorized Domains

2. **Game State Management**
   - Single source of truth: `window.gameState` (reset on logout)
   ```javascript
   window.gameState = {
     currentGame: { date, puzzleId, targetWord, guesses, feedback, currentGuess, status },
     user:        { uid, displayName, email },
     stats:       { gamesPlayed, gamesWon, currentStreak, maxStreak, distribution },
     keyboard:    {},  // letter → 'correct' | 'present' | 'absent'
     anonMode:    false  // true when playing without Firebase Auth
   }
   ```
   - `currentGame.date` is the **navigated date**, not necessarily today — use `Utils.todayString()` for "today"
   - `currentGame.status`: `'playing' | 'won' | 'lost'`

3. **Firestore Schema**
   - `users/{uid}` — profile (displayName, email, updatedAt)
   - `users/{uid}/games/{YYYY-MM-DD}` — one document per day per user
   - `users/{uid}/stats/summary` — aggregated stats document
   - **Nested arrays are not supported by Firestore.** `feedback` (array of arrays) is serialized as an array of comma-joined strings on save and deserialized on load — this is handled transparently inside `firestore.js` (`serializeFeedback` / `deserializeFeedback`). The rest of the codebase always works with the native `string[][]` format.

4. **Code Organization**
   - Each JS file exposes one module-level `const` (e.g. `Game`, `Auth`, `Firestore`, `AnonStorage`, `I18n`, `Utils`, `App`)
   - No `async/await` — use `.then()` chains throughout for Firebase promise consistency
   - HTML is the source of truth for UI state (show/hide via `.hidden` class)
   - `App.getStorage()` returns either `Firestore` or `AnonStorage` based on `window.gameState.anonMode` — all persistence calls go through this abstraction
   - `I18n.t('key')` for all user-visible strings; supports `{placeholder}` interpolation. Language auto-detected from `navigator.language` (`it` or `en`). DOM elements use `data-i18n="key"` / `data-i18n-title="key"` attributes.
   - Script load order in `index.html` matters: Firebase SDKs → `firebase-config.js` → `i18n.js` → `auth.js` → `utils.js` → `firestore.js` → `anon-storage.js` → `game.js` → `app.js`

5. **Game Logic**
   - **Wordle Rules:** 5-letter words, 6 attempts max, color feedback (green=correct, yellow=present, gray=absent)
   - Feedback algorithm in `Utils.computeFeedback(guess, target)` — handles duplicate letters correctly (two-pass)
   - Word validation: `Game.loadWordList()` fetches the list once at login; `Game.isValidWord(word)` checks against the cached `Set`. Fail-open if list not yet loaded.
   - Invalid word → shake row + toast "Parola non valida!", attempt not consumed

6. **Date Navigation**
   - The `#date-nav` bar (← puzzle# + date →) appears above the board
   - `→` button is `disabled` when `currentGame.date >= Utils.todayString()`
   - Navigation calls `loadDate(dateStr)` in `app.js`, which resets the board and either restores an existing game (read-only) or starts a fresh playable game
   - Past unplayed games can be played and saved normally

7. **Share Feature**
   - Format: emoji grid (🟩🟨⬛) per row + `UnWordle #N X/6` header
   - `Utils.formatShare(puzzleId, guesses, feedback, status)` → tries `navigator.share()` first (mobile), falls back to `navigator.clipboard.writeText()`
   - Share button visible in the stats modal only when the current game is finished

8. **Styling**
   - Mobile-first, dark theme matching NYTimes Wordle palette
   - CSS custom properties in `:root` for colors and tile size
   - Tile animations: `pop` (letter typed), `flip-out/flip-in` (reveal), `bounce` (win), `shake` (invalid)
   - Responsive breakpoints at `max-height: 700px` and `max-width: 360px`

### Development

```bash
# Local dev server (no install required)
cd wordle
python3 -m http.server 8000
# → http://localhost:8000
```
Remember: `localhost` must be in Firebase Auth → Authorized Domains.

### Deployment

Push to `main` → GitHub Actions (`deploy.yml`) **minifies all `js/*.js` with terser** then deploys to GitHub Pages. No other build step. GitHub Pages source must be set to **GitHub Actions** in repository Settings → Pages.

Functions (`functions/**`) are deployed separately via `deploy-functions.yml` using the `FIREBASE_SERVICE_ACCOUNT` GitHub secret.

### Firestore Security Rules (complete — keep this updated)

Copy-paste into **Firebase Console → Firestore Database → Rules** then click **Publish**.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ── Daily words (written by Cloud Function only) ──────────────────────
    match /words/{date} {
      allow read:  if request.auth != null;
      allow write: if false;  // Admin SDK (Cloud Function) bypasses rules
    }

    // ── Per-user data ─────────────────────────────────────────────────────
    match /users/{uid} {
      function isOwner() {
        return request.auth != null && request.auth.uid == uid;
      }
      function isString(v)    { return v is string; }
      function isInt(v)       { return v is int; }
      function isTimestamp(v) { return v is timestamp; }

      function validProfile() {
        let d = request.resource.data;
        return d.keys().hasOnly(['displayName', 'email', 'updatedAt'])
          && isString(d.displayName) && isString(d.email) && isTimestamp(d.updatedAt);
      }

      allow read:  if isOwner();
      allow write: if isOwner() && validProfile();

      match /games/{gameDate} {
        function validGame() {
          let d = request.resource.data;
          let inProgress = d.result == 'playing';
          return d.keys().hasOnly(['date','puzzleId','targetWord','guesses','feedback',
                                   'result','attempts','completedAt'])
                 || (inProgress && d.keys().hasOnly(['date','puzzleId','targetWord','guesses',
                                                     'feedback','result','attempts']))
            && isString(d.date) && d.date.size() == 10 && d.date == gameDate
            && isInt(d.puzzleId) && d.puzzleId >= 0
            && isString(d.targetWord) && d.targetWord.size() == 5
            && d.guesses is list && d.guesses.size() >= 1 && d.guesses.size() <= 6
            && d.feedback is list && d.feedback.size() == d.guesses.size()
            && isString(d.result) && (d.result == 'win' || d.result == 'loss' || d.result == 'playing')
            && isInt(d.attempts) && d.attempts >= 1 && d.attempts <= 6
            && d.attempts == d.guesses.size()
            && (inProgress || isTimestamp(d.completedAt));
        }
        allow read:           if isOwner();
        allow create, update: if isOwner() && validGame();
        allow delete:         if false;
      }

      match /stats/{doc} {
        function validStats() {
          let d = request.resource.data;
          return doc == 'summary'
            && d.keys().hasOnly(['gamesPlayed','gamesWon','currentStreak','maxStreak','distribution'])
            && isInt(d.gamesPlayed) && d.gamesPlayed >= 0
            && isInt(d.gamesWon) && d.gamesWon >= 0 && d.gamesWon <= d.gamesPlayed
            && isInt(d.currentStreak) && d.currentStreak >= 0
            && isInt(d.maxStreak) && d.maxStreak >= 0 && d.currentStreak <= d.maxStreak
            && d.distribution is list && d.distribution.size() == 6;
        }
        allow read:  if isOwner();
        allow write: if isOwner() && validStats();
      }
    }
  }
}
```

### Cloud Functions Setup (step-by-step)

1. **Upgrade Firebase to Blaze plan** — Firebase Console → left sidebar → upgrade link → add credit card (stays free within generous limits; set a budget alert at $1 for safety)

2. **Generate Service Account key** — Firebase Console → Project Settings → Service Accounts tab → *Generate new private key* → download JSON file (keep it secret, never commit it)

3. **Add GitHub Secret** — GitHub repo → Settings → Secrets and variables → Actions → *New repository secret*:
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Value: paste the entire content of the downloaded JSON

4. **Install Firebase CLI locally** (one-time):
   ```bash
   npm install -g firebase-tools
   firebase login
   ```

5. **Initialize Functions in the repo**:
   ```bash
   cd wordle
   firebase use YOUR_PROJECT_ID
   firebase init functions
   # → Select: Use an existing project → JavaScript → No ESLint → No overwrite index.js
   ```

6. **First manual deploy**:
   ```bash
   cd functions && npm install
   firebase deploy --only functions
   ```

7. **Subsequent deploys** — automatic via GitHub Actions whenever `functions/**` changes on push to `main`.

### Word Resolution (client-side priority order)

1. `localStorage` cache (`wordle_word_{date}`) — fastest, zero network
2. Firestore `words/{date}` — populated daily by Cloud Function at 00:05 UTC (**skipped in anon mode**)
3. `window.CUSTOM_CORS_PROXY` (if set in `firebase-config.js`) — first proxy if defined
4. `corsproxy.io` — fallback proxy
5. `allorigins.win` — final fallback proxy

### Common Tasks

| Task | Where |
|------|-------|
| Add game feature | `js/game.js` + `js/app.js` + `index.html` |
| Change styling / animations | `css/style.css` |
| Fix auth / login flow | `js/auth.js` + `js/firebase-config.js` |
| Change Firestore schema | `js/firestore.js` — remember to handle nested array serialization |
| Add a new stat | `js/app.js` `finishGame()` + `js/firestore.js` `saveStats()` |
| Change date navigation logic | `js/app.js` `loadDate()`, `dateAddDays()`, `updateDateNav()` |
| Deploy Cloud Function manually | `cd functions && npm install && firebase deploy --only functions` |
| Update Security Rules | Firebase Console → Firestore → Rules (see section above) |

---

**Created:** March 2026 | **Status:** Active development
