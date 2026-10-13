/** @type {import('ts-jest').JestConfigWithTsJest} */
// Mirrors packages/shared-types so both workspaces behave the same under
// `turbo test`. jest and ts-jest resolve from the hoisted root node_modules.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { strict: false, esModuleInterop: true } }],
  },
};
