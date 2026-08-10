/** @type {import('jest').Config} */
module.exports = {
  displayName: 'finance-service:unit',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  // Integration specs run in test:integration (with docker up). Exclude them
  // here so unit runs stay fast + zero-dep.
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.spec\\.ts$'],
  moduleNameMapper: {
    '^@household/common(.*)$': '<rootDir>/../../libs/common/src$1',
    '^@household/contracts(.*)$': '<rootDir>/../../libs/contracts/src$1',
    '^@household/database(.*)$': '<rootDir>/../../libs/database/src$1',
    '^@household/kafka(.*)$': '<rootDir>/../../libs/kafka/src$1',
    '^@household/audit(.*)$': '<rootDir>/../../libs/audit/src$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json', diagnostics: false }],
  },
  setupFiles: ['<rootDir>/../../node_modules/reflect-metadata/Reflect.js'],
  verbose: true,
};
