import type { Request, Response } from 'express';
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  REFRESH_COOKIE,
  clearAuthCookies,
  decodeRefreshCookie,
  encodeRefreshCookie,
  generateCsrfToken,
  readRefreshCookie,
  setAuthCookies,
  verifyCsrf,
} from '../src/auth/cookies';

describe('cookies (#60/#61)', () => {
  describe('encodeRefreshCookie / decodeRefreshCookie', () => {
    it('round-trips sessionId + refreshToken', () => {
      const encoded = encodeRefreshCookie({
        sessionId: 'sess-1',
        refreshToken: 'r-token-abc',
      });
      expect(decodeRefreshCookie(encoded)).toEqual({
        sessionId: 'sess-1',
        refreshToken: 'r-token-abc',
      });
    });

    it('produces a base64url string with no padding pitfalls', () => {
      const encoded = encodeRefreshCookie({
        sessionId: 's',
        refreshToken: 't',
      });
      // base64url uses -_ instead of +/ and drops = padding
      expect(encoded).not.toMatch(/[+/=]/);
    });

    it('returns null for undefined / empty input', () => {
      expect(decodeRefreshCookie(undefined)).toBeNull();
      expect(decodeRefreshCookie('')).toBeNull();
    });

    it('returns null for values missing the separator', () => {
      const noDot = Buffer.from('no-separator-here', 'utf8').toString(
        'base64url',
      );
      expect(decodeRefreshCookie(noDot)).toBeNull();
    });

    it('returns null when either half is empty', () => {
      const emptyToken = Buffer.from('sess-1.', 'utf8').toString('base64url');
      const emptySession = Buffer.from('.r-token', 'utf8').toString(
        'base64url',
      );
      expect(decodeRefreshCookie(emptyToken)).toBeNull();
      expect(decodeRefreshCookie(emptySession)).toBeNull();
    });

    it('handles refresh tokens that contain dots', () => {
      // UUID tokens don't have dots but JWTs do — future-proofing.
      const encoded = encodeRefreshCookie({
        sessionId: 'sess-1',
        refreshToken: 'a.b.c',
      });
      expect(decodeRefreshCookie(encoded)).toEqual({
        sessionId: 'sess-1',
        refreshToken: 'a.b.c',
      });
    });
  });

  describe('generateCsrfToken', () => {
    it('produces a 64-char hex string (32 bytes)', () => {
      const t = generateCsrfToken();
      expect(t).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is unique per call', () => {
      const a = generateCsrfToken();
      const b = generateCsrfToken();
      expect(a).not.toBe(b);
    });
  });

  describe('setAuthCookies', () => {
    it('sets both cookies with SameSite=none, Secure by default and different Paths', () => {
      const cookie = jest.fn();
      const res = { cookie } as unknown as Response;

      setAuthCookies(res, { sessionId: 's', refreshToken: 't' }, 'csrf-value', {
        maxAgeSec: 60,
      });

      const refreshCall = cookie.mock.calls.find(
        (c) => c[0] === REFRESH_COOKIE,
      );
      const csrfCall = cookie.mock.calls.find((c) => c[0] === CSRF_COOKIE);
      expect(refreshCall).toBeDefined();
      expect(csrfCall).toBeDefined();

      // Refresh cookie is HttpOnly and scoped to /api/v1/auth — never rides
      // regular API requests, only reaches the auth endpoints that need it.
      expect(refreshCall![2]).toMatchObject({
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/api/v1/auth',
        maxAge: 60_000,
      });
      // CSRF cookie is Path=/ so document.cookie on the SPA (which lives at
      // /, /dashboard, /accounts…) can read it. If we ever scope it back to
      // /api/v1/auth the auto-refresh flow breaks silently on F5 —
      // readCsrfCookie() would return null and AuthContext skips refresh.
      expect(csrfCall![2]).toMatchObject({
        httpOnly: false,
        secure: true,
        sameSite: 'none',
        path: '/',
        maxAge: 60_000,
      });
    });

    it('falls back to SameSite=Lax when secure:false (#193)', () => {
      // SameSite=None without Secure is an invalid combination — browsers
      // silently drop the Set-Cookie header instead of erroring, which
      // previously meant neither cookie was ever actually stored in dev
      // (AUTH_COOKIE_SECURE=false), producing an "F5 logs me out" symptom
      // even though the cookie Path scoping (#60/#61) was correct.
      const cookie = jest.fn();
      const res = { cookie } as unknown as Response;

      setAuthCookies(res, { sessionId: 's', refreshToken: 't' }, 'csrf', {
        maxAgeSec: 60,
        secure: false,
      });

      const refreshCall = cookie.mock.calls.find(
        (c) => c[0] === REFRESH_COOKIE,
      );
      const csrfCall = cookie.mock.calls.find((c) => c[0] === CSRF_COOKIE);
      expect(refreshCall![2]).toMatchObject({ secure: false, sameSite: 'lax' });
      expect(csrfCall![2]).toMatchObject({ secure: false, sameSite: 'lax' });
    });
  });

  describe('clearAuthCookies', () => {
    it('overwrites each cookie with empty value + maxAge 0 using its own Path', () => {
      const cookie = jest.fn();
      const res = { cookie } as unknown as Response;

      clearAuthCookies(res);

      // Browser identifies cookies by (name, domain, path) — clearing with
      // the wrong path leaves the real cookie in place. This test locks in
      // that we clear on the exact paths we set.
      expect(cookie).toHaveBeenCalledWith(
        REFRESH_COOKIE,
        '',
        expect.objectContaining({
          maxAge: 0,
          httpOnly: true,
          path: '/api/v1/auth',
        }),
      );
      expect(cookie).toHaveBeenCalledWith(
        CSRF_COOKIE,
        '',
        expect.objectContaining({ maxAge: 0, httpOnly: false, path: '/' }),
      );
    });

    it('clears with SameSite=Lax when secure:false, matching what setAuthCookies set (#193)', () => {
      // Must mirror setAuthCookies' SameSite choice — the browser keys a
      // cookie on (name, domain, path, sameSite among other attrs); clearing
      // with a mismatched SameSite can fail to overwrite the original.
      const cookie = jest.fn();
      const res = { cookie } as unknown as Response;

      clearAuthCookies(res, { secure: false });

      expect(cookie).toHaveBeenCalledWith(
        REFRESH_COOKIE,
        '',
        expect.objectContaining({ secure: false, sameSite: 'lax' }),
      );
      expect(cookie).toHaveBeenCalledWith(
        CSRF_COOKIE,
        '',
        expect.objectContaining({ secure: false, sameSite: 'lax' }),
      );
    });
  });

  describe('readRefreshCookie', () => {
    it('returns the decoded payload when cookie is present', () => {
      const req = {
        cookies: {
          [REFRESH_COOKIE]: encodeRefreshCookie({
            sessionId: 's',
            refreshToken: 't',
          }),
        },
      } as unknown as Request;

      expect(readRefreshCookie(req)).toEqual({
        sessionId: 's',
        refreshToken: 't',
      });
    });

    it('returns null when cookie is missing', () => {
      const req = { cookies: {} } as unknown as Request;
      expect(readRefreshCookie(req)).toBeNull();
    });

    it('returns null when req has no cookies at all (cookie-parser not installed)', () => {
      const req = {} as unknown as Request;
      expect(readRefreshCookie(req)).toBeNull();
    });
  });

  describe('verifyCsrf', () => {
    it('accepts matching cookie and header', () => {
      const req = {
        cookies: { [CSRF_COOKIE]: 'abc123' },
        headers: { [CSRF_HEADER]: 'abc123' },
      } as unknown as Request;
      expect(verifyCsrf(req)).toBe(true);
    });

    it('rejects when header missing', () => {
      const req = {
        cookies: { [CSRF_COOKIE]: 'abc' },
        headers: {},
      } as unknown as Request;
      expect(verifyCsrf(req)).toBe(false);
    });

    it('rejects when cookie missing', () => {
      const req = {
        cookies: {},
        headers: { [CSRF_HEADER]: 'abc' },
      } as unknown as Request;
      expect(verifyCsrf(req)).toBe(false);
    });

    it('rejects when values differ (forged header)', () => {
      const req = {
        cookies: { [CSRF_COOKIE]: 'abc' },
        headers: { [CSRF_HEADER]: 'xyz' },
      } as unknown as Request;
      expect(verifyCsrf(req)).toBe(false);
    });
  });
});
