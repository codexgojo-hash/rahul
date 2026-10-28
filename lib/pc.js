'use strict';
/**
 * pc.js — the hands of RAHUL. Every capability the assistant has lives here,
 * as an explicit, named function. Nothing else in the app touches the OS.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFile } = require('child_process');
const { PS } = require('./telemetry');

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots');
const NOTES = path.join(ROOT, 'notes');
const PS1 = path.join(__dirname, 'ps1');

const HOME = os.homedir();
const DIRS = {
  home: HOME,
  desktop: path.join(HOME, 'Desktop'),
  documents: path.join(HOME, 'Documents'),
  downloads: path.join(HOME, 'Downloads'),
  pictures: path.join(HOME, 'Pictures'),
  music: path.join(HOME, 'Music'),
  videos: path.join(HOME, 'Videos'),
  rahul: ROOT
};

const PROTECTED = new Set([
  'system',
  'registry',
  'smss',
  'csrss',
  'wininit',
  'winlogon',
  'services',
  'lsass',
  'lsaiso',
  'svchost',
  'dwm',
  'explorer',
  'fontdrvhost',
  'sihost',
  'ctfmon',
  'taskhostw',
  'runtimebroker',
  'audiodg',
  'wininit',
  'msmpeng',
  'securityhealthservice',
  'node'
]);

function ps(script, args = [], timeout = 15000) {
  return new Promise((resolve) => {
    execFile(
      PS,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(PS1, script), ...args],
      { windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          out: String(stdout || '').trim(),
          err: (stderr || (err && err.message) || '').toString().trim()
        });
      }
    );
  });
}

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ apps */

