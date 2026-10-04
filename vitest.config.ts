import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/src/**/*.test.ts', 'collector/test/**/*.test.ts', 'web/src/**/*.test.ts'],
    environment: 'node',
  },
});
