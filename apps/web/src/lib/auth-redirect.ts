// Single source of truth for the "where was the user trying to go before
// auth interrupted them" handoff. Written by MigrationBanner (forced
// re-auth) and InviteAcceptPage (must be signed in to accept), consumed by
// LoginPage and VerifyEmailPage once the user is authenticated.
const RETURN_TO_KEY = 'auth:return_to';

// Only accept in-app paths — prevents an open-redirect if the stored value
// is somehow tampered with (e.g. via a shared/synced browser profile).
const isInAppPath = (path: string): boolean => path.startsWith('/');

export function setReturnTo(path: string): void {
  if (isInAppPath(path)) sessionStorage.setItem(RETURN_TO_KEY, path);
}

export function consumeReturnTo(fallback = '/dashboard'): string {
  const stored = sessionStorage.getItem(RETURN_TO_KEY);
  sessionStorage.removeItem(RETURN_TO_KEY);
  return stored && isInAppPath(stored) ? stored : fallback;
}
