# @household/mobile

React Native app (Expo SDK 57, managed workflow) — Phase 5 of `docs/PLAN.md`.

This is the bare scaffold: no navigation, auth, screens, or sockets yet (see
`libs/contracts`/`libs/locales` wiring below and the follow-up issues under
#27). `App.tsx` only proves the monorepo module resolution works.

## Prerequisites

- Everything in the root [README](../../README.md#prerequisites) (Node ≥ 20, pnpm 9).
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
pnpm --filter @household/mobile dev    # or: pnpm mobile
```

This starts the Expo dev server (Metro) and prints a QR code:

- **Expo Go** — scan the QR code with the Expo Go app (Android) or the Camera
  app (iOS). Works today since the app has no custom native modules yet.
- **iOS Simulator** — press `i` in the terminal (requires Xcode, macOS only).
- **Android Emulator** — press `a` in the terminal (requires an AVD already running).
- **Web** (Metro's React Native Web target, for a quick sanity check only —
  not a supported target for real use) — press `w`.

## Monorepo wiring

- Workspace package name: `@household/mobile`, resolved via pnpm's
  `apps/*` glob in `pnpm-workspace.yaml` — no extra config needed there.
- Turborepo tasks: `dev` (persistent, matches `apps/web`'s Vite dev server),
  `build` (`expo export --platform ios` — bundles via Metro without needing a
  simulator; the fastest available check that the whole module graph,
  monorepo imports included, actually resolves. **Not** a native binary —
  that's `eas build`, out of scope until Phase 5 needs a real device build),
  `lint` (ESLint, root `eslint.config.js`'s mobile overlay — same rules as
  `apps/web`, RN globals instead of DOM ones).
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
- No test suite yet — CI's `lint-and-build` job covers this app (lint +
  `expo export`); there's no `test:unit` script, so `pnpm test:unit` at the
  root simply skips it, same as any other package without one.
- No EAS project configured — `expo export` proves the bundle resolves, not
  that a native binary builds; that's a separate concern for closer to release.
