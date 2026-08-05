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
