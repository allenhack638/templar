import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/__tests__/**/*.test.ts'],
        // Each test file gets an isolated module registry so vi.mock() calls
        // in one file cannot bleed into another.
        isolate: true,
    },
});
