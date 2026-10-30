import {
  mkdir,
  copyFile,
  readdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = process.cwd();
const publicDir = path.join(root, 'public');
const manifest = [];
async function download(url, relative, minSize) {
  const destination = path.join(publicDir, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  let bytes;
  try {
    bytes = await readFile(destination);
    if (bytes.length < minSize) bytes = null;
  } catch {}
  if (!bytes) {
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`${relative}: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < minSize)
      throw new Error(`${relative}: unexpectedly small download`);
    await writeFile(destination, bytes);
  }
  manifest.push({
    file: relative,
    source: url,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
  process.stdout.write(`Prepared ${relative} (${bytes.length} bytes)\n`);
}
await mkdir(path.join(publicDir, 'vision/wasm'), { recursive: true });
const wasmDir = path.join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
for (const file of await readdir(wasmDir)) {
  await copyFile(
    path.join(wasmDir, file),
    path.join(publicDir, 'vision/wasm', file),
  );
  const bytes = await readFile(path.join(wasmDir, file));
  manifest.push({
    file: `vision/wasm/${file}`,
    source: '@mediapipe/tasks-vision@0.10.32',
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
await download(
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  'vision/hand_landmarker.task',
  1000000,
);
const files = [3, 4, 5]
  .flatMap((o) => ['C', 'Ds', 'Fs', 'A'].map((n) => `${n}${o}.mp3`))
  .concat('C6.mp3');
for (let i = 0; i < files.length; i += 4) {
  await Promise.all(
    files
      .slice(i, i + 4)
      .map((file) =>
        download(
          `https://tonejs.github.io/audio/salamander/${file}`,
          `audio/piano/${file}`,
          1000,
        ),
      ),
  );
}
await download(
  'https://creativecommons.org/licenses/by/3.0/legalcode.txt',
  'licenses/CC-BY-3.0.txt',
  1000,
);
await download(
  'https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/LICENSE',
  'licenses/MediaPipe-Apache-2.0.txt',
  1000,
);
await copyFile(
  path.join(root, 'node_modules/tone/LICENSE.md'),
  path.join(publicDir, 'licenses/Tone-MIT.txt'),
);
await copyFile(
  path.join(root, 'node_modules/react/LICENSE'),
  path.join(publicDir, 'licenses/React-MIT.txt'),
);
await writeFile(
  path.join(publicDir, 'asset-manifest.json'),
  JSON.stringify(
    manifest.sort((a, b) => a.file.localeCompare(b.file)),
    null,
    2,
  ) + '\n',
);
process.stdout.write('All runtime assets are local.\n');
