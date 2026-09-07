import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const srcDir = fileURLToPath(new URL('./src', import.meta.url));

/**
 * Pure-logic tests only — no React Native renderer, no Expo runtime.
 * `vitest.setup.ts` stubs the Firebase SDK modules so a test can import a
 * `data/firebase/*.ts` file for its pure exports (e.g. `applyPromotionEffect`)
 * without triggering the real `initializeApp`/`AsyncStorage` chain that
 * `src/services/firebase.ts` runs at module load. See plan-eng-review Faz 0.1.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.mts'],
  },
  resolve: {
    alias: {
      '@': srcDir,
    },
  },
});
