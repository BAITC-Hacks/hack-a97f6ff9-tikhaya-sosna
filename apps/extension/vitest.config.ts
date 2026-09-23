import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['components/**/*.test.tsx', 'contracts/**/*.test.ts', 'services/**/*.test.ts'],
  },
});
