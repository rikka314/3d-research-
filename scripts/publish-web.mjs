import { cp, readdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const id = process.argv[2];
if (!/^web-[a-z0-9-]+$/.test(id || '')) throw new Error('Usage: node scripts/publish-web.mjs web-ID');
const target = fileURLToPath(new URL(`../models/${id}/`, import.meta.url));
const dist = path.join(target, 'source', 'dist');
await access(path.join(dist, 'index.html'));
for (const name of await readdir(dist)) {
  if (['entry.json', 'source'].includes(name)) throw new Error(`Reserved filename: ${name}`);
  await cp(path.join(dist, name), path.join(target, name), { recursive: true });
}
console.log(`Updated ${id} from source/dist. Run npm run catalog and npm run check.`);
