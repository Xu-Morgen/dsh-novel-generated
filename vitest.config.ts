import { defineConfig } from 'vitest/config';

/** Keeps repository-wide tests independent from the I1b Vite UI root. */
export default defineConfig({
  test: {
    root: '.',
  },
});
