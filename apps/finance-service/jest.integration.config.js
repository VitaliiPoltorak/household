/** @type {import('jest').Config} */
module.exports = {
  displayName: 'finance-service:integration',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.integration.spec.ts'],
  moduleNameMapper: {
    '^@household/common(.*)$': '<rootDir>/../../libs/common/src$1',
    '^@household/contracts(.*)$': '<rootDir>/../../libs/contracts/src$1',
    '^@household/database(.*)$': '<rootDir>/../../libs/database/src$1',
    '^@household/kafka(.*)$': '<rootDir>/../../libs/kafka/src$1',
    '^@household/testing(.*)$': '<rootDir>/../../libs/testing/src$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.test.json',
      diagnostics: false,
    }],
  },
  setupFiles: ['<rootDir>/../../node_modules/reflect-metadata/Reflect.js'],
  testTimeout: 30000,
  verbose: true,
};
