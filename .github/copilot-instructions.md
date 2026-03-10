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
│   └── utils.js                  # Pure helpers: feedback algo, share format, date
├── .github/
│   ├── workflows/deploy.yml      # GitHub Pages deploy on push to main
│   └── copilot-instructions.md  # This file
└── READEM.md                     # Dev notes (local server instructions)
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
     keyboard:    {}  // letter → 'correct' | 'present' | 'absent'
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
   - Each JS file exposes one module-level `const` (e.g. `Game`, `Auth`, `Firestore`, `Utils`, `App`)
   - No `async/await` — use `.then()` chains throughout for Firebase promise consistency
   - HTML is the source of truth for UI state (show/hide via `.hidden` class)
   - Script load order in `index.html` matters: Firebase SDKs → `firebase-config.js` → `auth.js` → `utils.js` → `firestore.js` → `game.js` → `app.js`

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
   - Format: emoji grid (🟩🟨⬛) per row + `Wordle #N X/6` header
   - `Utils.formatShare(puzzleId, guesses, feedback, status)` → clipboard via `navigator.clipboard.writeText()`
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

Push to `main` → GitHub Actions (`deploy.yml`) builds and deploys to GitHub Pages automatically. No build step — files served as-is. GitHub Pages source must be set to **GitHub Actions** in repository Settings → Pages.

### Firestore Security Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
      match /games/{gameId} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
      match /stats/{document} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
    }
  }
}
```

### Common Tasks

| Task | Where |
|------|-------|
| Add game feature | `js/game.js` + `js/app.js` + `index.html` |
| Change styling / animations | `css/style.css` |
| Fix auth / login flow | `js/auth.js` + `js/firebase-config.js` |
| Change Firestore schema | `js/firestore.js` — remember to handle nested array serialization |
| Add a new stat | `js/app.js` `finishGame()` + `js/firestore.js` `saveStats()` |
| Change date navigation logic | `js/app.js` `loadDate()`, `dateAddDays()`, `updateDateNav()` |

---

**Created:** March 2026 | **Status:** Active development
