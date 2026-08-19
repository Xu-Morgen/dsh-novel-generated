import { defineConfig } from 'vitest/config';

/** I1 unit tests exercise the Host Cordis plugin lifecycle deterministically. */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
