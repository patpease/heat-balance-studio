import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The engine is pure and the theme test reads CSS as text, so nothing here
    // needs a DOM yet. Component tests in phase 03 will opt into jsdom per file.
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
