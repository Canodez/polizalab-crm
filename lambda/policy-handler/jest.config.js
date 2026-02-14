module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: ['index.ts'],
  coveragePathIgnorePatterns: ['/node_modules/', '/__tests__/'],
};
