import http from 'node:http';
import { stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary' };
const server = http.createServer(async (req, res) => {
  try {
    const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '');
    let target = path.resolve(root, relative);
    if (target !== path.resolve(root) && !target.startsWith(path.resolve(root) + path.sep)) { res.writeHead(403).end(); return; }
    if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html');
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' }); res.end(body);
  } catch { res.writeHead(404).end('Not found'); }
});
server.listen(4173, '127.0.0.1', () => console.log('Open http://127.0.0.1:4173'));
