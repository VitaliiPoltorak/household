# @household/mobile

React Native app (Expo SDK 57, managed workflow) — Phase 5 of `docs/PLAN.md`.

This is the bare scaffold: no navigation, auth, screens, or sockets yet (see
`libs/contracts`/`libs/locales` wiring below and the follow-up issues under
#27). `App.tsx` only proves the monorepo module resolution works.

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
  tsconfig doesn't have. `App.tsx`'s
  `import { ServerEvents } from '@household/contracts/realtime/events'` is
  the pattern to follow.

## Known gaps (tracked in follow-up issues under #27)

- No navigation, auth, or screens — `App.tsx` is a placeholder.
- No test suite yet — CI's `Mobile lint + Build` job covers this app (lint,
  type check, `expo export`).
- No EAS project configured — `expo export` proves the bundle resolves, not
  that a native binary builds; that's a separate concern for closer to release.
