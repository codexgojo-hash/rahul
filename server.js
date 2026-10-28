'use strict';
/**
 * server.js — RAHUL local bridge.
 *   - serves the UI (public/)
 *   - exposes a token-guarded JSON API on 127.0.0.1
 *   - streams live telemetry over SSE
 * Zero dependencies. Node >= 18.15.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

const telemetry = require('./lib/telemetry');
const brain = require('./lib/brain');
const pc = require('./lib/pc');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const SHOTS = path.join(ROOT, 'shots');
const TOKEN_FILE = path.join(ROOT, 'rahul.token');
const CONFIG_FILE = path.join(ROOT, 'rahul.config.json');

const DEFAULT_CONFIG = {
  name: 'Rahul',
  owner: 'Gojo',
  version: '1.0.0',
  port: 8787,
  autoOpen: true
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function loadToken() {
  try {
    const t = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    if (/^[a-f0-9]{32,}$/i.test(t)) return t;
  } catch {}
  const t = crypto.randomBytes(24).toString('hex');
  try {
    fs.writeFileSync(TOKEN_FILE, t, { mode: 0o600 });
  } catch {}
  return t;
}

const config = loadConfig();
const TOKEN = loadToken();
const startedAt = Date.now();

const sseClients = new Set();
function broadcast(payload) {
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(line);
    } catch {
      sseClients.delete(res);
    }
  }
}

function send(res, code, body, headers = {}) {
  const isJson = typeof body === 'object' && !Buffer.isBuffer(body);
  const payload = isJson ? JSON.stringify(body) : body;
  res.writeHead(code, {
    'content-type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    ...headers
  });
  res.end(payload);
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return;
  res.setHeader('access-control-allow-origin', origin);
  res.setHeader('vary', 'Origin');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type,x-rahul-token');
  res.setHeader('access-control-max-age', '86400');
}

function authorized(req, url) {
  const hdr = req.headers['x-rahul-token'];
  if (hdr && hdr === TOKEN) return true;
  const q = url.searchParams.get('token');
  if (q && q === TOKEN) return true;
  const cookie = req.headers.cookie || '';
  return cookie.split(/;\s*/).some((c) => c === `rahul_token=${TOKEN}`);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 200000) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function safeJoin(base, rel) {
  const p = path.normalize(path.join(base, rel));
  return p.startsWith(base) ? p : null;
}

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.replace(/^\/+/, ''));
  if (!rel) rel = 'index.html';
  if (rel.endsWith('/')) rel += 'index.html';
  const file = safeJoin(PUBLIC, rel);
  if (!file) return send(res, 403, 'forbidden');
  fs.readFile(file, (err, buf) => {
    if (err) {
      if (path.extname(file)) return send(res, 404, 'not found');
      return fs.readFile(path.join(PUBLIC, 'index.html'), (e2, html) => {
        if (e2) return send(res, 404, 'not found');
        res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' });
        res.end(html);
      });
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=120',
      'x-content-type-options': 'nosniff'
    });
    res.end(buf);
  });
}

