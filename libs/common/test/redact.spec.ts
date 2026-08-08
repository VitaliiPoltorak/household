import { maskId, redactForLog } from '../src/logging/redact';

describe('maskId', () => {
  it('returns ellipsis alone for null / undefined / empty', () => {
    expect(maskId(null)).toBe('…');
    expect(maskId(undefined)).toBe('…');
    expect(maskId('')).toBe('…');
  });

  it('shows last 4 characters of a UUID', () => {
    expect(maskId('550e8400-e29b-41d4-a716-446655440000')).toBe('…0000');
  });

  it('shows last 4 characters of an email (dot-tld tail is the trace slice)', () => {
    expect(maskId('user@example.com')).toBe('….com');
  });

  it('passes short values through with the ellipsis prefix', () => {
    expect(maskId('abc')).toBe('…abc');
    expect(maskId('a')).toBe('…a');
  });

  it('does not leak more than 4 chars regardless of input length', () => {
    const long = 'x'.repeat(1000);
    expect(maskId(long).length).toBeLessThanOrEqual(5); // '…' + 4 chars
  });
});

describe('redactForLog', () => {
  it('masks userId, email, token, authorization, password', () => {
    const input = {
      userId: '550e8400-e29b-41d4-a716-446655440000',
      email: 'user@example.com',
      token: 'jwt.token.value',
      accessToken: 'access.tok',
      refreshToken: 'refresh.tok',
      authorization: 'Bearer abc.def.ghi',
      password: 'hunter2',
      keepMe: 'visible',
    };
    const out = redactForLog(input);
    expect(out).toEqual({
      userId: '…0000',
      email: '….com',
      token: '…alue',
      accessToken: '….tok',
      refreshToken: '….tok',
      authorization: '….ghi',
      password: '…ter2',
      keepMe: 'visible',
    });
  });

  it('leaves non-sensitive fields untouched', () => {
    expect(redactForLog({ status: 200, path: '/api/v1/foo' })).toEqual({ status: 200, path: '/api/v1/foo' });
  });

  it('recurses into nested objects', () => {
    const out = redactForLog({ meta: { userId: 'abcdef1234', other: 'x' } });
    expect(out).toEqual({ meta: { userId: '…1234', other: 'x' } });
  });

  it('handles arrays of objects', () => {
    const out = redactForLog([{ userId: 'aaa1' }, { userId: 'bbb2' }]);
    expect(out).toEqual([{ userId: '…aaa1' }, { userId: '…bbb2' }]);
  });

  it('replaces non-string sensitive values with [REDACTED]', () => {
    const out = redactForLog({ token: { nested: 'x' } });
    expect(out).toEqual({ token: '[REDACTED]' });
  });

  it('passes primitives through unchanged', () => {
    expect(redactForLog('hello')).toBe('hello');
    expect(redactForLog(42)).toBe(42);
    expect(redactForLog(null)).toBe(null);
  });
});
