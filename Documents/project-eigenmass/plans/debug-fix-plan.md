# White Screen Fix Plan

## Root Causes Identified

### CRITICAL — Firebase v12 breaks react-scripts 5 build
`package.json` has `"firebase": "^12.10.0"`. Firebase v12 is pure ESM and requires
Node ≥18 + a bundler that supports ESM. `react-scripts@5.0.1` uses Webpack 5 without
full ESM interop enabled — this causes a **compile error → blank white screen**.

**Fix:** Downgrade firebase to `^10.12.0` (last stable v10 release, fully CJS-compatible
with react-scripts 5) OR upgrade to CRACO with ESM support. Downgrade is simpler/safer.

### MODERATE — Missing `@tailwindcss/animate` plugin
All components use `animate-in`, `fade-in`, `zoom-in-95`, `slide-in-from-bottom-*`,
`duration-*` animation classes. These are from `tailwindcss-animate` plugin which is
**not installed** and **not configured** in `tailwind.config.js`. Without it, animations
are silently dropped — app still renders but looks broken/static.

**Fix:** `npm install tailwindcss-animate` and add plugin to `tailwind.config.js`.

### MINOR — History tab unreachable from BottomNav
`BottomNav` only has `home` and `settings` buttons. `App.js` checks `activeTab === 'history'`
but there is no nav button to reach it. `Settings.js` has an "Archive" button that calls
`setActiveTab('history')` — so it IS reachable, just not from the bottom nav.

**Fix:** No action needed unless a dedicated nav button is desired (out of scope for now).

---

## Fix Steps (in order)

1. **Downgrade firebase** in `package.json`: `"firebase": "^10.12.0"`
2. **Run** `npm install` to update `node_modules` and `package-lock.json`
3. **Install** `tailwindcss-animate`: add to `devDependencies` via `npm install -D tailwindcss-animate`
4. **Update** `tailwind.config.js` to add `require('tailwindcss-animate')` to plugins array
5. **Verify** `src/firebase.js` imports are compatible with firebase v10 (they are — `initializeApp`, `getAuth` from `firebase/auth` are stable v10 API)
6. **Run** `npm start` and confirm no white screen
