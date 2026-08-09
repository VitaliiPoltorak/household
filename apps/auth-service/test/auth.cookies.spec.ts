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
      const encoded = encodeRefreshCookie({ sessionId: 'sess-1', refreshToken: 'r-token-abc' });
      expect(decodeRefreshCookie(encoded)).toEqual({ sessionId: 'sess-1', refreshToken: 'r-token-abc' });
    });

    it('produces a base64url string with no padding pitfalls', () => {
      const encoded = encodeRefreshCookie({ sessionId: 's', refreshToken: 't' });
      // base64url uses -_ instead of +/ and drops = padding
      expect(encoded).not.toMatch(/[+/=]/);
    });

    it('returns null for undefined / empty input', () => {
      expect(decodeRefreshCookie(undefined)).toBeNull();
      expect(decodeRefreshCookie('')).toBeNull();
    });

    it('returns null for values missing the separator', () => {
      const noDot = Buffer.from('no-separator-here', 'utf8').toString('base64url');
      expect(decodeRefreshCookie(noDot)).toBeNull();
    });

    it('returns null when either half is empty', () => {
      const emptyToken = Buffer.from('sess-1.', 'utf8').toString('base64url');
      const emptySession = Buffer.from('.r-token', 'utf8').toString('base64url');
      expect(decodeRefreshCookie(emptyToken)).toBeNull();
      expect(decodeRefreshCookie(emptySession)).toBeNull();
    });

    it('handles refresh tokens that contain dots', () => {
      // UUID tokens don't have dots but JWTs do — future-proofing.
      const encoded = encodeRefreshCookie({ sessionId: 'sess-1', refreshToken: 'a.b.c' });
      expect(decodeRefreshCookie(encoded)).toEqual({ sessionId: 'sess-1', refreshToken: 'a.b.c' });
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
    it('sets both cookies with Path, SameSite=none, Secure by default', () => {
      const cookie = jest.fn();
      const res = { cookie } as unknown as Response;

      setAuthCookies(res, { sessionId: 's', refreshToken: 't' }, 'csrf-value', { maxAgeSec: 60 });

      const refreshCall = cookie.mock.calls.find((c) => c[0] === REFRESH_COOKIE);
      const csrfCall = cookie.mock.calls.find((c) => c[0] === CSRF_COOKIE);
      expect(refreshCall).toBeDefined();
      expect(csrfCall).toBeDefined();

      // refresh cookie is HttpOnly, csrf is not (needs to be JS-readable for double-submit)
      expect(refreshCall![2]).toMatchObject({ httpOnly: true, secure: true, sameSite: 'none', path: '/api/v1/auth', maxAge: 60_000 });
      expect(csrfCall![2]).toMatchObject({ httpOnly: false, secure: true, sameSite: 'none', path: '/api/v1/auth', maxAge: 60_000 });
    });

    it('allows secure:false for local dev over HTTP', () => {
      const cookie = jest.fn();
      const res = { cookie } as unknown as Response;

      setAuthCookies(res, { sessionId: 's', refreshToken: 't' }, 'csrf', { maxAgeSec: 60, secure: false });

      expect(cookie.mock.calls[0][2].secure).toBe(false);
    });
  });

  describe('clearAuthCookies', () => {
    it('overwrites both cookies with empty value and maxAge 0', () => {
      const cookie = jest.fn();
      const res = { cookie } as unknown as Response;

      clearAuthCookies(res);

      expect(cookie).toHaveBeenCalledWith(REFRESH_COOKIE, '', expect.objectContaining({ maxAge: 0, httpOnly: true }));
      expect(cookie).toHaveBeenCalledWith(CSRF_COOKIE, '', expect.objectContaining({ maxAge: 0, httpOnly: false }));
    });
  });

  describe('readRefreshCookie', () => {
    it('returns the decoded payload when cookie is present', () => {
      const req = {
        cookies: { [REFRESH_COOKIE]: encodeRefreshCookie({ sessionId: 's', refreshToken: 't' }) },
      } as unknown as Request;

      expect(readRefreshCookie(req)).toEqual({ sessionId: 's', refreshToken: 't' });
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
