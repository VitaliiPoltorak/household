# @household/mobile

React Native app (Expo SDK 57, managed workflow) — Phase 5 of `docs/PLAN.md`.

This is the scaffold plus the navigation shell (#358): expo-router routes under
`app/`, placeholder screens, and a placeholder auth gate. No real data, auth
flow, or sockets yet (see the follow-up issues under #27).

## Navigation

- `app/_layout.tsx` — root `Stack` with `Stack.Protected` guards on the
  (placeholder) `useAuth().isSignedIn` flag: signed out → `app/(auth)/`
  (login, register); signed in → `app/(app)/` (bottom tabs).
- `app/(app)/_layout.tsx` — tabs mirroring web's primary nav, defined in
  `src/navigation/tabs.ts`: Dashboard, Accounts, Transactions, Shopping,
  Household, Settings. To add a tab: add a file under `app/(app)/` and an
  entry in `TABS`.
- `src/components/Screen.tsx` — shared safe-area + title shell; use it instead
  of handling insets per screen.
- `src/auth/AuthContext.tsx` — real auth state (#359): on launch it exchanges
  the refresh token in `expo-secure-store` for an access token (memory only)
  and loads `/auth/me`; `app/_layout.tsx` gates routes on it.
- `src/household/HouseholdContext.tsx` — loads the user's households and
  tracks the active one (first by default, choice persisted); data screens
  pass `activeHousehold.id` to the API modules, which send it as
  `X-Household-Id`. Server state goes through TanStack Query with the same
  query keys as `apps/web`. Screens under `app/(app)/accounts/` are the
  reference for list + form screens.
- `src/api/client.ts` — fetch wrapper sending `X-Client-Platform: mobile`
  (tokens in the body, no cookies — #356) with single-flight refresh-on-401.

## Configuration

| Env var | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | Gateway base URL, e.g. `http://192.168.1.20:3000/api/v1` — a device can't reach `localhost`. |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | Native Google OAuth client IDs. Without them the "Continue with Google" button is hidden. Also add them to auth-service's `GOOGLE_MOBILE_CLIENT_IDS`. |

Google sign-in needs a dev-client/native build (its reverse-client-id redirect
scheme is registered by `app.config.js`); it does not work in Expo Go.
- Deep-link scheme `household://` is registered in `app.json`; the invite-accept
  handler is a later task.

## Prerequisites

- Everything in the root [README](../../README.md#prerequisites) (Node ≥ 20, pnpm 9).
- Install its dependencies separately (it is **not** part of the root pnpm
  workspace, #374): `pnpm mobile:install` from the repo root, or `pnpm install`
  inside `apps/mobile`.
- **Expo Go** app on a physical iOS/Android device — the fastest way to run this
  during scaffold-stage development (no native build required), from the App
  Store / Play Store.
- Or a local simulator/emulator, for a dev-client build later once native modules
  are added (Expo Go can't run custom native code):
  - **iOS Simulator** — Xcode (macOS only): `xcode-select --install`, then open
    Xcode once to accept the license and install the simulator runtime.
  - **Android Emulator** — Android Studio, with an AVD created via its Device
    Manager, and `ANDROID_HOME` pointing at the SDK.

## Run it

```bash
pnpm mobile    # or: pnpm --dir apps/mobile dev
```

This starts the Expo dev server (Metro) and prints a QR code:

- **Expo Go** — scan the QR code with the Expo Go app (Android) or the Camera
  app (iOS). Works today since the app has no custom native modules yet.
- **iOS Simulator** — press `i` in the terminal (requires Xcode, macOS only).
- **Android Emulator** — press `a` in the terminal (requires an AVD already running).
- **Web** (Metro's React Native Web target, for a quick sanity check only —
  not a supported target for real use) — press `w`.

## Monorepo wiring

- **Standalone pnpm project (#374)**: the root `pnpm-workspace.yaml` excludes
  `apps/mobile` (`!apps/mobile`); this directory has its own
  `pnpm-workspace.yaml` + `pnpm-lock.yaml`, so Expo / React Native / Metro
  (React 19, TS 6) never share a lockfile or hoisted `node_modules` with the
  backend services or `apps/web` (React 18). Nothing here needs pnpm's
  dependency graph to reach `libs/*` — those are consumed by filesystem path
  (see below).
- Because Turborepo only sees root-workspace packages, it does **not** run this
  app's tasks. Use the root shortcuts instead: `pnpm mobile:lint`,
  `pnpm mobile:build` (`expo export --platform ios` — bundles via Metro without
  a simulator; the fastest check that the whole module graph, `libs/*` imports
  included, resolves. **Not** a native binary — that's `eas build`, out of
  scope until Phase 5 needs a real device build). CI runs lint, `tsc --noEmit`
  and the export in a dedicated `Mobile lint + Build` job.
- ESLint: own `eslint.config.js` (same baseline rules as the root config,
  React Native globals instead of DOM ones).
- **Shared code from `libs/contracts` / `libs/locales`**: consumed as TS
  source, the same convention the backend services use via tsconfig `paths`
  and `apps/web` uses via Vite's `resolve.alias` — no build step for those
  libs. Metro has no equivalent of either, so `metro.config.js` wires it
  explicitly (`resolver.extraNodeModules` mapping the package name straight
  to `libs/*/src`, plus `watchFolders` so edits there trigger a rebuild and
  `unstable_enableSymlinks` so Metro follows pnpm's `.pnpm` store symlinks).
  `tsconfig.json`'s `paths` mirror the same mapping for the editor/type-checker
  — keep both in sync if either changes.
- Import from a subpath, not `@household/contracts`'s root barrel — the
  barrel also re-exports backend-only DTOs (`class-validator` decorators,
  `crypto`) that need Node/`experimentalDecorators` support this app's
  tsconfig doesn't have. e.g.
  `import { ServerEvents } from '@household/contracts/realtime/events'` is
  the pattern to follow.

## Known gaps (tracked in follow-up issues under #27)

- Data screens are titles only; Apple/Facebook sign-in and unlock-account/password-reset flows are not implemented.
- No test suite yet — CI's `Mobile lint + Build` job covers this app (lint,
  type check, `expo export`).
- No EAS project configured — `expo export` proves the bundle resolves, not
  that a native binary builds; that's a separate concern for closer to release.