/* ------------------------------------------------------------- endpoints */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const p = url.pathname;
  cors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  /* public, harmless */
  if (p === '/api/hello') {
    return send(res, 200, {
      ok: true,
      app: 'rahul',
      name: config.name,
      owner: config.owner,
      version: config.version,
      mode: 'local',
      tokenRequired: true,
      caps: [
        'apps',
        'system',
        'screenshot',
        'files',
        'processes',
        'volume',
        'media',
        'power',
        'clipboard',
        'typing',
        'notes',
        'network'
      ],
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000)
    });
  }

  /* boot config for the page */
  if (p === '/boot.js') {
    const host = (req.headers.host || '').split(':')[0];
    const isLocal = ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host);
    const boot = {
      mode: 'local',
      app: 'rahul',
      name: config.name,
      owner: config.owner,
      version: config.version,
      api: '',
      token: isLocal ? TOKEN : null,
      remote: !isLocal,
      caps: ['apps', 'system', 'screenshot', 'files', 'processes', 'volume', 'media', 'power', 'clipboard', 'typing', 'notes', 'network']
    };
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(`window.RAHUL_BOOT=${JSON.stringify(boot)};`);
  }

  /* images produced by RAHUL */
  if (p.startsWith('/shots/')) {
    const name = path.basename(p.slice('/shots/'.length));
    const file = safeJoin(SHOTS, name);
    if (!file) return send(res, 403, 'forbidden');
    return fs.readFile(file, (err, buf) => {
      if (err) return send(res, 404, 'not found');
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
      res.end(buf);
    });
  }

  /* everything else under /api needs the token */
  if (p.startsWith('/api/')) {
    if (!authorized(req, url)) {
      return send(res, 401, { ok: false, error: 'unauthorized', hint: 'token missing — open /boot.js on localhost' });
    }

    if (p === '/api/state' && req.method === 'GET') {
      return send(res, 200, { ok: true, state: await telemetry.snapshot(), uptimeSec: Math.floor((Date.now() - startedAt) / 1000) });
    }

    if (p === '/api/events' && req.method === 'GET') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
        'x-accel-buffering': 'no'
      });
      res.write(`data: ${JSON.stringify({ type: 'hello', name: config.name, owner: config.owner })}\n\n`);
      sseClients.add(res);
      const feed = async () => {
        if (!sseClients.has(res)) return;
        try {
          const state = await telemetry.snapshot();
          res.write(`data: ${JSON.stringify({ type: 'telemetry', state })}\n\n`);
        } catch {}
      };
      const timer = setInterval(feed, 2000);
      feed();
      req.on('close', () => {
        clearInterval(timer);
        sseClients.delete(res);
      });
      return;
    }

    if (p === '/api/command' && req.method === 'POST') {
      const body = await readBody(req);
      const text = String(body.text || '').slice(0, 500);
      try {
        const result = await brain.handle(text, {
          onAction: (label) => broadcast({ type: 'action', label, at: Date.now() })
        });
        broadcast({ type: 'turn', user: text, reply: result.reply, at: Date.now() });
        return send(res, 200, { ok: true, ...result });
      } catch (e) {
        return send(res, 500, { ok: false, reply: `Kuch gadbad ho gayi, ${config.owner}: ${e.message}` });
      }
    }

    if (p === '/api/action' && req.method === 'POST') {
      const body = await readBody(req);
      const action = String(body.action || '');
      const args = body.args || {};
      const table = {
        screenshot: () => pc.screenshot(),
        lock: () => pc.lock(),
        sleep: () => pc.sleep(),
        sysinfo: async () => ({ ok: true, state: await telemetry.snapshot() }),
        volume: () => pc.volume(args.mode || 'up', args.step || 2),
        media: () => pc.media(args.mode || 'playpause'),
        open: () => pc.openApp(args.app || 'notepad'),
        clipboard: () => pc.clipboardGet(),
        notes: async () => pc.readNotes(),
        shots: async () => ({ ok: true, shots: pc.shots() })
      };
      if (!table[action]) return send(res, 400, { ok: false, error: 'unknown action' });
      try {
        const result = await table[action]();
        broadcast({ type: 'action', label: action, at: Date.now() });
        return send(res, 200, { ok: true, result });
      } catch (e) {
        return send(res, 500, { ok: false, error: e.message });
      }
    }

    if (p === '/api/notes' && req.method === 'GET') return send(res, 200, { ok: true, ...pc.readNotes() });
    if (p === '/api/shots' && req.method === 'GET') return send(res, 200, { ok: true, shots: pc.shots() });

    return send(res, 404, { ok: false, error: 'no such endpoint' });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
  return serveStatic(req, res, p);
});

/* ---------------------------------------------------------------- start */

function openBrowser(url) {
  try {
    spawn('explorer.exe', [url], { detached: true, stdio: 'ignore' }).unref();
  } catch {}
}

function banner(port) {
  const line = '─'.repeat(58);
  console.log(`\n\x1b[38;5;48m${line}\x1b[0m`);
  console.log(`  \x1b[1mRAHUL\x1b[0m  v${config.version}   \x1b[38;5;48m● ONLINE\x1b[0m`);
  console.log(`  owner: ${config.owner}    host: ${os.hostname()}`);
  console.log(`  ui:    \x1b[4mhttp://127.0.0.1:${port}/\x1b[0m`);
  console.log(`  token: ${TOKEN.slice(0, 8)}…${TOKEN.slice(-6)}  (rahul.token)`);
  console.log(`  mode:  local bridge — full PC control`);
  console.log(`\x1b[38;5;48m${line}\x1b[0m\n`);
}

function listen(port, attemptsLeft = 10) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.log(`port ${port} busy, trying ${port + 1}…`);
      return listen(port + 1, attemptsLeft - 1);
    }
    console.error('RAHUL failed to start:', err.message);
    process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => {
    banner(port);
    const url = `http://127.0.0.1:${port}/`;
    if (config.autoOpen && !process.argv.includes('--silent')) openBrowser(url);
    try {
      fs.writeFileSync(path.join(ROOT, 'rahul.port'), String(port));
    } catch {}
  });
}

listen(Number(process.env.PORT) || config.port);
