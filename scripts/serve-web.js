import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', 'web');
const port = Number.parseInt(process.argv[2] ?? process.env.WEB_PORT ?? '5173', 10);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

const resolveTarget = async (urlPath) => {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  if (clean.includes('..')) return null;

  const candidate = path.join(root, clean === '/' ? 'index.html' : clean);
  if (!candidate.startsWith(root)) return null;

  try {
    const info = await stat(candidate);
    if (info.isDirectory()) return path.join(candidate, 'index.html');
    return candidate;
  } catch {
    return path.join(root, 'index.html');
  }
};

createServer(async (request, response) => {
  const target = await resolveTarget(request.url ?? '/');

  if (!target) {
    response.writeHead(400).end('Bad request');
    return;
  }

  try {
    await stat(target);
  } catch {
    response.writeHead(404).end('Not found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': TYPES[path.extname(target).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': 'no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  });
  createReadStream(target).pipe(response);
}).listen(port, () => {
  console.log(`[reelix] static client on http://localhost:${port}`);
  console.log(`[reelix] serving ${root}`);
});
