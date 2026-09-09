import { mkdir, open, copyFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [source, id, title = id] = process.argv.slice(2);
if (!source || !id || !/^[a-z0-9][a-z0-9_-]*$/i.test(id)) throw new Error('Usage: node scripts/add-model.mjs FILE.glb model-id "Title"');
const root = fileURLToPath(new URL('../models/', import.meta.url));
const destination = path.join(root, id);
try { await access(destination); throw new Error(`Destination already exists: ${id}`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const file = await open(source, 'r');
try {
  const info = await file.stat();
  const header = Buffer.alloc(12); await file.read(header, 0, 12, 0);
  if (header.toString('ascii', 0, 4) !== 'glTF' || header.readUInt32LE(4) !== 2 || header.readUInt32LE(8) !== info.size) throw new Error('Expected a valid GLB 2.0 file.');
  await mkdir(destination);
  const parts = [];
  const chunkSize = 48 * 1024 * 1024;
  if (info.size <= chunkSize) {
    await copyFile(source, path.join(destination, 'model.glb')); parts.push('model.glb');
  } else {
    for (let offset = 0, index = 1; offset < info.size; offset += chunkSize, index++) {
      const buffer = Buffer.alloc(Math.min(chunkSize, info.size - offset));
      let read = 0;
      while (read < buffer.length) {
        const result = await file.read(buffer, read, buffer.length - read, offset + read);
        if (!result.bytesRead) throw new Error('Unexpected end of model');
        read += result.bytesRead;
      }
      const name = `model.glb.part${String(index).padStart(3, '0')}`;
      await writeFile(path.join(destination, name), buffer); parts.push(name);
    }
  }
  await writeFile(path.join(destination, 'entry.json'), JSON.stringify({ title, type: 'glb', parts, description: '', images: [] }, null, 2) + '\n');
  console.log(`Added ${id}. Run npm run catalog.`);
} finally { await file.close(); }
