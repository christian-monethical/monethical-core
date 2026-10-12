import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { mockApi } from './mock/plugin.ts';

export default defineConfig(({ mode }) => ({
  plugins: [preact(), ...(mode === 'mock' ? [mockApi()] : [])],
  resolve: {
    alias: { '@widgets': fileURLToPath(new URL('../widgets/src', import.meta.url)) },
  },
  build: { target: 'es2022', sourcemap: false, cssCodeSplit: true },
  test: {
    environment: 'happy-dom',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
}));
