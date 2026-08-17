import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';

/**
 * HttpOnly cookie flow for refresh tokens (#60) and double-submit CSRF (#61).
 *
 * Two cookies are stamped together on every login/refresh, with **different
 * Path scopes on purpose**:
 *
 * - `household_refresh` (HttpOnly, Secure, SameSite=None, Path=/api/v1/auth)
 *     Base64 of `${sessionId}.${refreshToken}` — HttpOnly means no JS can read
 *     it, closing the XSS-exfiltration path localStorage had. Path scopes it
 *     to auth endpoints only so regular API calls don't carry it around.
 *
 * - `household_csrf` (Secure, SameSite=None, Path=/) — NOT HttpOnly
 *     A random opaque value the SPA reads via document.cookie and echoes back
 *     in the `X-CSRF-Token` header on /auth/refresh. Cross-origin attackers
 *     can't read the cookie (Same-Origin Policy), so can't forge the header.
 *     Path=/ is required: the SPA lives at `/`, `/dashboard`, `/accounts` etc.
 *     and `document.cookie` only exposes cookies whose Path is a prefix of
 *     the current URL. If we scoped this to /api/v1/auth (as originally),
 *     the SPA would never see it on any real page, `readCsrfCookie()` would
 *     return null, and the auto-refresh flow would silently give up — the
 *     symptom users hit as "F5 logs me out even though the refresh cookie
 *     is still valid".
 *
 * SameSite=None is a deliberate choice for the cross-domain deployment
 * (`app.foo.com` + `api.bar.com`). It requires CSRF as above.
 */

export const REFRESH_COOKIE = 'household_refresh';
export const CSRF_COOKIE = 'household_csrf';
export const CSRF_HEADER = 'x-csrf-token';

// Refresh cookie is secret and only needed by auth endpoints. Narrow scope
// keeps it out of every other request.
const REFRESH_PATH = '/api/v1/auth';
// CSRF cookie is not secret (its whole job is to be readable by JS) and MUST
// be visible on SPA pages so the double-submit token can be echoed back.
const CSRF_PATH = '/';

interface CookiePayload {
  sessionId: string;
  refreshToken: string;
}

interface SetCookieOpts {
  maxAgeSec: number;
  // In tests / dev-over-http we may need to relax Secure. Default true.
  secure?: boolean;
}

export function encodeRefreshCookie(payload: CookiePayload): string {
  return Buffer.from(`${payload.sessionId}.${payload.refreshToken}`, 'utf8').toString('base64url');
}

// Returns null on any parse failure. Callers should treat null as "no valid
// cookie" and respond 401 without leaking the reason.
export function decodeRefreshCookie(raw: string | undefined): CookiePayload | null {
  if (!raw) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const dotIndex = decoded.indexOf('.');
  if (dotIndex <= 0 || dotIndex === decoded.length - 1) return null;
  const sessionId = decoded.slice(0, dotIndex);
  const refreshToken = decoded.slice(dotIndex + 1);
  if (!sessionId || !refreshToken) return null;
  return { sessionId, refreshToken };
}

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

export function setAuthCookies(
  res: Response,
  payload: CookiePayload,
  csrfToken: string,
  opts: SetCookieOpts,
): void {
  const common = {
    secure: opts.secure ?? true,
    sameSite: 'none' as const,
    maxAge: opts.maxAgeSec * 1000,
  };
  res.cookie(REFRESH_COOKIE, encodeRefreshCookie(payload), {
    ...common,
    path: REFRESH_PATH,
    httpOnly: true,
  });
  res.cookie(CSRF_COOKIE, csrfToken, {
    ...common,
    path: CSRF_PATH,
    httpOnly: false,
  });
}

export function clearAuthCookies(res: Response, opts: { secure?: boolean } = {}): void {
  const common = {
    secure: opts.secure ?? true,
    sameSite: 'none' as const,
    maxAge: 0,
  };
  // Each cookie must be cleared with the *same* Path it was set on — the
  // browser keys on (name, domain, path) so a mismatched path leaves the
  // real cookie in place.
  res.cookie(REFRESH_COOKIE, '', { ...common, path: REFRESH_PATH, httpOnly: true });
  res.cookie(CSRF_COOKIE, '', { ...common, path: CSRF_PATH, httpOnly: false });
}

export function readRefreshCookie(req: Request): CookiePayload | null {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  return decodeRefreshCookie(cookies?.[REFRESH_COOKIE]);
}

/**
 * Double-submit CSRF: the cookie value and the header value must match. The
 * cookie itself is set with SameSite=None so it does ride cross-site requests,
 * but a cross-origin attacker cannot READ it (SOP) — so they can't put the
 * matching value in a header. Comparing them proves the caller is same-origin.
 */
export function verifyCsrf(req: Request): boolean {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const cookieToken = cookies?.[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER];
  if (!cookieToken || !headerToken) return false;
  const headerValue = Array.isArray(headerToken) ? headerToken[0] : headerToken;
  // Timing-safe compare would be nice but token isn't secret at rest — the
  // whole security property is "attacker doesn't know it, not "attacker
  // times it".
  return cookieToken === headerValue;
}