function appTable() {
  const local = process.env.LOCALAPPDATA || '';
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const cand = (...p) => p.find(exists);
  return [
    { id: 'notepad', label: 'Notepad', exe: 'notepad.exe', words: ['notepad', 'note pad', 'notbook', 'editor'] },
    { id: 'calc', label: 'Calculator', exe: 'calc.exe', words: ['calc', 'calculator', 'gant', 'hisaab'] },
    { id: 'paint', label: 'Paint', exe: 'mspaint.exe', words: ['paint', 'mspaint', 'drawing'] },
    { id: 'explorer', label: 'File Explorer', exe: 'explorer.exe', words: ['explorer', 'my computer', 'this pc'] },
    { id: 'cmd', label: 'Command Prompt', exe: 'cmd.exe', words: ['cmd', 'command prompt', 'console'] },
    { id: 'powershell', label: 'PowerShell', exe: 'powershell.exe', words: ['powershell', 'pwsh'] },
    { id: 'taskmgr', label: 'Task Manager', exe: 'taskmgr.exe', words: ['task manager', 'taskmgr', 'taskmanager'] },
    { id: 'control', label: 'Control Panel', exe: 'control.exe', words: ['control panel', 'control'] },
    {
      id: 'chrome',
      label: 'Google Chrome',
      exe: cand(
        path.join(local, 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(pf, 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(pf86, 'Google\\Chrome\\Application\\chrome.exe')
      ),
      words: ['chrome', 'google chrome', 'browser']
    },
    {
      id: 'edge',
      label: 'Microsoft Edge',
      exe: cand(
        path.join(pf86, 'Microsoft\\Edge\\Application\\msedge.exe'),
        path.join(pf, 'Microsoft\\Edge\\Application\\msedge.exe')
      ),
      words: ['edge', 'microsoft edge']
    },
    {
      id: 'code',
      label: 'VS Code',
      exe: cand(
        path.join(local, 'Programs\\Microsoft VS Code\\Code.exe'),
        path.join(pf, 'Microsoft VS Code\\Code.exe')
      ),
      words: ['vscode', 'vs code', 'code', 'visual studio code']
    },
    {
      id: 'spotify',
      label: 'Spotify',
      exe: cand(
        path.join(process.env.APPDATA || '', 'Spotify\\Spotify.exe'),
        path.join(pf, 'Spotify\\Spotify.exe')
      ),
      words: ['spotify', 'music app']
    },
    { id: 'settings', label: 'Settings', uri: 'ms-settings:', words: ['settings', 'setting'] },
    { id: 'store', label: 'Microsoft Store', uri: 'ms-windows-store:', words: ['store', 'microsoft store'] },
    { id: 'camera', label: 'Camera', uri: 'microsoft.windows.camera:', words: ['camera', 'webcam'] },
    { id: 'snipping', label: 'Snipping Tool', uri: 'ms-screenclip:', words: ['snip', 'snipping', 'screenshot tool'] },
    { id: 'photos', label: 'Photos', uri: 'ms-photos:', words: ['photos', 'gallery'] },
    { id: 'mail', label: 'Mail', uri: 'outlookmail:', words: ['mail', 'email app'] },
    { id: 'recycle', label: 'Recycle Bin', uri: 'shell:RecycleBinFolder', words: ['recycle bin', 'trash'] }
  ];
}

function resolveApp(input) {
  const q = String(input || '').toLowerCase().trim();
  if (!q) return null;
  const table = appTable();
  let best = null;
  for (const app of table) {
    for (const w of app.words) {
      if (q === w) return app;
      if (q.includes(w) && (!best || w.length > best.score)) best = { app, score: w.length };
    }
  }
  return best ? best.app : null;
}

function launch(target, args = []) {
  return new Promise((resolve) => {
    try {
      const child = spawn(target, args, { detached: true, stdio: 'ignore', windowsHide: false });
      child.on('error', (e) => resolve({ ok: false, message: e.message }));
      child.unref();
      setTimeout(() => resolve({ ok: true }), 250);
    } catch (e) {
      resolve({ ok: false, message: e.message });
    }
  });
}

async function openApp(name) {
  const app = resolveApp(name);
  if (!app) return { ok: false, message: `"${name}" app list me nahi hai, Gojo.` };
  if (app.uri) {
    const r = await launch('explorer.exe', [app.uri]);
    return r.ok
      ? { ok: true, message: `${app.label} khol raha hoon.`, app: app.label }
      : { ok: false, message: `${app.label} open nahi hua: ${r.message}` };
  }
  if (!app.exe) return { ok: false, message: `${app.label} is PC par installed nahi hai.` };
  const r = await launch(app.exe);
  return r.ok
    ? { ok: true, message: `${app.label} open ho gaya.`, app: app.label }
    : { ok: false, message: `${app.label} open nahi hua: ${r.message}` };
}

function openUrl(url) {
  let u = String(url || '').trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    new URL(u);
  } catch {
    return Promise.resolve({ ok: false, message: 'Ye valid URL nahi lag raha.' });
  }
  return launch('explorer.exe', [u]).then((r) =>
    r.ok ? { ok: true, message: `Browser me khol diya: ${u}` } : { ok: false, message: r.message }
  );
}

function openFolder(which) {
  const key = String(which || 'downloads').toLowerCase().replace(/\s+/g, '');
  const dir = DIRS[key] || (exists(which) ? which : null);
  if (!dir || !exists(dir)) return { ok: false, message: `"${which}" folder mila nahi.` };
  spawn('explorer.exe', [dir], { detached: true, stdio: 'ignore' }).unref();
  return { ok: true, message: `${dir} khol diya.` };
}

/* --------------------------------------------------------------- system */

async function volume(mode = 'up', step = 2) {
  const r = await ps('volume.ps1', ['-Mode', mode, '-Step', String(step)]);
  if (!r.ok) return { ok: false, message: 'Volume control fail hua.' };
  const word = mode === 'mute' ? 'Mute kar diya' : mode === 'down' ? 'Volume kam kiya' : 'Volume badha diya';
  return { ok: true, message: `${word}.`, mode };
}

async function media(mode = 'playpause') {
  const r = await ps('media.ps1', ['-Mode', mode]);
  if (!r.ok) return { ok: false, message: 'Media key fail hui.' };
  const map = { next: 'Next track', prev: 'Previous track', stop: 'Stop', playpause: 'Play/Pause' };
  return { ok: true, message: `${map[mode] || 'Media'} bhej diya.`, mode };
}

function lock() {
  spawn('rundll32.exe', ['user32.dll,LockWorkStation'], { detached: true, stdio: 'ignore' }).unref();
  return { ok: true, message: 'Screen lock kar diya. Main yahin hoon, Gojo.' };
}

async function sleep() {
  const r = await ps('sleep.ps1', [], 8000);
  return r.ok ? { ok: true, message: 'PC ko sleep me bhej raha hoon.' } : { ok: false, message: 'Sleep fail hua.' };
}

function shutdown(seconds = 30) {
  const s = Math.max(5, Math.min(600, parseInt(seconds, 10) || 30));
  spawn('shutdown.exe', ['/s', '/t', String(s), '/c', 'RAHUL: shutdown requested by Gojo'], {
    detached: true,
    stdio: 'ignore'
  }).unref();
  return { ok: true, message: `PC ${s} second me band hoga. Cancel karna ho to "cancel shutdown" bolo.`, seconds: s };
}

function restart(seconds = 20) {
  const s = Math.max(5, Math.min(600, parseInt(seconds, 10) || 20));
  spawn('shutdown.exe', ['/r', '/t', String(s), '/c', 'RAHUL: restart requested by Gojo'], {
    detached: true,
    stdio: 'ignore'
  }).unref();
  return { ok: true, message: `PC ${s} second me restart hoga.`, seconds: s };
}

function cancelShutdown() {
  spawn('shutdown.exe', ['/a'], { detached: true, stdio: 'ignore' }).unref();
  return { ok: true, message: 'Shutdown cancel kar diya. Safe hai.' };
}

async function screenshot() {
  const file = path.join(SHOTS, `shot-${Date.now()}.png`);
  const r = await ps('screenshot.ps1', ['-Out', file], 20000);
  if (!r.ok || !exists(file)) return { ok: false, message: 'Screenshot fail hua.' };
  const stat = fs.statSync(file);
  return {
    ok: true,
    message: 'Screenshot le liya.',
    file: path.basename(file),
    url: `/shots/${path.basename(file)}`,
    size: stat.size,
    dims: r.out
  };
}

async function clipboardGet() {
  const r = await ps('clipboard.ps1', ['-Mode', 'get']);
  return { ok: true, message: 'Clipboard padh liya.', text: r.out.slice(0, 4000) };
}

async function clipboardSet(text) {
  const r = await ps('clipboard.ps1', ['-Mode', 'set', String(text)], 10000);
  return r.ok
    ? { ok: true, message: 'Clipboard me copy kar diya.' }
    : { ok: false, message: 'Clipboard write fail hua.' };
}

async function typeText(text) {
  const clean = String(text || '').slice(0, 2000);
  const r = await ps('type.ps1', [clean], 20000);
  return r.ok ? { ok: true, message: 'Type kar diya.' } : { ok: false, message: 'Typing fail hui.' };
}

async function sendKeys(keys) {
  const r = await ps('keys.ps1', [String(keys || '')], 10000);
  return r.ok ? { ok: true, message: `Keys bhej diye: ${keys}` } : { ok: false, message: 'Keys fail hue.' };
}

async function wifi() {
  const r = await ps('wifi.ps1', [], 12000);
  try {
    return { ok: true, ...JSON.parse(r.out || '{}') };
  } catch {
    return { ok: false, message: 'WiFi info nahi mili.' };
  }
}

/* ---------------------------------------------------------------- files */

function listDir(which = 'downloads') {
  const key = String(which || '').toLowerCase().replace(/\s+/g, '');
  const dir = DIRS[key];
  if (!dir || !exists(dir)) return { ok: false, message: `"${which}" folder mila nahi.` };
  const items = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => !d.name.startsWith('.'))
    .map((d) => {
      let size = 0;
      let mtime = 0;
      try {
        const st = fs.statSync(path.join(dir, d.name));
        size = st.size;
        mtime = st.mtimeMs;
      } catch {}
      return { name: d.name, dir: d.isDirectory(), size, mtime };
    })
    .sort((a, b) => Number(b.dir) - Number(a.dir) || b.mtime - a.mtime)
    .slice(0, 60);
  return { ok: true, message: `${dir} — ${items.length} items.`, dir, items };
}

