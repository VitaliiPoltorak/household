import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { ServerResponse } from 'http';

interface ProxyRoute {
  prefix: string;
  envKey: string;
  defaultUrl: string;
  rewrites: Record<string, string>;
}

// Express strips the mount prefix before passing req.url to middleware.
// So app.use('/api/v1/auth', proxy) means the proxy sees '/google', not '/api/v1/auth/google'.
// pathRewrite must prepend the service-level prefix to the already-stripped path.
const ROUTES: ProxyRoute[] = [
  {
    prefix: '/api/v1/auth',
    envKey: 'AUTH_SERVICE_URL',
    defaultUrl: 'http://localhost:3001',
    rewrites: { '^': '/auth' },
  },
  {
    prefix: '/api/v1/households',
    envKey: 'HOUSEHOLD_SERVICE_URL',
    defaultUrl: 'http://localhost:3002',
    rewrites: { '^': '/households' },
  },
  {
    prefix: '/api/v1/invites',
    envKey: 'HOUSEHOLD_SERVICE_URL',
    defaultUrl: 'http://localhost:3002',
    rewrites: { '^': '/invites' },
  },
  {
    prefix: '/api/v1/accounts',
    envKey: 'FINANCE_SERVICE_URL',
    defaultUrl: 'http://localhost:3003',
    rewrites: { '^': '/accounts' },
  },
  {
    prefix: '/api/v1/transactions',
    envKey: 'FINANCE_SERVICE_URL',
    defaultUrl: 'http://localhost:3003',
    rewrites: { '^': '/transactions' },
  },
  {
    prefix: '/api/v1/categories',
    envKey: 'FINANCE_SERVICE_URL',
    defaultUrl: 'http://localhost:3003',
    rewrites: { '^': '/categories' },
  },
  {
    prefix: '/api/v1/income-sources',
    envKey: 'FINANCE_SERVICE_URL',
    defaultUrl: 'http://localhost:3003',
    rewrites: { '^': '/income-sources' },
  },
  {
    prefix: '/api/v1/recurring-payments',
    envKey: 'FINANCE_SERVICE_URL',
    defaultUrl: 'http://localhost:3003',
    rewrites: { '^': '/recurring-payments' },
  },
  {
    prefix: '/api/v1/stores',
    envKey: 'SHOPPING_SERVICE_URL',
    defaultUrl: 'http://localhost:3004',
    rewrites: { '^': '/stores' },
  },
  {
    prefix: '/api/v1/products',
    envKey: 'SHOPPING_SERVICE_URL',
    defaultUrl: 'http://localhost:3004',
    rewrites: { '^': '/products' },
  },
  {
    prefix: '/api/v1/shopping-lists',
    envKey: 'SHOPPING_SERVICE_URL',
    defaultUrl: 'http://localhost:3004',
    rewrites: { '^': '/shopping-lists' },
  },
];

export function setupProxies(app: INestApplication) {
  const config = app.get(ConfigService);
  const logger = new Logger('Proxy');

  for (const route of ROUTES) {
    const target = config.get<string>(route.envKey, route.defaultUrl);

    app.use(
      route.prefix,
      createProxyMiddleware({
        target,
        changeOrigin: true,
        pathRewrite: route.rewrites,
        timeout: 10_000,
        proxyTimeout: 10_000,
        on: {
          proxyReq: (proxyReq, req: any) => {
            if (req.user?.sub) {
              proxyReq.setHeader('X-User-Id', req.user.sub);
            }
            if (req.user?.email) {
              proxyReq.setHeader('X-User-Email', req.user.email);
            }
            if (req.householdId) {
              proxyReq.setHeader('X-Household-Id', req.householdId);
            }
          },
          error: (err, _req, res) => {
            logger.error(`Proxy error to ${target}: ${err.message}`);
            const response = res as ServerResponse;
            if (!response.headersSent) {
              response.writeHead(502, { 'Content-Type': 'application/json' });
              response.end(
                JSON.stringify({
                  statusCode: 502,
                  message: `Service unavailable: ${route.prefix}`,
                  error: 'Bad Gateway',
                  timestamp: new Date().toISOString(),
                }),
              );
            }
          },
        },
      }),
    );

    logger.log(`${route.prefix} → ${target}`);
  }
}
