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

// integration-service's requireStrongEncryptionKey (mirrors JWT_SECRET
// above) reads TOKEN_ENCRYPTION_KEY at bootstrap. NODE_ENV=test skips the
// production strength check, so any value works here.
if (!process.env.TOKEN_ENCRYPTION_KEY) {
  process.env.TOKEN_ENCRYPTION_KEY = 'test-token-encryption-key';
}

// Argon2id at production parameters (m=19456,t=2) takes ~40 ms per hash on
// commodity hardware — across the full email/password integration suite
// that adds up to minutes. Drop to the crate's floor (m=8,t=1) in test only;
// production still enforces OWASP baseline via PasswordHasherService's
// startup guard.
if (!process.env.ARGON2_MEMORY_KIB) process.env.ARGON2_MEMORY_KIB = '8';
if (!process.env.ARGON2_ITERATIONS) process.env.ARGON2_ITERATIONS = '1';
if (!process.env.ARGON2_PARALLELISM) process.env.ARGON2_PARALLELISM = '1';

// Skip the Have-I-Been-Pwned network call — integration tests must be
// hermetic. The HibpService unit spec covers the real client behaviour
// against a mocked fetch.
if (!process.env.HIBP_ENABLED) process.env.HIBP_ENABLED = 'false';
