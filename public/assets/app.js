/* ============================================================
   RAHUL — client
   ============================================================ */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const now = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };

  const S = {
    mode: 'cloud',
    api: '',
    token: null,
    name: 'Rahul',
    owner: 'Gojo',
    voice: store.get('rahul_voice', false),
    sound: store.get('rahul_sound', true),
    matrix: store.get('rahul_matrix', true),
    hist: store.get('rahul_hist', []),
    hidx: 0,
    busy: false,
    tele: null,
    cpuHist: [],
    es: null,
    online: false
  };

  const el = {
    body: document.body,
    boot: $('#boot'),
    bootLines: $('#bootLines'),
    bootBar: $('#bootBar'),
    app: $('#app'),
    chat: $('#chat'),
    input: $('#input'),
    composer: $('#composer'),
    suggest: $('#suggest'),
    clock: $('#clock'),
    upTime: $('#upTime'),
    modeTag: $('#modeTag'),
    statusPill: $('#statusPill'),
    linkText: $('#linkText'),
    feed: $('#feed'),
    toasts: $('#toasts'),
    flash: $('#flash'),
    palette: $('#palette'),
    paletteInput: $('#paletteInput'),
    paletteList: $('#paletteList'),
    spark: $('#spark')
  };

  /* ------------------------------------------------------------ audio */
  let actx = null;
  function sfx(kind) {
    if (!S.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t = actx.currentTime;
      const map = {
        send: { f: 660, d: 0.06, type: 'square', g: 0.03 },
        recv: { f: 420, d: 0.09, type: 'triangle', g: 0.035 },
        err: { f: 150, d: 0.16, type: 'sawtooth', g: 0.045 },
        boot: { f: 220, d: 0.5, type: 'sine', g: 0.02 },
        tap: { f: 880, d: 0.03, type: 'square', g: 0.018 }
      }[kind] || { f: 500, d: 0.05, type: 'sine', g: 0.02 };
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = map.type;
      o.frequency.setValueAtTime(map.f, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(80, map.f * 0.6), t + map.d);
      g.gain.setValueAtTime(map.g, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + map.d);
      o.connect(g).connect(actx.destination);
      o.start(t);
      o.stop(t + map.d + 0.02);
    } catch {}
  }

  function speak(text) {
    if (!S.voice || !('speechSynthesis' in window)) return;
    const clean = String(text || '').replace(/[`*_#>|]/g, '').slice(0, 320);
    if (!clean) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(clean);
      const voices = speechSynthesis.getVoices();
      const hi = voices.find((v) => /hi-IN|hi_IN/i.test(v.lang));
      const en = voices.find((v) => /en-IN/i.test(v.lang));
      if (hi) u.voice = hi; else if (en) u.voice = en;
      u.rate = 0.98;
      u.pitch = 0.95;
      u.volume = 0.9;
      speechSynthesis.speak(u);
    } catch {}
  }

  /* ----------------------------------------------------------- matrix */
  const canvas = $('#matrix');
  const ctx = canvas.getContext('2d');
  let drops = [];
  let raf = 0;
  const glyphs = 'アカサタナハマヤラワ0123456789ABCDEFｱｲｳｴｵ<>[]{}#$%&*+=/\\';

  function sizeMatrix() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cols = Math.floor(innerWidth / 15);
    drops = Array.from({ length: cols }, () => Math.random() * -60);
  }

  function matrixFrame() {
    raf = requestAnimationFrame(matrixFrame);
    ctx.fillStyle = 'rgba(3, 6, 10, 0.09)';
    ctx.fillRect(0, 0, innerWidth, innerHeight);
    ctx.font = '13px ui-monospace, monospace';
    for (let i = 0; i < drops.length; i++) {
      const ch = glyphs[(Math.random() * glyphs.length) | 0];
      const x = i * 15;
      const y = drops[i] * 18;
      ctx.fillStyle = Math.random() > 0.985 ? 'rgba(53,224,255,0.85)' : 'rgba(61,255,154,0.55)';
      ctx.fillText(ch, x, y);
      if (y > innerHeight && Math.random() > 0.975) drops[i] = 0;
      drops[i] += 0.55;
    }
  }

  function startMatrix() {
    if (!S.matrix || reduced) { canvas.style.display = 'none'; return; }
    canvas.style.display = '';
    cancelAnimationFrame(raf);
    sizeMatrix();
    matrixFrame();
    addEventListener('resize', sizeMatrix);
  }

  /* ------------------------------------------------------------- boot */
  const bootScript = [
    ['booting <b>rahul.os</b> · kernel 1.0.0', 220],
    ['mounting /dev/gojo', 160],
    ['screens · input · files', 150],
    ['persona <b>rahul</b> // calm // hinglish', 200],
    ['local bridge', 180],
    ['welcome back, gojo.', 240]
  ];

  function line(text, status) {
    const d = document.createElement('div');
    d.innerHTML =
      '<span style="color:#2c4a42">›</span> ' +
      text +
      (status ? ` <span class="ok">${status}</span>` : '');
    el.bootLines.append(d);
    el.bootLines.scrollTop = el.bootLines.scrollHeight;
  }

  function runBoot() {
    if (reduced) { finishBoot(); return; }
    let i = 0;
    const tick = () => {
      if (i >= bootScript.length) return finishBoot();
      const [text, wait] = bootScript[i];
      const status = i === 0 ? 'ok' : i === 4 ? (S.mode === 'cloud' ? '<span style="color:#ffc93c">cloud</span>' : 'ok') : 'ok';
      line(text, status);
      el.bootBar.style.width = `${Math.round(((i + 1) / bootScript.length) * 100)}%`;
      sfx('tap');
      i++;
      setTimeout(tick, wait);
    };
    setTimeout(tick, 340);
    const skip = () => finishBoot();
    document.addEventListener('keydown', skip, { once: true });
    el.boot.addEventListener('click', skip, { once: true });
  }

  let booted = false;
  function finishBoot() {
    if (booted) return;
    booted = true;
    el.bootBar.style.width = '100%';
    el.boot.classList.add('done');
    el.body.classList.remove('is-booting');
    el.app.hidden = false;
    setTimeout(() => el.boot.remove(), 900);
    greet();
  }

  const WELCOME = {
    local:
      `Gojo. Main Rahul hoon — tumhare PC ke andar, shaant se baitha hua.\n` +
      `Apps kholta hoon, screen dekhta hoon, files dhoondta hoon, system sambhalta hoon. ` +
      `Jaldi nahi, sahi kaam karta hoon. Shuru karo — ya \`help\` likho.`,
    remote:
      `Gojo, bridge connected hai. Main yahan hoon — bolo kya karna hai.\n\`help\` se poori list mil jayegi.`,
    cloud:
      `Gojo. Main Rahul hoon — filhaal cloud mode me hoon, sirf UI aur demo data.\n` +
      `PC control ke liye local bridge chalao (\`npm start\`), ya Settings me tunnel URL paste karo.`,
    locked:
      `Gojo, bridge mila hai par token nahi. Settings me token paste karo, phir main poora PC sambhal lunga.`
  };

  async function greet() {
    await addMsg('bot', WELCOME[S.mode] || WELCOME.cloud, { instant: true });
    if (S.mode === 'cloud') {
      addSystem('CLOUD MODE · demo telemetry · connect pc from settings');
    } else if (S.mode === 'local') {
      addSystem('bridge online · 127.0.0.1 · full control');
    }
    renderSuggest();
    el.input.focus();
  }

  /* -------------------------------------------------------------- api */
  function apiUrl(path) {
    return (S.api ? S.api.replace(/\/+$/, '') : '') + path;
  }

  async function api(path, opts = {}) {
    const headers = { 'content-type': 'application/json' };
    if (S.token) headers['x-rahul-token'] = S.token;
    const res = await fetch(apiUrl(path), {
      method: opts.method || 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store'
    });
    if (res.status === 401) throw new Error('unauthorized');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `http ${res.status}`);
    return data;
  }

  /* ------------------------------------------------------------ cards */
  function assetUrl(u) {
    if (/^https?:/i.test(u)) return u;
    return apiUrl(u);
  }

  function renderCard(card) {
    const wrap = document.createElement('div');
    wrap.className = 'card-inline';
    const head = document.createElement('h4');
    head.textContent = card.title || '';
    wrap.append(head);

    if (card.type === 'text') {
      const pre = document.createElement('pre');
      pre.textContent = card.body || '';
      wrap.append(pre);
    }

    if (card.type === 'sysinfo') {
      const table = document.createElement('div');
      table.className = 'kv-table';
      (card.rows || []).forEach(([k, v]) => {
        const row = document.createElement('div');
        const a = document.createElement('span');
        a.textContent = k;
        const b = document.createElement('b');
        b.textContent = v;
        row.append(a, b);
        table.append(row);
      });
      wrap.append(table);
    }

    if (card.type === 'files') {
      const ul = document.createElement('ul');
      ul.className = 'file-list';
      (card.items || []).slice(0, 30).forEach((it) => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="ic">${it.dir ? '▸' : '·'}</span><span class="n"></span><span class="s"></span>`;
        $('.n', li).textContent = it.name;
        $('.s', li).textContent = it.dir ? 'dir' : fmtBytes(it.size);
        ul.append(li);
      });
      if (!(card.items || []).length) {
        const li = document.createElement('li');
        li.textContent = 'khaali hai';
        ul.append(li);
      }
      wrap.append(ul);
    }

    if (card.type === 'procs') {
      const max = Math.max(...(card.rows || []).map(([, v]) => parseInt(v, 10) || 1), 1);
      const box = document.createElement('div');
      box.className = 'proc-bars';
      (card.rows || []).forEach(([name, val]) => {
        const n = parseInt(val, 10) || 0;
        const p = document.createElement('div');
        p.className = 'p';
        const label = document.createElement('span');
        label.textContent = name;
        const num = document.createElement('span');
        num.textContent = val;
        const bar = document.createElement('i');
        const fill = document.createElement('b');
        fill.style.width = `${clamp((n / max) * 100, 3, 100)}%`;
        bar.append(fill);
        p.append(label, num, bar);
        box.append(p);
      });
      wrap.append(box);
    }

    if (card.type === 'shot') {
      const img = document.createElement('img');
      img.className = 'shot';
      img.loading = 'lazy';
      img.alt = 'screen capture';
      img.src = assetUrl(card.url);
      img.addEventListener('load', () => { if (atBottom()) toBottom(); });
      img.addEventListener('click', () => window.open(img.src, '_blank'));
      wrap.append(img);
      if (card.dims) {
        const cap = document.createElement('pre');
        cap.textContent = card.dims;
        wrap.append(cap);
      }
    }

    return wrap;
  }

  function fmtBytes(b) {
    if (!b) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let n = b;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(n > 9 || i === 0 ? 0 : 1)} ${u[i]}`;
  }

  /* ------------------------------------------------------------- chat */
  function atBottom() {
    return el.chat.scrollHeight - el.chat.scrollTop - el.chat.clientHeight < 160;
  }
  function toBottom() {
    el.chat.scrollTop = el.chat.scrollHeight;
  }
  function toggleWatermark() {
    const w = document.getElementById('watermark');
    if (w) w.classList.toggle('gone', el.chat.querySelectorAll('.msg').length > 2);
  }

  function addMeta(role) {
    const meta = document.createElement('div');
    meta.className = 'meta';
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = role === 'user' ? S.owner : role === 'bot' ? 'RAHUL' : 'SYS';
    const t = document.createElement('span');
    t.textContent = now();
    meta.append(who, t);
    return meta;
  }

  function typeInto(node, text, stick) {
    return new Promise((resolve) => {
      if (reduced || text.length < 8) {
        node.textContent = text;
        if (stick) toBottom();
        return resolve();
      }
      node.classList.add('caret');
      let i = 0;
      const step = () => {
        i = Math.min(text.length, i + 3);
        node.textContent = text.slice(0, i);
        if (stick) toBottom();
        if (i < text.length) setTimeout(step, 12);
        else { node.classList.remove('caret'); resolve(); }
      };
      step();
    });
  }

  async function addMsg(role, text, opts = {}) {
    const stick = atBottom();
    const wrap = document.createElement('div');
    wrap.className = `msg ${role}${opts.tone ? ' ' + opts.tone : ''}`;
    const meta = addMeta(role);
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    wrap.append(meta, bubble);
    el.chat.append(wrap);
    toggleWatermark();
    if (stick) toBottom();
    if (role === 'user' || opts.instant) {
      bubble.textContent = text;
    } else {
      await typeInto(bubble, text, stick);
    }
    if (opts.card) {
      bubble.append(renderCard(opts.card));
    }
    if (stick) toBottom();
    return wrap;
  }

  function addSystem(text) {
    const wrap = document.createElement('div');
    wrap.className = 'msg sys';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text;
    wrap.append(bubble);
    el.chat.append(wrap);
    toggleWatermark();
    toBottom();
  }

  function showTyping() {
    const stick = atBottom();
    const wrap = document.createElement('div');
    wrap.className = 'msg bot';
    const meta = addMeta('bot');
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
    wrap.append(meta, bubble);
    el.chat.append(wrap);
    if (stick) toBottom();
    return wrap;
  }

  /* --------------------------------------------------------- commands */
  const SUGGEST = ['help', 'system info', 'screenshot lo', 'open notepad', 'volume up', 'lock'];

  function renderSuggest() {
    el.suggest.innerHTML = '';
    SUGGEST.forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = s;
      b.addEventListener('click', () => { el.input.value = s; el.input.focus(); });
      el.suggest.append(b);
    });
  }

  function cloudReply(cmd) {
    const t = cmd.toLowerCase().trim();
    if (/^(help|commands|kya kar sakte)/.test(t))
      return {
        reply: 'Ye sab kar sakta hoon (cloud mode me sirf list dikha sakta hoon):',
        card: {
          type: 'text',
          title: 'COMMAND MATRIX',
          body:
            'open <app>          · notepad, calc, chrome, spotify…\nscreenshot lo       · screen capture\nsystem info         · cpu / ram / disk\nvolume up|down|mute\nlock / sleep        · power\nlist downloads      · files\nsearch <naam>       · file search\nprocesses           · heavy apps\nnote <text>         · save a note\nopen youtube.com    · url\n\nPC control ke liye local bridge chalao: npm start'
        }
      };
    if (/who are you|tum kaun|naam/.test(t))
      return { reply: 'Main Rahul hoon — Gojo ka AI. Cloud mode me sirf UI hoon; local bridge chalane par poora PC mere control me aata hai.' };
    if (/time|samay|baje/.test(t)) return { reply: `Abhi ${new Date().toLocaleTimeString('en-IN')} baje hai, Gojo.` };
    if (/^(hi|hey|hello|namaste)/.test(t)) return { reply: 'Hey Gojo. Cloud mode me hoon — reconnect karo to kaam shuru karein.' };
    return {
      reply:
        'Cloud mode me main tumhare PC ko touch nahi kar sakta, Gojo. Do raste hain:\n' +
        '1) PC par `npm start` chalao — http://127.0.0.1:8787 khulega\n' +
        '2) Settings me tunnel URL + token daalo\n\n' +
        'Tab tak `help` dekh lo.'
    };
  }

  async function run(cmd, opts = {}) {
    const text = String(cmd || '').trim();
    if (!text || S.busy) return;
    S.busy = true;
    el.input.value = '';
    sfx('send');

    await addMsg('user', text);

    S.hist.push(text);
    if (S.hist.length > 60) S.hist = S.hist.slice(-60);
    S.hidx = S.hist.length;
    store.set('rahul_hist', S.hist);

    const typing = showTyping();
    el.composer.querySelector('.send').disabled = true;

    let payload = null;
    try {
      if (S.mode === 'cloud') {
        payload = cloudReply(text);
        await sleep(320);
      } else {
        const r = await api('/api/command', { method: 'POST', body: { text } });
        payload = { reply: r.reply, card: r.card, tone: r.tone, chip: r.chip };
      }
    } catch (e) {
      payload = {
        reply:
          e.message === 'unauthorized'
            ? 'Token galat lag raha hai, Gojo. Settings me check karo.'
            : `Bridge se baat nahi ho payi (${e.message}). Local server chal raha hai?`,
        tone: 'err'
      };
      sfx('err');
    } finally {
      typing.remove();
      S.busy = false;
      el.composer.querySelector('.send').disabled = false;
    }

    const msg = await addMsg('bot', payload.reply || '…', {
      card: payload.card,
      tone: payload.tone,
      instant: S.mode === 'cloud'
    });
    if (payload.card) msg.classList.add('has-card');
    sfx('recv');
    speak(payload.reply);
    if (payload.chip) toast('LAUNCHED', payload.chip);
    if (opts.refreshTele) refresh();
    el.input.focus();
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* --------------------------------------------------------- telemetry */
  function setGauge(id, val) {
    const g = $(id);
    if (g) g.style.setProperty('--p', clamp(val, 0, 100));
  }

  function applyTelemetry(s) {
    if (!s) return;
    S.tele = s;

    $('#cpuVal').innerHTML = `${Math.round(s.cpu)}<small>%</small>`;
    $('#ramVal').innerHTML = `${Math.round(s.mem.pct)}<small>%</small>`;
    if (s.disk) $('#diskVal').innerHTML = `${Math.round(s.disk.pct)}<small>%</small>`;
    setGauge('#cpuGauge', s.cpu);
    setGauge('#ramGauge', s.mem.pct);
    if (s.disk) setGauge('#diskGauge', s.disk.pct);

    $('#cpuModel').textContent = `${s.cpuModel.replace(/\(R\)|\(TM\)|CPU|@.*/g, '').trim()} · ${s.cores} cores`;
    $('#ramFoot').textContent = `${s.mem.usedGB} / ${s.mem.totalGB} GB used`;
    if (s.disk) $('#diskFoot').textContent = `${s.disk.usedGB} / ${s.disk.totalGB} GB · ${s.disk.freeGB} free`;
    $('#bigUptime').textContent = s.up;
    $('#hostFoot').textContent = `${s.host} · ${s.user} · ${s.ip}`;

    $('#hCpu').textContent = `${Math.round(s.cpu)}%`;
    $('#hRam').textContent = `${Math.round(s.mem.pct)}%`;
    $('#hDisk').textContent = s.disk ? `${Math.round(s.disk.pct)}%` : '—';
    $('#hCpuBar').style.width = `${s.cpu}%`;
    $('#hRamBar').style.width = `${s.mem.pct}%`;
    if (s.disk) $('#hDiskBar').style.width = `${s.disk.pct}%`;

    $('#hHost').textContent = s.host;
    $('#hUser').textContent = s.user;
    $('#hIp').textContent = s.ip;
    $('#hUp').textContent = s.up;

    $('#hProcs').innerHTML = (s.procs || [])
      .slice(0, 7)
      .map((p) => `<li><span>${esc(p.name)}</span><b>${p.memMB >= 1024 ? (p.memMB / 1024).toFixed(1) + 'G' : p.memMB + 'M'}</b></li>`)
      .join('');

    const sh = $('#setHost');
    if (sh) sh.textContent = s.host;

    $('#procTable').innerHTML = (s.procs || [])
      .map((p) => {
        const max = Math.max(...s.procs.map((x) => x.memMB), 1);
        return `<div class="row-p"><b>${esc(p.name)}</b><i><b style="width:${(p.memMB / max) * 100}%"></b></i><span>${p.memMB} MB</span></div>`;
      })
      .join('');

    S.cpuHist.push(s.cpu);
    if (S.cpuHist.length > 60) S.cpuHist.shift();
    drawSpark();
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function drawSpark() {
    const c = el.spark;
    if (!c || !c.offsetParent) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth || 600;
    const h = 150;
    if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    g.strokeStyle = 'rgba(20,38,47,0.9)';
    g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (h / 4) * i;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }

    const pts = S.cpuHist;
    if (!pts.length) return;
    const stepX = w / (pts.length - 1 || 1);

    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(61,255,154,0.35)');
    grad.addColorStop(1, 'rgba(61,255,154,0.02)');

    g.beginPath();
    pts.forEach((v, i) => {
      const x = i * stepX;
      const y = h - (clamp(v, 0, 100) / 100) * (h - 12) - 6;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.lineTo(w, h);
    g.lineTo(0, h);
    g.closePath();
    g.fillStyle = grad;
    g.fill();

    g.beginPath();
    pts.forEach((v, i) => {
      const x = i * stepX;
      const y = h - (clamp(v, 0, 100) / 100) * (h - 12) - 6;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.strokeStyle = '#3dff9a';
    g.lineWidth = 1.6;
    g.shadowColor = 'rgba(61,255,154,0.6)';
    g.shadowBlur = 10;
    g.stroke();
    g.shadowBlur = 0;
  }

  async function refresh() {
    if (S.mode === 'cloud') return;
    try {
      const r = await api('/api/state');
      applyTelemetry(r.state);
      if (r.uptimeSec != null) el.upTime.textContent = 'up ' + fmtUp(r.uptimeSec);
    } catch {}
  }

  function fmtUp(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h ? `${h}h ${m}m` : `${m}m`;
  }

  function connectStream() {
    if (S.es) { S.es.close(); S.es = null; }
    if (S.mode === 'cloud' || S.mode === 'locked') return;
    const url = `${apiUrl('/api/events')}?token=${encodeURIComponent(S.token || '')}`;
    try {
      const es = new EventSource(url);
      S.es = es;
      es.onmessage = (ev) => {
        let d;
        try { d = JSON.parse(ev.data); } catch { return; }
        if (d.type === 'telemetry') applyTelemetry(d.state);
        if (d.type === 'action') { feed(d.label); toast('ACTION', d.label); flash(); }
        if (d.type === 'hello') setOnline(true);
      };
      es.onerror = () => {
        setOnline(false);
        setTimeout(() => { if (S.mode !== 'cloud') connectStream(); }, 5000);
      };
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }

  function simulate() {
    let t = 0;
    setInterval(() => {
      if (S.mode !== 'cloud') return;
      t += 0.12;
      const cpu = 18 + Math.sin(t) * 9 + Math.sin(t * 2.7) * 5 + Math.random() * 4;
      const mem = 46 + Math.sin(t * 0.6) * 4;
      applyTelemetry({
        ts: Date.now(),
        cpu: clamp(+cpu.toFixed(1), 3, 96),
        cores: 8,
        cpuModel: 'DEMO NODE',
        mem: { totalGB: 16, usedGB: +(16 * (mem / 100)).toFixed(1), pct: mem },
        disk: { totalGB: 476, usedGB: 312, freeGB: 164, pct: 65.5 },
        up: 'demo',
        host: 'CLOUD-NODE',
        user: 'gojo',
        os: 'wasm sandbox',
        ip: '0.0.0.0',
        iface: 'edge',
        procs: [
          { name: 'demo-kernel', memMB: 412 },
          { name: 'matrix', memMB: 188 },
          { name: 'persona', memMB: 96 },
          { name: 'bridge?', memMB: 0 }
        ],
        batt: null
      });
    }, 1800);
  }

  function setOnline(v) {
    S.online = v;
    const pill = el.statusPill;
    pill.classList.toggle('off', !v);
    el.linkText.textContent = v ? (S.mode === 'remote' ? 'REMOTE' : 'LINKED') : S.mode === 'cloud' ? 'DEMO' : 'OFFLINE';
  }

  function feed(label) {
    const li = document.createElement('li');
    li.innerHTML = `<span>${now()}</span><b>${esc(label)}</b>`;
    el.feed.prepend(li);
    while (el.feed.children.length > 14) el.feed.lastChild.remove();
  }

  function toast(kind, text) {
    const t = document.createElement('div');
    t.className = 'toast' + (kind === 'ERR' ? ' err' : '');
    t.innerHTML = `<b>${esc(kind)}</b> · ${esc(text)}`;
    el.toasts.append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 2600);
  }

  function flash() {
    el.flash.classList.add('on');
    setTimeout(() => el.flash.classList.remove('on'), 70);
  }

  /* ------------------------------------------------------------ views */
  function setView(name) {
    $$('.rail-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.view === name));
    $$('.view').forEach((v) => v.classList.toggle('is-active', v.dataset.view === name));
    if (name === 'system') { drawSpark(); if (S.mode !== 'cloud') refresh(); }
    if (name === 'console') el.input.focus();
    sfx('tap');
  }

  /* --------------------------------------------------------- palette */
  const PALETTE = [
    ['help', 'list every command'],
    ['system info', 'cpu · ram · disk · uptime'],
    ['screenshot lo', 'capture the screen'],
    ['processes', 'heaviest running apps'],
    ['lock', 'lock the workstation'],
    ['volume up', 'raise output volume'],
    ['volume down', 'lower output volume'],
    ['volume mute', 'mute output'],
    ['play / pause', 'media key'],
    ['list downloads', 'recent downloads'],
    ['list desktop', 'desktop contents'],
    ['wifi', 'network + ip'],
    ['notes', 'saved notes'],
    ['open notepad', 'launch notepad'],
    ['open calc', 'launch calculator'],
    ['open chrome', 'launch chrome'],
    ['open settings', 'windows settings'],
    ['sleep', 'suspend the pc'],
    ['restart', 'reboot (20s)'],
    ['shutdown', 'power off (30s)']
  ];
  let palSel = 0;

  function openPalette() {
    el.palette.hidden = false;
    el.paletteInput.value = '';
    palSel = 0;
    renderPalette('');
    el.paletteInput.focus();
  }
  function closePalette() { el.palette.hidden = true; el.input.focus(); }

  function renderPalette(q) {
    const list = PALETTE.filter((p) => (p[0] + ' ' + p[1]).toLowerCase().includes(q.toLowerCase()));
    el.paletteList.innerHTML = '';
    list.forEach(([cmd, desc], i) => {
      const li = document.createElement('li');
      if (i === palSel) li.classList.add('is-sel');
      li.innerHTML = `<span>${esc(cmd)}</span><span class="k">${esc(desc)}</span>`;
      li.addEventListener('click', () => { closePalette(); setView('console'); run(cmd); });
      el.paletteList.append(li);
    });
    el.paletteList.dataset.count = String(list.length);
  }

  /* ------------------------------------------------------------ apps */
  const APPS = [
    ['notepad', 'NOTEPAD', 'text'],
    ['calc', 'CALC', 'utility'],
    ['chrome', 'CHROME', 'browser'],
    ['edge', 'EDGE', 'browser'],
    ['code', 'VS CODE', 'editor'],
    ['explorer', 'EXPLORER', 'files'],
    ['cmd', 'TERMINAL', 'shell'],
    ['settings', 'SETTINGS', 'system'],
    ['taskmgr', 'TASKS', 'monitor'],
    ['paint', 'PAINT', 'draw'],
    ['spotify', 'SPOTIFY', 'audio'],
    ['camera', 'CAMERA', 'capture'],
    ['snipping', 'SNIP', 'capture'],
    ['recycle', 'TRASH', 'files']
  ];

  function renderApps() {
    const grid = $('#appGrid');
    APPS.forEach(([cmd, label, desc]) => {
      const b = document.createElement('button');
      b.className = 'app-tile';
      b.type = 'button';
      b.innerHTML = `<span class="g">▚</span><span class="n">${label}</span><span class="d">${desc}</span>`;
      b.addEventListener('click', () => { setView('console'); run(`open ${cmd}`); });
      grid.append(b);
    });
  }

  /* -------------------------------------------------------- settings */
  function syncSettings() {
    const tag = { local: 'LOCAL', remote: 'REMOTE', cloud: 'CLOUD', locked: 'LOCKED' }[S.mode] || 'CLOUD';
    el.modeTag.textContent = tag;
    $('#setMode').textContent = S.mode;
    $('#setApi').textContent = S.api || 'same origin (127.0.0.1)';
    $('#setToken').textContent = S.token ? `${S.token.slice(0, 6)}…${S.token.slice(-4)}` : 'not set';
    $('#setHost').textContent = S.tele ? S.tele.host : navigator.platform;
    $('#prompt').textContent = `${(S.owner || 'gojo').toLowerCase()}@rahul:~$`;
    setOnline(S.mode === 'local' || S.mode === 'remote');
  }

  async function applyBridge(url, token) {
    if (!url) return toast('ERR', 'URL daalo');
    S.api = url.replace(/\/+$/, '');
    S.token = token || '';
    try {
      const hello = await fetch(`${S.api}/api/hello`, { cache: 'no-store' }).then((r) => r.json());
      if (!hello.ok) throw new Error('bad hello');
      S.mode = 'remote';
      store.set('rahul_bridge', { api: S.api, token: S.token });
      syncSettings();
      connectStream();
      toast('CONNECTED', `${hello.name} @ ${S.api}`);
      addSystem(`bridge connected · ${S.api}`);
    } catch (e) {
      toast('ERR', 'connect fail');
      addSystem('connect fail — URL/token check karo');
    }
  }

  /* ------------------------------------------------------------- init */
  async function detect() {
    const q = new URLSearchParams(location.search);
    if (q.get('bridge')) {
      store.set('rahul_bridge', { api: q.get('bridge'), token: q.get('token') || '' });
    }

    const boot = await new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = `boot.js?_=${Date.now()}`;
      s.onload = () => resolve(window.RAHUL_BOOT || null);
      s.onerror = () => resolve(null);
      document.head.append(s);
      setTimeout(() => resolve(window.RAHUL_BOOT || null), 1500);
    });

    const saved = store.get('rahul_bridge', null);

    if (boot && boot.mode === 'local') {
      S.name = boot.name || 'Rahul';
      S.owner = boot.owner || 'Gojo';
      if (boot.token) { S.mode = 'local'; S.token = boot.token; }
      else if (saved && saved.token) { S.mode = 'local'; S.token = saved.token; }
      else { S.mode = 'locked'; S.token = null; }
    } else if (saved && saved.api) {
      S.api = saved.api;
      S.token = saved.token || '';
      S.mode = 'remote';
    } else {
      S.mode = 'cloud';
    }

    if (S.mode === 'local' || S.mode === 'remote') {
      try {
        const r = await api('/api/hello');
        S.name = r.name || S.name;
        S.owner = r.owner || S.owner;
        S.online = true;
      } catch (e) {
        if (e.message === 'unauthorized') S.mode = 'locked';
        else if (S.mode === 'remote') S.mode = 'cloud';
      }
    }
  }

  function wire() {
    el.composer.addEventListener('submit', (e) => {
      e.preventDefault();
      run(el.input.value);
    });

    el.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        S.hidx = Math.max(0, S.hidx - 1);
        el.input.value = S.hist[S.hidx] || '';
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        S.hidx = Math.min(S.hist.length, S.hidx + 1);
        el.input.value = S.hist[S.hidx] || '';
      } else if (e.key === 'Escape') {
        el.input.value = '';
      }
    });

    $$('.rail-btn').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

    $$('[data-cmd]').forEach((b) =>
      b.addEventListener('click', () => {
        const c = b.dataset.cmd;
        if (b.classList.contains('dir-card')) {
          filesInto(c.replace('list ', ''));
        } else {
          setView('console');
          run(c);
        }
      })
    );

    $('#clearBtn').addEventListener('click', () => {
      el.chat.innerHTML = '';
      addSystem('console cleared');
    });

    $('#refreshBtn').addEventListener('click', () => { refresh(); toast('SYNC', 'telemetry refreshed'); });

    $('#searchForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const q = $('#searchInput').value.trim();
      if (!q) return;
      const box = $('#fileResults');
      box.innerHTML = '<p class="dim">searching…</p>';
      if (S.mode === 'cloud') { box.innerHTML = '<p class="dim">cloud mode — PC connect karo</p>'; return; }
      try {
        const r = await api('/api/command', { method: 'POST', body: { text: `search ${q}` } });
        box.innerHTML = '';
        const card = r.card;
        if (!card) { box.innerHTML = `<p class="dim">${esc(r.reply)}</p>`; return; }
        (card.items || []).forEach((it) => {
          const d = document.createElement('div');
          d.className = 'f';
          d.innerHTML = `<span>${it.dir ? '▸' : '·'}</span><span>${esc(it.name)}</span><span class="p">${esc(it.path || '')}</span>`;
          box.append(d);
        });
        if (!(card.items || []).length) box.innerHTML = '<p class="dim">kuch nahi mila</p>';
      } catch (err) {
        box.innerHTML = `<p class="dim">error: ${esc(err.message)}</p>`;
      }
    });

    $('#urlForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const u = $('#urlInput').value.trim();
      if (!u) return;
      setView('console');
      run(`open ${u}`);
      $('#urlInput').value = '';
    });

    $('#voiceBtn').addEventListener('click', () => {
      S.voice = !S.voice;
      store.set('rahul_voice', S.voice);
      $('#voiceBtn').setAttribute('aria-pressed', String(S.voice));
      $('#voiceToggle').checked = S.voice;
      toast('VOICE', S.voice ? 'on' : 'off');
      if (S.voice) speak('Bol, Gojo.');
    });

    $('#soundBtn').addEventListener('click', () => {
      S.sound = !S.sound;
      store.set('rahul_sound', S.sound);
      $('#soundBtn').setAttribute('aria-pressed', String(S.sound));
      $('#soundToggle').checked = S.sound;
      if (S.sound) sfx('recv');
    });

    $('#fsBtn').addEventListener('click', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
      else document.exitFullscreen().catch(() => {});
    });

    $('#voiceToggle').addEventListener('change', (e) => {
      S.voice = e.target.checked;
      store.set('rahul_voice', S.voice);
      $('#voiceBtn').setAttribute('aria-pressed', String(S.voice));
    });
    $('#soundToggle').addEventListener('change', (e) => {
      S.sound = e.target.checked;
      store.set('rahul_sound', S.sound);
      $('#soundBtn').setAttribute('aria-pressed', String(S.sound));
    });
    $('#matrixToggle').addEventListener('change', (e) => {
      S.matrix = e.target.checked;
      store.set('rahul_matrix', S.matrix);
      startMatrix();
    });
    $('#resetChat').addEventListener('click', () => { el.chat.innerHTML = ''; greet(); });
    $('#connectPc').addEventListener('click', () => { setView('settings'); $('#bridgeInput').focus(); });
    $('#bridgeApply').addEventListener('click', () => applyBridge($('#bridgeInput').value.trim(), $('#tokenInput').value.trim()));

    $('#paletteInput').addEventListener('input', (e) => { palSel = 0; renderPalette(e.target.value); });
    $('#paletteInput').addEventListener('keydown', (e) => {
      const items = $$('#paletteList li');
      if (e.key === 'ArrowDown') { e.preventDefault(); palSel = Math.min(items.length - 1, palSel + 1); renderPalette(el.paletteInput.value); }
      if (e.key === 'ArrowUp') { e.preventDefault(); palSel = Math.max(0, palSel - 1); renderPalette(el.paletteInput.value); }
      if (e.key === 'Enter') {
        const sel = items[palSel];
        if (sel) sel.click();
      }
      if (e.key === 'Escape') closePalette();
    });
    el.palette.addEventListener('click', (e) => { if (e.target === el.palette) closePalette(); });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        el.palette.hidden ? openPalette() : closePalette();
      }
    });

    addEventListener('resize', drawSpark);
  }

  function filesInto(dir) {
    const box = $('#fileResults');
    setView('files');
    if (S.mode === 'cloud') { box.innerHTML = '<p class="dim">cloud mode — PC connect karo</p>'; return; }
    box.innerHTML = '<p class="dim">loading…</p>';
    api('/api/command', { method: 'POST', body: { text: `list ${dir}` } })
      .then((r) => {
        box.innerHTML = '';
        if (!r.card) { box.innerHTML = `<p class="dim">${esc(r.reply)}</p>`; return; }
        (r.card.items || []).forEach((it) => {
          const d = document.createElement('div');
          d.className = 'f';
          d.innerHTML = `<span>${it.dir ? '▸' : '·'}</span><span>${esc(it.name)}</span><span class="p">${it.dir ? 'dir' : fmtBytes(it.size)}</span>`;
          box.append(d);
        });
      })
      .catch((e) => { box.innerHTML = `<p class="dim">error: ${esc(e.message)}</p>`; });
  }

  function tickClock() {
    const d = new Date();
    el.clock.textContent = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  async function init() {
    startMatrix();
    wire();
    renderApps();
    renderSuggest();
    simulate();
    tickClock();
    setInterval(tickClock, 1000);

    await detect();
    syncSettings();

    $('#voiceToggle').checked = S.voice;
    $('#soundToggle').checked = S.sound;
    $('#matrixToggle').checked = S.matrix;
    $('#voiceBtn').setAttribute('aria-pressed', String(S.voice));
    $('#soundBtn').setAttribute('aria-pressed', String(S.sound));

    if (S.mode === 'local' || S.mode === 'remote') {
      connectStream();
      refresh();
      setInterval(refresh, 10000);
    }

    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === '127.0.0.1' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    runBoot();
    setTimeout(() => { if (!booted) finishBoot(); }, 5200);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
