/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  // controller pulls in @nestjs/common (not installed in this standalone harness)
  testPathIgnorePatterns: ['rail-callback.controller'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {}],
  },
};
