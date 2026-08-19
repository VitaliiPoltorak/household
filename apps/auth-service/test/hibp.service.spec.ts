import type { ConfigService } from '@nestjs/config';
import { HibpService } from '../src/auth/hibp.service';

/**
 * Unit tests for the HIBP client. Uses a stubbed global fetch — no real
 * network calls. The integration suite bypasses HIBP entirely via
 * HIBP_ENABLED=false; this spec is the only place the real fetch path is
 * exercised, so it must cover every branch (breached, not breached, HTTP
 * error, timeout, HIBP disabled).
 */

const makeConfig = (overrides: Record<string, string | undefined> = {}) => {
  return {
    get: (key: string, fallback?: unknown) =>
      overrides[key] ?? (fallback as unknown),
  } as unknown as ConfigService;
};

// SHA-1('password') = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
// Prefix "5BAA6", suffix "1E4C9B93F3F0682250B6CF8331B7EE68FD8"
const PASSWORD_HASH_SUFFIX = '1E4C9B93F3F0682250B6CF8331B7EE68FD8';

describe('HibpService', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('short-circuits to not-breached when HIBP_ENABLED=false', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const svc = new HibpService(makeConfig({ HIBP_ENABLED: 'false' }));

    await expect(svc.check('password')).resolves.toEqual({ breached: false, count: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('flags a breached password when the API response contains the suffix', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => `SOMEOTHER:5\r\n${PASSWORD_HASH_SUFFIX}:12345\r\n`,
    }) as unknown as typeof fetch;
    const svc = new HibpService(makeConfig({ HIBP_ENABLED: 'true' }));

    const result = await svc.check('password');
    expect(result).toEqual({ breached: true, count: 12345 });
  });

  it('returns not-breached when the suffix is absent from the API response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => `AAAAAAAAAAAA:5\r\nBBBBBBBBBBBB:2\r\n`,
    }) as unknown as typeof fetch;
    const svc = new HibpService(makeConfig({ HIBP_ENABLED: 'true' }));

    await expect(svc.check('a-fresh-passphrase')).resolves.toEqual({ breached: false, count: 0 });
  });

  it('is case-insensitive on the suffix comparison', async () => {
    // HIBP returns uppercase hex — but be defensive against a mirror that
    // lowercases everything.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => `${PASSWORD_HASH_SUFFIX.toLowerCase()}:99\r\n`,
    }) as unknown as typeof fetch;
    const svc = new HibpService(makeConfig({ HIBP_ENABLED: 'true' }));

    await expect(svc.check('password')).resolves.toEqual({ breached: true, count: 99 });
  });

  it('fails open (allows the password) on non-200 responses', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => '',
    }) as unknown as typeof fetch;
    const svc = new HibpService(makeConfig({ HIBP_ENABLED: 'true' }));

    await expect(svc.check('password')).resolves.toEqual({ breached: false, count: 0 });
  });

  it('fails open on fetch throws (network error / timeout / DNS)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    const svc = new HibpService(makeConfig({ HIBP_ENABLED: 'true' }));

    await expect(svc.check('password')).resolves.toEqual({ breached: false, count: 0 });
  });

  it('sends only the SHA-1 prefix — the plaintext never leaves this process', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
    });
    global.fetch = fetchSpy as unknown as typeof fetch;
    const svc = new HibpService(makeConfig({ HIBP_ENABLED: 'true' }));

    await svc.check('password');

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toMatch(/\/5BAA6$/); // prefix only, nothing after
    expect(url).not.toContain(PASSWORD_HASH_SUFFIX);
  });

  it('sets Add-Padding header so response size does not leak prefix popularity', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
    });
    global.fetch = fetchSpy as unknown as typeof fetch;
    const svc = new HibpService(makeConfig({ HIBP_ENABLED: 'true' }));

    await svc.check('password');

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers).toMatchObject({ 'Add-Padding': 'true' });
  });
});
