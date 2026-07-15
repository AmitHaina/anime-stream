// Static file server + same-origin proxy, since the upstream API/CDN send no Access-Control-Allow-Origin header.
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const UPSTREAM = 'https://anime.uniquestream.net';
const CDN_HOST_RE = /^[a-z0-9.-]+\.mediacache\.cc$/; // allow-list: only proxy to known CDN hosts, never arbitrary ones
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT || 0; // 0 = OS picks a free random port

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function pipeUpstream(url, res, transformM3u8) {
    https.get(url, { headers: { 'user-agent': 'Mozilla/5.0' } }, (upstreamRes) => {
        const contentType = upstreamRes.headers['content-type'] || 'application/octet-stream';
        const isM3u8 = transformM3u8 && (contentType.includes('mpegurl') || url.split('?')[0].endsWith('.m3u8'));
        if (!isM3u8) {
            res.writeHead(upstreamRes.statusCode, { 'content-type': contentType });
            return upstreamRes.pipe(res);
        }
        // Playlists are text: buffer them and strip the decoy EXT-X-KEY tag before sending.
        const chunks = [];
        upstreamRes.on('data', (c) => chunks.push(c));
        upstreamRes.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8').replace(/^#EXT-X-KEY:.*\r?\n?/gm, '');
            res.writeHead(upstreamRes.statusCode, { 'content-type': contentType });
            res.end(text);
        });
    }).on('error', (e) => {
        res.writeHead(502, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
    });
}

function proxyApi(req, res) { pipeUpstream(UPSTREAM + req.url, res, false); }

// Mirrors any *.mediacache.cc CDN host (embedded as the first /cdn/<host>/... path segment) under our
// own origin so hls.js's relative URL resolution keeps working and CORS is sidestepped; m3u8 EXT-X-KEY
// is stripped (see pipeUpstream).
function proxyCdn(req, res) {
    const rest = req.url.slice('/cdn/'.length);
    const slash = rest.indexOf('/');
    const host = slash === -1 ? rest : rest.slice(0, slash);
    if (!CDN_HOST_RE.test(host)) { res.writeHead(400); return res.end('Unknown CDN host'); }
    pipeUpstream(`https://${host}${slash === -1 ? '' : rest.slice(slash)}`, res, true);
}

function serveStatic(req, res) {
    const reqPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    const filePath = path.join(PUBLIC_DIR, reqPath);
    if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'content-type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
    });
}

const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/')) return proxyApi(req, res);
    if (req.url.startsWith('/cdn/')) return proxyCdn(req, res);
    return serveStatic(req, res);
});

server.listen(PORT, () => {
    console.log(`anime-stream demo running at http://localhost:${server.address().port}`);
});
