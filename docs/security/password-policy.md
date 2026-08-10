# Password policy

> Status: **specification** — password login is not implemented. This document
> defines the rules that will be enforced *before* any password code lands.
> Tracks issue #64.

## Why this exists first

The system is OAuth-only today (Google / Apple / Facebook — see `apps/auth-service`).
Password login has not been implemented and is not a Phase 0–4 goal. But the
security audit (2026-08) flagged that adding it later without a documented
policy invites the usual mistakes: bcrypt-cost-8 defaults, no breach check,
unbounded retry. Writing the policy now means whoever picks up the work
starts from a defined baseline instead of googling `bcrypt vs argon2` at the
keyboard.

**Rule for any future PR that adds password auth:** it MUST link this
document and demonstrate compliance with every "MUST" below in its test
plan. A partial implementation (e.g. "hashing done, breach check TODO") is
not shippable — an incomplete password policy is worse than none at all.

---

## 1. Hashing

### MUST
- **Argon2id** with parameters at or above OWASP 2024 recommendations:
  - `memory: 19 MiB` (19456)
  - `iterations: 2`
  - `parallelism: 1`
  - `hashLength: 32`
  - `saltLength: 16`
- Never store, log, or emit the plaintext password anywhere, including
  request logs, error messages, or Kafka events.
- Rehash on login if the stored parameters fall below current policy
  (Argon2's `needsRehash` helper is designed for exactly this).

### Rationale
Argon2id is the OWASP first-choice password hash and the winner of the
Password Hashing Competition. It's memory-hard, which makes GPU/ASIC attacks
substantially more expensive than for bcrypt/scrypt at equivalent CPU cost.
Argon2**id** specifically (vs `i` or `d`) is the hybrid variant recommended
against both side-channel and GPU attacks.

### Fallback
If Argon2 cannot be adopted for a specific runtime constraint, **bcrypt with
cost ≥ 12** is acceptable. This must be an explicit exception documented in
the PR that introduces it. Do not silently choose bcrypt because it "looks
simpler."

### Reference package
`argon2` on npm (native binding, actively maintained, used in production by
Node.js LTS-based systems). Not `argon2-browser` (WASM, slower, unnecessary
here since hashing is server-side only).

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

### Reference packages
- `zxcvbn` (Dropbox library, deprecated but functionally complete) or
  `@zxcvbn-ts/core` (TypeScript rewrite, actively maintained).
- No HIBP client dependency needed — the Range API is a plain HTTP GET;
  wrap it in a small service with a 500ms timeout and fail-open (allow the
  password if HIBP is unreachable, log the incident).

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

### Reference implementation
The rate limiting already exists for OAuth callbacks (see
`apps/api-gateway/src/rate-limit` and the middleware wired in
`app.module.ts`). Extend the same Redis-backed limiter to the future
`/auth/password/login`, `/auth/password/signup`, `/auth/password/reset-*`
routes rather than introducing a second mechanism.

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

---

## 5. Testing checklist for the future implementer

When password login is added, the PR must include:

- [ ] Argon2id hashing round-trip test (hash → verify → verify wrong → false)
- [ ] `needsRehash` test — verify a lower-parameter hash triggers a rehash
      on next login
- [ ] Complexity validator unit tests: length < 12 rejected, zxcvbn < 3
      rejected, HIBP-matched password rejected (mock the API)
- [ ] Rate-limit integration test: 6th failed attempt inside 15 min → 429
- [ ] Timing-attack test: response time for "wrong password" ≈ response
      time for "no such user" (both should hash a dummy password to
      equalise)
- [ ] Password reset flow: token single-use, expires, invalidates sessions

---

## Related decisions

- **#60 / #61** — HttpOnly refresh cookie + CSRF double-submit. Password
  login MUST reuse the same session-issuance path (`AuthService.issueSession`)
  so cookies, CSRF token, and Redis session state stay uniform across auth
  methods.
- **#66** — `logout-all` endpoint. Password change MUST call the same
  session-purge routine (parity with reset above).
- **#68** — Meta issue tracking remaining low-severity security items;
  this policy is Medium (#64).
