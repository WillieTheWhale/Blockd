/**
 * Jest Configuration
 * Blockd Auth Service
 */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    'controllers/**/*.ts',
    'services/**/*.ts',
    'middleware/**/*.ts',
    'lib/**/*.ts',
    '!**/*.d.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^@blockd/shared/(.*)$': '<rootDir>/../shared/$1'
  },
  verbose: true
};
