// Builds the deployment archives. Node's zip output uses forward slashes, which
// Compress-Archive does not, and Kudu rejects a zip with backslash separators.
import { createWriteStream } from 'node:fs';
import { readdir, stat, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, crc32 } from 'node:zlib';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.join(root, 'dist');

const crc = (buf) =>
  typeof crc32 === 'function' ? crc32(buf) : (() => {
    let c = ~0;
    for (const b of buf) {
      c ^= b;
      for (let i = 0; i < 8; i += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  })();

const walk = async (dir, base, skip) => {
  const out = [];
  for (const name of await readdir(dir)) {
    if (skip.has(name)) continue;
    const full = path.join(dir, name);
    const rel = path.posix.join(base, name);
    if ((await stat(full)).isDirectory()) out.push(...await walk(full, rel, skip));
    else out.push({ full, rel });
  }
  return out;
};

const writeZip = async (files, target) => {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const data = await readFile(f.full);
    const body = deflateRawSync(data);
    const nameBuf = Buffer.from(f.rel, 'utf8');
    const sum = crc(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, body);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt32LE(sum, 16);
    dir.writeUInt32LE(body.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  await new Promise((resolve, reject) => {
    const out = createWriteStream(target);
    out.on('error', reject).on('close', resolve);
    out.end(Buffer.concat([...chunks, centralBuf, end]));
  });
};

await mkdir(outDir, { recursive: true });

const api = [
  ...await walk(path.join(root, 'api', 'src'), 'src', new Set()),
  { full: path.join(root, 'api', 'package.json'), rel: 'package.json' },
  { full: path.join(root, 'api', 'package-lock.json'), rel: 'package-lock.json' },
];
await writeZip(api, path.join(outDir, 'api-package.zip'));

const web = await walk(path.join(root, 'web'), '', new Set());
await writeZip(web, path.join(outDir, 'web.zip'));

for (const n of ['api-package.zip', 'web.zip']) {
  const s = await stat(path.join(outDir, n));
  console.log(`${n.padEnd(18)} ${Math.round(s.size / 1024)} KB`);
}
console.log(`\nBoth written to ${outDir}`);
