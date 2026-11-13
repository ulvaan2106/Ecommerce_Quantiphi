'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const { PRODUCTS, CATEGORIES, PRICE_BOUNDS, findProductById } = require('./src/data/products');
const { SORT_OPTIONS, parseFilterQuery, applyFilters, toPublicProduct } = require('./src/services/filterService');
const { renderProductImage } = require('./src/services/imageService');

const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function serveStatic(res, pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.normalize(path.join(PUBLIC_DIR, relative));

  // Block path traversal outside the public directory.
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

function handleRequest(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });

  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;

  if (pathname === '/api/meta') {
    return sendJson(res, 200, {
      categories: CATEGORIES,
      priceBounds: PRICE_BOUNDS,
      sortOptions: SORT_OPTIONS,
      total: PRODUCTS.length,
    });
  }

  if (pathname === '/api/products') {
    const parsed = parseFilterQuery(url.searchParams);
    if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });

    // Filter the master inventory first, then arrange what survives.
    const items = applyFilters(PRODUCTS, parsed.criteria, parsed.sort);
    return sendJson(res, 200, {
      count: items.length,
      total: PRODUCTS.length,
      items: items.map(toPublicProduct),
    });
  }

  const imageMatch = pathname.match(/^\/img\/(\d+)\.svg$/);
  if (imageMatch) {
    const product = findProductById(Number(imageMatch[1]));
    if (!product) return sendJson(res, 404, { error: 'Image not found' });
    res.writeHead(200, {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400',
    });
    return res.end(renderProductImage(product));
  }

  if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found' });

  return serveStatic(res, pathname);
}

if (require.main === module) {
  const PORT = Number(process.env.PORT) || 3000;
  http.createServer(handleRequest).listen(PORT, () => {
    console.log(`Marketplace running at http://localhost:${PORT}`);
  });
}

module.exports = { handleRequest };
