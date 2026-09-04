/**
 * Remembers which address is mid-verification so /verify-email survives a
 * reload (#320).
 *
 * Before this, the email lived only in react-router nav state: reloading the
 * page, or opening /verify-email directly, dropped it and the page bounced to
 * /register — where the same address now returns 409, because the (unverified)
 * user row already exists. That left no way forward at all.
 *
 * sessionStorage rather than the URL: a query param would put the address into
 * browser history, referrer headers and any access log in front of the app,
 * for a value the user can simply retype. It is scoped to the tab and cleared
 * as soon as verification succeeds. When it is empty — a fresh tab, a
 * different device, a browser that blocks storage — VerifyEmailPage asks for
 * the address instead of redirecting away.
 */
const KEY = 'household.pendingVerificationEmail';

/** Every access is guarded: Safari private mode throws on storage access. */
export function readPendingVerificationEmail(): string {
  try {
    return sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function rememberPendingVerificationEmail(email: string): void {
  try {
    sessionStorage.setItem(KEY, email);
  } catch {
    // Storage unavailable — the page falls back to asking for the address.
  }
}

export function clearPendingVerificationEmail(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clean up if we could never write in the first place.
  }
}
