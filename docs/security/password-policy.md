# Password policy

> Status: **implemented in Phase 3 (issue #184)**. This document defines the
> baseline; the code that enforces it is cross-referenced under each MUST.
> Tracks issue #64.

## Why this exists

The system was OAuth-only until #184. The 2026-08 security audit flagged
that adding password auth without a documented policy invites the usual
mistakes: bcrypt-cost-8 defaults, no breach check, unbounded retry. This
document is the acceptance criterion for password auth — every MUST below
is verified by an automated test in `apps/auth-service/test/`.

**Rule for any future PR that touches the password path** (rotation policy
change, algorithm swap, new complexity rule, MFA extension): it MUST link
this document and demonstrate that every MUST is still enforced by tests.

---

## 1. Hashing

### MUST
- **Argon2id** with parameters at or above OWASP 2024 recommendations:
  - `memory: 19 MiB` (19456)
  - `iterations: 2`
  - `parallelism: 1`
  - `hashLength: 32`
  - `saltLength: 16` (default from the crate)
- Never store, log, or emit the plaintext password anywhere, including
  request logs, error messages, or Kafka events.
- Rehash on login if the stored parameters fall below current policy so
  users migrate to stronger settings over time without any user-facing
  prompt.

### Implementation
`apps/auth-service/src/auth/password-hasher.service.ts` on top of
[`@node-rs/argon2`](https://www.npmjs.com/package/@node-rs/argon2) — Rust
binding with prebuilt binaries, no node-gyp toolchain on the build host.
Enforces the OWASP baseline at boot when `NODE_ENV` is `production` /
`staging` (refuses to start on downgrade). `needsRehash()` parses the
stored hash's `$argon2id$v=…$m=…,t=…,p=…$` header and compares against the
running config — any weaker value triggers a rehash on next successful
login (see `AuthService.loginWithPassword`).

### Fallback
None allowed in production. The 2026-08 iteration considered bcrypt cost ≥
12 as an acceptable fallback but Argon2id shipped without issue via
`@node-rs/argon2`. If a future runtime constraint truly forbids Argon2,
document the exception in the PR that switches — do not silently choose
bcrypt.

---

## 2. Complexity

### MUST
- **Minimum length: 12 characters.** No maximum — Argon2 handles any length,
  and imposing a max only teaches users to pick weaker passwords.
- **zxcvbn score ≥ 3** (out of 0–4). Score 3 = "safely unguessable —
  moderate protection from offline slow-hash scenario".
- Reject passwords that appear in the **HaveIBeenPwned** breach database
  via the [k-anonymity Range API](https://haveibeenpwned.com/API/v3#PwnedPasswords)
  (send the first 5 chars of the SHA-1 hash, receive the rest of matching
  hashes — the plaintext never leaves the server).

### MUST NOT
- No character-class rules ("one uppercase, one digit, one symbol"). These
  push users toward `P@ssw0rd1` and are counter-recommended by NIST
  SP 800-63B §5.1.1.2 since 2017.
- No forced periodic rotation. Rotation forces incremental variants
  (`Password1` → `Password2`) and provides negligible security benefit
  against modern threats. Rotate only on breach evidence.

### When to check
- On **signup** — reject before creating the account.
- On **password change** — reject before persisting new hash.
- **Not on login.** A user whose stored password was set before the policy
  tightened should be prompted to change it on next login, but not blocked
  from authenticating.

### Implementation
- **zxcvbn** — `apps/auth-service/src/auth/password-complexity.service.ts`
  wraps `@zxcvbn-ts/core` with the en dictionary. `AuthService.register`
  primes `userInputs` with the caller's email + displayName so passwords
  derived from personal identifiers score lower. Threshold is env-driven
  via `ZXCVBN_MIN_SCORE` (default `3`).
- **HIBP** — `apps/auth-service/src/auth/hibp.service.ts` implements the
  Range API against `https://api.pwnedpasswords.com/range/{prefix}` with a
  500 ms timeout (`HIBP_TIMEOUT_MS`), the `Add-Padding: true` header so
  response size does not leak prefix popularity, and fail-open behaviour on
  network/timeout errors. Disabled in tests via `HIBP_ENABLED=false`; the
  real client is covered by `apps/auth-service/test/hibp.service.spec.ts`
  with a mocked fetch.

---

## 3. Rate limiting & lockout

### MUST
- Password login endpoint rate-limited per IP AND per account:
  - **Per account**: 5 failed attempts in 15 minutes → soft lock (require
    email-based unlock link). Successful login resets the counter.
  - **Per IP**: 10 failed attempts across any account in 15 minutes → 429
    with `Retry-After`.
- Return **the same error** for "wrong password" and "no such user" — do
  not leak account existence.
- Rate-limit signup and password-reset endpoints identically (attackers
  probe existence via these too).

### Implementation
- **Per-IP** — `apps/api-gateway/src/middleware/auth-rate-limit.middleware.ts`
  now covers `/auth/register`, `/auth/login`, `/auth/verify-email`,
  `/auth/verify-email/resend`, `/auth/unlock` with tight per-IP windows.
- **Per-email request rate** — `apps/auth-service/src/auth/email-throttler.service.ts`
  Redis-backed counter, one bucket per `(action, lower(email))`. Aggressive
  ceilings on register (5/h) and resend-verification (3/h) since those
  cause mailbox side effects.
- **Per-account soft-lock on failed passwords** —
  `apps/auth-service/src/auth/login-attempt-tracker.service.ts` counts
  failed `verify()` results per email; the 5th failure inside 15 min flips
  the account into a soft-lock state, drops the counter, and issues a
  single-use unlock token (32 bytes hex, TTL 1 h) alongside an
  `auth.account.locked` Kafka event. `POST /auth/unlock` consumes the
  token atomically via `GETDEL` (audit rule 3) and clears the lock.
- **Same generic 401** for wrong-email / wrong-password / OAuth-only
  account — enforced by unit + integration tests. Verification state
  (`EMAIL_NOT_VERIFIED`) is only revealed after the password check passes
  so it cannot be used to enumerate registered addresses.

---

## 4. Password reset flow

### MUST
- Reset tokens are single-use, expire after **1 hour**, cryptographically
  random ≥ 32 bytes, and stored in Redis (`pwreset:{token}` → userId) so
  they invalidate on server restart if needed.
- The reset link email must not expose the user's email address or ID in
  the URL — only the opaque token.
- Consuming a reset token invalidates all active sessions for that user
  (`session:{userId}` deletion, same pattern as `logout-all` per #66).

### Implementation
- **Authenticated password change** — `POST /auth/password/change` (#185).
  Verifies `currentPassword` with Argon2, refuses OAuth-only accounts with
  `NO_PASSWORD_SET`, runs the same zxcvbn + HIBP guards as register, plus
  a `SAME_PASSWORD` guard. On success, `deleteAllUserSessions` revokes
  every session (parity with `logout-all` per #66) and a fresh session is
  issued for the calling device so the user stays signed in on the tab
  they just used. Audit-logged via `@Audit()`.
- **Password reset via email** — not yet implemented (`pwreset:{token}`
  scheme is a follow-up in the #182 tree). The soft-lock unlock flow
  (`POST /auth/unlock`) uses the same single-use token shape and will
  share the reset-token infrastructure when it lands.

---

## 5. Coverage matrix

Every MUST above is verified by an automated test:

| Rule | Test file |
|------|-----------|
| Argon2id hash round-trip + wrong-password rejection | `apps/auth-service/test/login-password.integration.spec.ts` (login happy path + wrong password) |
| `needsRehash` triggers rehash-on-login | `apps/auth-service/test/login-password.integration.spec.ts` — "rehash-on-login (Argon2 policy migration)" |
| Length ≥ 12 enforced at DTO layer | `register-verify.integration.spec.ts` — "rejects a password shorter than 12 chars" |
| zxcvbn ≥ 3 enforced | `register-verify.integration.spec.ts` — "rejects a weak-but-long password via zxcvbn" |
| zxcvbn primes on user identifiers | `password-complexity.service.spec.ts` — "downgrades passwords derived from user email" |
| HIBP breach match rejected | `hibp.service.spec.ts` — "flags a breached password when the API response contains the suffix" |
| HIBP fails open on outage | `hibp.service.spec.ts` — "fails open on fetch throws" |
| Same 401 for wrong-user / wrong-password / OAuth-only | `login-password.integration.spec.ts` — three assertions with identical body |
| Per-account soft-lock after 5 failures | `login-password.integration.spec.ts` — "locks after the 5th failure" |
| Unlock token single-use via GETDEL | `login-password.integration.spec.ts` — "consumes a single-use token, clears the lock" |
| Timing-safe dummy-hash on missing user | Enforced structurally in `AuthService.loginWithPassword` (branch calls `hasher.compareDummy`) |
| Authenticated password change: OAuth-only refused | `apps/auth-service/test/password-change.integration.spec.ts` — "rejects OAuth-only accounts with 400 NO_PASSWORD_SET" |
| Password change: wrong current password → generic 401 | `password-change.integration.spec.ts` — "rejects wrong current password with generic 401" |
| Password change: same-password reuse guard | `password-change.integration.spec.ts` — "rejects reuse of the same password with 400 SAME_PASSWORD" |
| Password change: revokes every other session | `password-change.integration.spec.ts` — "revokes every prior session belonging to the user" |

---

## Related decisions

- **#60 / #61** — HttpOnly refresh cookie + CSRF double-submit. Password
  login reuses the same session-issuance path (`AuthService.generateTokens`)
  so cookies, CSRF token, and Redis session state stay uniform across
  auth methods.
- **#66** — `logout-all` endpoint. Password change (tracked as #185) must
  call the same session-purge routine.
- **#68** — Meta issue tracking remaining low-severity security items;
  this policy is Medium (#64).
- **#184** — Implementation PR for this policy.
