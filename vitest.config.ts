import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'test/**',
        'src/types/**',
        'src/index.ts',
      ],
      thresholds: {
        lines: 9,
        functions: 9,
        branches: 5,
        statements: 9,
      },
    },
    testTimeout: 10000,
    reporters: ['default'],
  },
  esbuild: {
    target: 'es2022',
  },
});
