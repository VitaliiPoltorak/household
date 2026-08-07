import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { ServerResponse } from 'http';
import { computeSignature, SIGNATURE_HEADER, TIMESTAMP_HEADER } from '@household/common';

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
    prefix: '/api/v1/reports',
    envKey: 'FINANCE_SERVICE_URL',
    defaultUrl: 'http://localhost:3003',
    rewrites: { '^': '/reports' },
  },
  {
    prefix: '/api/v1/rates',
    envKey: 'FINANCE_SERVICE_URL',
    defaultUrl: 'http://localhost:3003',
    rewrites: { '^': '/rates' },
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
  const signingSecret = config.get<string>('GATEWAY_SIGNING_SECRET');

  if (!signingSecret) {
    logger.warn(
      'GATEWAY_SIGNING_SECRET is not set — proxied requests will NOT be signed. Services will accept them only if they also run without the secret. Do not do this in production.',
    );
  }

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
            const userId = req.user?.sub as string | undefined;
            const email = req.user?.email as string | undefined;
            // Read the household id from the incoming request headers directly
            // rather than relying on req.householdId set by HouseholdIdMiddleware:
            // Nest module middleware is registered against Nest routes, which
            // this proxy layer bypasses. Reading here guarantees the value we
            // sign matches the value the downstream service will verify.
            const householdIdRaw = req.headers['x-household-id'];
            const householdId = Array.isArray(householdIdRaw)
              ? householdIdRaw[0]
              : (householdIdRaw as string | undefined);

            if (userId) proxyReq.setHeader('X-User-Id', userId);
            else proxyReq.removeHeader('X-User-Id');
            if (email) proxyReq.setHeader('X-User-Email', email);
            else proxyReq.removeHeader('X-User-Email');
            if (householdId) proxyReq.setHeader('X-Household-Id', householdId);
            else proxyReq.removeHeader('X-Household-Id');

            // Sign only if we're actually setting trust headers. Public routes
            // (e.g. /auth/google) go through without any of them and stay unsigned.
            if (signingSecret && (userId || email || householdId)) {
              const timestamp = Date.now().toString();
              const signature = computeSignature(
                { userId, email, householdId },
                timestamp,
                signingSecret,
              );
              proxyReq.setHeader(SIGNATURE_HEADER, signature);
              proxyReq.setHeader(TIMESTAMP_HEADER, timestamp);
            } else {
              // Strip stale signature headers if the client tried to inject them.
              proxyReq.removeHeader(SIGNATURE_HEADER);
              proxyReq.removeHeader(TIMESTAMP_HEADER);
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