function searchFiles(query, which = 'home') {
  const q = String(query || '').toLowerCase();
  if (q.length < 2) return { ok: false, message: 'Kam se kam 2 letters do search ke liye.' };
  const root = DIRS[which] || DIRS.home;
  const hits = [];
  const walk = (dir, depth) => {
    if (depth > 3 || hits.length >= 30) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (hits.length >= 30) break;
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'AppData') continue;
      const full = path.join(dir, e.name);
      if (e.name.toLowerCase().includes(q)) {
        let size = 0;
        try {
          size = fs.statSync(full).size;
        } catch {}
        hits.push({ name: e.name, path: full, dir: e.isDirectory(), size });
      }
      if (e.isDirectory()) walk(full, depth + 1);
    }
  };
  walk(root, 0);
  return { ok: true, message: `${hits.length} result mile "${query}" ke liye.`, hits, root };
}

async function killProcess(name) {
  const raw = String(name || '').trim().replace(/\.exe$/i, '');
  if (!raw) return { ok: false, message: 'Process ka naam batao.' };
  if (PROTECTED.has(raw.toLowerCase())) {
    return { ok: false, message: `${raw} system process hai — usse main nahi chhedunga.` };
  }
  return new Promise((resolve) => {
    execFile('taskkill.exe', ['/IM', `${raw}.exe`, '/F'], { windowsHide: true }, (err, stdout, stderr) => {
      if (err) resolve({ ok: false, message: `${raw} band nahi hua: ${(stderr || '').trim().split('\n')[0]}` });
      else resolve({ ok: true, message: `${raw} band kar diya.` });
    });
  });
}

