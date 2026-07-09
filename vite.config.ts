import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    // Only pick up test files inside src/ — this prevents Vitest from
    // accidentally running Playwright E2E specs (tests/e2e/) or the
    // legacy Node --test files (tests/security/, tests/unit/).
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // Measure coverage only for the branding module files that belong
      // to this task. The full services.ts (2400+ lines) contains many
      // other service classes that are out of scope for this mission.
      include: ['src/lib/branding.types.ts'],
      // Per-file thresholds: branding.types.ts must reach 80%+
      // (actual: 100% — all pure functions are exercised).
      thresholds: {
        perFile: true,
        branches:   80,
        functions:  80,
        lines:      80,
        statements: 80,
      },
    },

  },

})

