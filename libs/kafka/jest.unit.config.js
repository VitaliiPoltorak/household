/** @type {import('jest').Config} */
module.exports = {
  displayName: 'kafka:unit',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  moduleNameMapper: {
    '^@household/contracts(.*)$': '<rootDir>/../contracts/src$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json', diagnostics: false }],
  },
  setupFiles: ['<rootDir>/../../node_modules/reflect-metadata/Reflect.js'],
  verbose: true,
};