function note(text) {
  const t = String(text || '').trim();
  if (!t) return { ok: false, message: 'Note me kya likhna hai?' };
  const file = path.join(NOTES, 'notes.md');
  const line = `- [${new Date().toLocaleString('en-IN')}] ${t}\n`;
  fs.mkdirSync(NOTES, { recursive: true });
  fs.appendFileSync(file, line, 'utf8');
  const count = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).length;
  return { ok: true, message: 'Note save kar diya.', count, file: 'notes/notes.md' };
}

function readNotes() {
  const file = path.join(NOTES, 'notes.md');
  if (!exists(file)) return { ok: true, message: 'Abhi koi note nahi hai.', lines: [] };
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).slice(-20);
  return { ok: true, message: `${lines.length} recent notes.`, lines };
}

function shots() {
  try {
    return fs
      .readdirSync(SHOTS)
      .filter((f) => f.endsWith('.png'))
      .map((f) => ({ file: f, ...fs.statSync(path.join(SHOTS, f)) }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, 24)
      .map((s) => ({ file: s.file, url: `/shots/${s.file}`, at: s.mtimeMs }));
  } catch {
    return [];
  }
}

function uptime() {
  const s = Math.floor(os.uptime());
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

module.exports = {
  DIRS,
  ps,
  openApp,
  openUrl,
  openFolder,
  volume,
  media,
  lock,
  sleep,
  shutdown,
  restart,
  cancelShutdown,
  screenshot,
  clipboardGet,
  clipboardSet,
  typeText,
  sendKeys,
  wifi,
  listDir,
  searchFiles,
  killProcess,
  note,
  readNotes,
  shots,
  uptime,
  resolveApp
};
