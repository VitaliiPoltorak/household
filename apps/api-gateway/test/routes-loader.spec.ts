import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadProxyRoutes } from '../src/proxy/routes-loader';

function config(values: Record<string, string> = {}): any {
  return {
    get: (key: string) => values[key],
  };
}

describe('loadProxyRoutes', () => {
  describe('default (bundled) routes', () => {
    it('returns the bundled routes.default.json when no env is set', () => {
      const routes = loadProxyRoutes(config());
      expect(routes.length).toBeGreaterThan(0);
      // Sanity: at least the auth route is there
      expect(routes.find((r) => r.prefix === '/api/v1/auth')).toBeDefined();
    });

    it('bundled routes all have required fields', () => {
      const routes = loadProxyRoutes(config());
      for (const r of routes) {
        expect(typeof r.prefix).toBe('string');
        expect(typeof r.envKey).toBe('string');
        expect(typeof r.defaultUrl).toBe('string');
        expect(typeof r.rewrites).toBe('object');
      }
    });

    it('bundled routes have no duplicate prefixes', () => {
      const routes = loadProxyRoutes(config());
      const prefixes = routes.map((r) => r.prefix);
      expect(new Set(prefixes).size).toBe(prefixes.length);
    });
  });

  describe('PROXY_ROUTES_JSON precedence', () => {
    it('parses inline env override', () => {
      const inline = JSON.stringify([
        {
          prefix: '/api/v1/foo',
          envKey: 'FOO_URL',
          defaultUrl: 'http://foo:3000',
          rewrites: { '^': '/foo' },
        },
      ]);
      const routes = loadProxyRoutes(config({ PROXY_ROUTES_JSON: inline }));
      expect(routes).toHaveLength(1);
      expect(routes[0].prefix).toBe('/api/v1/foo');
    });

    it('inline env wins over file path', () => {
      const inline = JSON.stringify([
        { prefix: '/inline', envKey: 'E', defaultUrl: 'http://a', rewrites: {} },
      ]);
      const routes = loadProxyRoutes(
        config({ PROXY_ROUTES_JSON: inline, PROXY_ROUTES_PATH: '/does/not/exist.json' }),
      );
      expect(routes[0].prefix).toBe('/inline');
    });
  });

  describe('PROXY_ROUTES_PATH', () => {
    it('reads and parses a file at the given path', () => {
      const tmp = path.join(os.tmpdir(), `proxy-routes-${Date.now()}.json`);
      fs.writeFileSync(
        tmp,
        JSON.stringify([
          { prefix: '/api/v1/bar', envKey: 'BAR_URL', defaultUrl: 'http://bar', rewrites: { '^': '/bar' } },
        ]),
      );
      try {
        const routes = loadProxyRoutes(config({ PROXY_ROUTES_PATH: tmp }));
        expect(routes[0].prefix).toBe('/api/v1/bar');
      } finally {
        fs.unlinkSync(tmp);
      }
    });

    it('throws a clear error when the file is unreadable', () => {
      expect(() =>
        loadProxyRoutes(config({ PROXY_ROUTES_PATH: '/tmp/does-not-exist-abcxyz.json' })),
      ).toThrow(/Failed to read PROXY_ROUTES_PATH/);
    });
  });

  describe('validation', () => {
    it('rejects invalid JSON', () => {
      expect(() =>
        loadProxyRoutes(config({ PROXY_ROUTES_JSON: '{not json' })),
      ).toThrow(/invalid JSON/);
    });

    it('rejects non-array', () => {
      expect(() =>
        loadProxyRoutes(config({ PROXY_ROUTES_JSON: '{}' })),
      ).toThrow(/non-empty array/);
    });

    it('rejects empty array', () => {
      expect(() =>
        loadProxyRoutes(config({ PROXY_ROUTES_JSON: '[]' })),
      ).toThrow(/non-empty array/);
    });

    it('rejects missing required fields', () => {
      const bad = JSON.stringify([{ prefix: '/x', envKey: 'X_URL' }]);
      expect(() =>
        loadProxyRoutes(config({ PROXY_ROUTES_JSON: bad })),
      ).toThrow(/missing string 'defaultUrl'/);
    });

    it('rejects duplicate prefixes', () => {
      const dup = JSON.stringify([
        { prefix: '/dupe', envKey: 'A', defaultUrl: 'http://a', rewrites: {} },
        { prefix: '/dupe', envKey: 'B', defaultUrl: 'http://b', rewrites: {} },
      ]);
      expect(() =>
        loadProxyRoutes(config({ PROXY_ROUTES_JSON: dup })),
      ).toThrow(/duplicate prefix '\/dupe'/);
    });

    it('rejects rewrites as array (not a plain object)', () => {
      const bad = JSON.stringify([
        { prefix: '/x', envKey: 'X', defaultUrl: 'http://x', rewrites: [] },
      ]);
      expect(() =>
        loadProxyRoutes(config({ PROXY_ROUTES_JSON: bad })),
      ).toThrow(/missing object 'rewrites'/);
    });
  });
});
