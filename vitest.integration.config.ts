import { defineConfig } from 'vitest/config';
import path from 'path';

// Integration tests against a real Postgres (pnpm pg:up && pnpm pg:migrate first).
// Kept separate from vitest.config.ts so `pnpm test` never needs a database.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/integration/**/*.test.ts'],
    // Tests share one database; each file wraps its tests in a rolled-back transaction
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
