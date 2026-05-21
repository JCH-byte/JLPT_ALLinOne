#!/usr/bin/env node
/**
 * Minimal static file server for local development.
 * 단일 의존성 없음. Node 기본 http만 사용.
 * Usage: node scripts/serve.js [port]
 *   기본 포트 8000. http://localhost:8000 으로 index.html 서빙.
 *
 * file:// 환경에서 발생하는 fetch/HEAD 차단 회피용. CORS 제약 없이 동작.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2]) || Number(process.env.PORT) || 8000;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.mp3': 'audio/mpeg'
};

function safeJoin(reqPath) {
    const decoded = decodeURIComponent(reqPath);
    const cleaned = decoded.replace(/\?.*$/, '').replace(/#.*$/, '');
    const target = path.normalize(path.join(ROOT, cleaned));
    if (!target.startsWith(ROOT)) return null;
    return target;
}

function serve(req, res) {
    const parsed = url.parse(req.url);
    let targetPath = safeJoin(parsed.pathname || '/');
    if (!targetPath) {
        res.writeHead(403); res.end('Forbidden'); return;
    }

    let stat;
    try { stat = fs.statSync(targetPath); } catch { stat = null; }

    if (stat && stat.isDirectory()) {
        targetPath = path.join(targetPath, 'index.html');
        try { stat = fs.statSync(targetPath); } catch { stat = null; }
    }

    if (!stat || !stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Not found: ${parsed.pathname}`);
        return;
    }

    const ext = path.extname(targetPath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
        'Content-Type': mime,
        'Cache-Control': 'no-cache'
    });
    fs.createReadStream(targetPath).pipe(res);
}

const server = http.createServer(serve);
server.listen(PORT, () => {
    console.log(`Serving ${ROOT}`);
    console.log(`  → http://localhost:${PORT}`);
    console.log('Ctrl+C to stop.');
});
