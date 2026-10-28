'use strict';
/**
 * telemetry.js — live machine stats for the RAHUL dashboard.
 * Everything is read-only. No dependencies.
 */
const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');

let prevTimes = null;
let procCache = { at: 0, list: [] };
let battCache = { at: 0, value: null };

const PS = process.env.SystemRoot
  ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
  : 'powershell.exe';

function run(cmd, args, timeout = 4000) {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { windowsHide: true, timeout }, (err, stdout) => {
        resolve(err && !stdout ? '' : String(stdout || ''));
      });
    } catch {
      resolve('');
    }
  });
}

function cpuPct() {
  const now = os.cpus().map((c) => c.times);
  if (!prevTimes) {
    prevTimes = now;
    return 0;
  }
  let idle = 0;
  let total = 0;
  now.forEach((t, i) => {
    const p = prevTimes[i] || t;
    idle += t.idle - p.idle;
    total +=
      t.user + t.nice + t.sys + t.idle + t.irq - (p.user + p.nice + p.sys + p.idle + p.irq);
  });
  prevTimes = now;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, 100 - (idle / total) * 100));
}

function diskInfo() {
  try {
    const s = fs.statfsSync('C:\\');
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    const used = Math.max(0, total - free);
    return {
      totalGB: +(total / 1e9).toFixed(1),
      freeGB: +(free / 1e9).toFixed(1),
      usedGB: +(used / 1e9).toFixed(1),
      pct: total > 0 ? +((used / total) * 100).toFixed(1) : 0
    };
  } catch {
    return null;
  }
}

function localIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return { ip: net.address, iface: name };
    }
  }
  return { ip: '127.0.0.1', iface: 'loopback' };
}

function uptimeText() {
  const s = Math.floor(os.uptime());
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Top processes by resident memory, grouped by image name. */
async function processes() {
  if (Date.now() - procCache.at < 5000) return procCache.list;
  const out = await run('tasklist.exe', ['/fo', 'csv', '/nh'], 6000);
  const map = new Map();
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^"([^"]+)","(\d+)","[^"]*","\s*(\d+)","([\d.,\s]+K)"/);
    if (!m) continue;
    const name = m[1].replace(/\.exe$/i, '');
    const kb = parseInt(m[4].replace(/[^\d]/g, ''), 10) || 0;
    const cur = map.get(name) || { name, memMB: 0, procs: 0 };
    cur.memMB += Math.round(kb / 1024);
    cur.procs += 1;
    map.set(name, cur);
  }
  const list = [...map.values()].sort((a, b) => b.memMB - a.memMB).slice(0, 8);
  procCache = { at: Date.now(), list };
  return list;
}

async function battery() {
  if (Date.now() - battCache.at < 60000) return battCache.value;
  const out = await run(
    PS,
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'try { $b = (Get-CimInstance -ClassName Win32_Battery -ErrorAction Stop | Select-Object -First 1); if ($b) { "$($b.EstimatedChargeRemaining)|$($b.BatteryStatus)" } } catch { "" }'
    ],
    5000
  );
  const raw = out.trim();
  let value = null;
  const m = raw.match(/^(\d+)\|(\d+)$/);
  if (m) value = { pct: parseInt(m[1], 10), charging: m[2] === '2' || m[2] === '6' || m[2] === '7' };
  battCache = { at: Date.now(), value };
  return value;
}

async function snapshot() {
  const totalGB = +(os.totalmem() / 1e9).toFixed(1);
  const usedGB = +((os.totalmem() - os.freemem()) / 1e9).toFixed(1);
  const [procs, batt] = await Promise.all([processes(), battery()]);
  const net = localIp();
  return {
    ts: Date.now(),
    cpu: +cpuPct().toFixed(1),
    cores: os.cpus().length,
    cpuModel: (os.cpus()[0] && os.cpus()[0].model) || 'CPU',
    mem: { totalGB, usedGB, pct: +((usedGB / totalGB) * 100).toFixed(1) },
    disk: diskInfo(),
    up: uptimeText(),
    host: os.hostname(),
    user: (os.userInfo().username || '').replace(/^.*\\/, ''),
    os: `Windows ${os.release()} (${os.arch()})`,
    ip: net.ip,
    iface: net.iface,
    procs,
    batt
  };
}

module.exports = { snapshot, cpuPct, processes, run, PS };
