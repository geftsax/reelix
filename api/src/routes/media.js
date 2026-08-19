import { Router } from 'express';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { config, usingAzureStorage } from '../config.js';
import { localPath } from '../services/storageService.js';
import { asyncRoute } from '../utils/asyncRoute.js';
import { notFound } from '../utils/httpError.js';

const router = Router();

router.get(
  '/:blobName(*)',
  asyncRoute(async (req, res) => {
    if (usingAzureStorage()) throw notFound('Media is served directly from Blob Storage.');

    const blobName = decodeURIComponent(req.params.blobName);
    if (blobName.includes('..')) throw notFound('Not found.');

    const filePath = localPath(blobName);
    let info;
    try {
      info = await stat(filePath);
    } catch {
      throw notFound('That media file does not exist.');
    }

    const range = req.headers.range;
    res.set('Accept-Ranges', 'bytes');
    res.set('Cache-Control', `private, max-age=${config.storage.playbackSasMinutes * 60}`);

    if (!range) {
      res.set('Content-Length', String(info.size));
      return createReadStream(filePath).pipe(res);
    }

    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match?.[1] ? Number.parseInt(match[1], 10) : 0;
    const end = match?.[2] ? Number.parseInt(match[2], 10) : info.size - 1;

    if (start >= info.size || end >= info.size || start > end) {
      res.status(416).set('Content-Range', `bytes */${info.size}`);
      return res.end();
    }

    res.status(206);
    res.set('Content-Range', `bytes ${start}-${end}/${info.size}`);
    res.set('Content-Length', String(end - start + 1));
    return createReadStream(filePath, { start, end }).pipe(res);
  }),
);

export default router;
