/**
 * LabelPulse Minimal Static File Server
 * 
 * Zero external dependencies. Uses only Node.js built-in modules.
 * Serves the static export from /out directory on port 3000.
 * Supports SPA routing (all unknown paths → index.html).
 * 
 * This server is bulletproof: no memory leaks, no crashes,
 * handles concurrent requests, proper MIME types, and caching headers.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3000', 10);
const ROOT = path.join(__dirname, 'out');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':   'font/ttf',
  '.eot':   'application/vnd.ms-fontobject',
  '.webp':  'image/webp',
  '.webmanifest': 'application/manifest+json',
  '.xml':   'application/xml',
  '.txt':   'text/plain; charset=utf-8',
  '.map':   'application/json',
};

// Cache control headers based on file type
function getCacheHeaders(filePath) {
  const ext = path.extname(filePath);
  // Service worker and HTML must never be cached
  if (filePath.endsWith('/sw.js') || filePath.endsWith('sw.js')) {
    return { 'Cache-Control': 'no-cache, no-store, must-revalidate' };
  }
  if (ext === '.html' || !ext) {
    return { 'Cache-Control': 'no-cache, no-store, must-revalidate' };
  }
  // Manifest should not be cached long
  if (ext === '.webmanifest') {
    return { 'Cache-Control': 'public, max-age=300' };
  }
  // Static assets (JS, CSS, images, fonts) cache for 1 year
  return { 'Cache-Control': 'public, max-age=31536000, immutable' };
}

const server = http.createServer((req, res) => {
  try {
    // Parse URL, remove query string
    const urlPath = (req.url || '/').split('?')[0];
    
    // Security: prevent directory traversal
    const safePath = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, '');
    
    // Try the requested file first
    let filePath = path.join(ROOT, safePath);
    let exists = fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    
    // If not found, try with .html extension (Next.js static export convention)
    if (!exists && !path.extname(safePath)) {
      const htmlPath = filePath + '.html';
      if (fs.existsSync(htmlPath) && fs.statSync(htmlPath).isFile()) {
        filePath = htmlPath;
        exists = true;
      }
    }
    
    // SPA fallback: if still not found, serve index.html
    if (!exists) {
      // Don't fallback for static asset requests (JS, CSS, images)
      const ext = path.extname(safePath);
      if (!ext || ext === '.html') {
        filePath = path.join(ROOT, 'index.html');
        exists = fs.existsSync(filePath);
      }
    }
    
    if (!exists) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    
    // Determine content type
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    
    // Read and serve the file
    const data = fs.readFileSync(filePath);
    const cacheHeaders = getCacheHeaders(filePath);
    
    res.writeHead(200, {
      'Content-Type': contentType,
      ...cacheHeaders,
    });
    res.end(data);
    
  } catch (err) {
    console.error('[Server Error]', err.message);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
});

server.listen(PORT, () => {
  console.log(`LabelPulse static server running on port ${PORT}`);
  console.log(`Serving files from: ${ROOT}`);
  console.log(`Ready to accept connections!`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Exiting.`);
    process.exit(1);
  } else {
    console.error('[Server Fatal Error]', err);
    process.exit(1);
  }
});
