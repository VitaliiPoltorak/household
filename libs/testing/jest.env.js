// Enforce a dedicated test database so integration tests never touch dev data.
// This file is registered via `setupFiles` in each service's jest.integration.config.js
// and runs BEFORE any modules load — including the DataSource factory.
if (!process.env.POSTGRES_DB || !process.env.POSTGRES_DB.endsWith('_test')) {
  process.env.POSTGRES_DB = 'household_test';
}

// Integration tests call controllers directly with unsigned trust headers.
// Force gateway-signature verification into bypass mode so tests don't need
// to sign every request. Prod is protected by requireSigningSecret() at
// bootstrap and the fail-fast when NODE_ENV=production.
delete process.env.GATEWAY_SIGNING_SECRET;

// AppModule of services that import JwtModule (auth-service) reads JWT_SECRET
// via requireStrongJwtSecret. Provide a dev-length secret so tests don't need
// a real one. NODE_ENV=test skips the production strength check.
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-jwt-secret';
}
