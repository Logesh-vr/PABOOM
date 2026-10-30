import { build } from 'esbuild';
// MediaPipe's WASM loader uses importScripts, which requires a classic worker.
// Bundle its ESM dependencies ahead of time rather than evaluating fetched code.
await build({
  entryPoints: ['src/workers/hands.worker.ts'],
  outfile: 'public/vision/hands.worker.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'eof',
});
process.stdout.write('Prepared local classic hand-tracking worker.\n');
