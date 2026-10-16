import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({
  main: { build: { rollupOptions: { input: resolve('apps/desktop/src/main/index.ts') } } },
  preload: {
    build: {
      rollupOptions: {
        input: resolve('apps/desktop/src/preload/index.ts'),
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: 'apps/desktop/src/renderer',
    plugins: [react()],
    build: { rollupOptions: { input: resolve('apps/desktop/src/renderer/index.html') } },
  },
});
