// Enforce a dedicated test database so integration tests never touch dev data.
// This file is registered via `setupFiles` in each service's jest.integration.config.js
// and runs BEFORE any modules load — including the DataSource factory.
if (!process.env.POSTGRES_DB || !process.env.POSTGRES_DB.endsWith('_test')) {
  process.env.POSTGRES_DB = 'household_test';
}
