import { readFile, access, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const manifest = JSON.parse(
  await readFile('public/asset-manifest.json', 'utf8'),
);
for (const entry of manifest) {
  const bytes = await readFile(`public/${entry.file}`);
  if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256)
    throw new Error(
      `Asset changed or incomplete: ${entry.file}. Run npm run assets.`,
    );
}
for (const file of [
  'vision/hands.worker.js',
  'licenses/Tone-MIT.txt',
  'licenses/React-MIT.txt',
])
  await access(`public/${file}`);
const wasm = await readdir('public/vision/wasm');
for (const file of [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
]) {
  if (!wasm.includes(file))
    throw new Error(`Missing WASM runtime: ${file}. Run npm run assets.`);
}
console.log(
  `Verified ${manifest.length} asset hashes, worker, runtimes and license notices.`,
);
