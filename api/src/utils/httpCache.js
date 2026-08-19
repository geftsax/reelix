export const sendCached = (req, res, result, maxAgeSeconds) => {
  res.set('ETag', result.etag);
  res.set('Cache-Control', `public, max-age=${maxAgeSeconds}`);
  res.set('X-Cache', result.cached ? 'HIT' : 'MISS');

  if (req.headers['if-none-match'] === result.etag) {
    return res.status(304).end();
  }

  return res.json(result.value);
};
