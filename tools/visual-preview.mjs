/**
 * Builds `tools/visual-preview.jsx` with Vite (so JSX and the app modules
 * resolve exactly like in the app) and runs it in Node to emit a static HTML
 * preview. Run with `npm run preview:ui`.
 */
import { rmSync } from 'node:fs';
import { build } from 'vite';

const outDir = 'node_modules/.cache/visual-preview';

await build({
  logLevel: 'warn',
  configFile: false,
  build: {
    ssr: 'tools/visual-preview.jsx',
    outDir,
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'preview.mjs' } },
  },
});

try {
  await import(`../${outDir}/preview.mjs`);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
