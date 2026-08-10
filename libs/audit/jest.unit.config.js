/** @type {import('jest').Config} */
module.exports = {
  displayName: 'audit:unit',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json', diagnostics: false }],
  },
  setupFiles: ['<rootDir>/../../node_modules/reflect-metadata/Reflect.js'],
  verbose: true,
};
