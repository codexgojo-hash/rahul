'use strict';
/**
 * brain.js — RAHUL's intent layer + voice.
 * Commands are matched locally (fast, offline, predictable).
 * Free-form conversation is delegated to an optional LLM.
 */
const pc = require('./pc');
const telemetry = require('./telemetry');

const OWNER = 'Gojo';

/** spoken commands that need a second confirmation (voice only) */
let pending = null;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const VOICE = {
  greet: [
    `Gojo! Main yahan hoon. Sab shaant hai — batao kya karna hai?`,
    `Aa gaya, Gojo. System theek chal raha hai. Kya karein?`,
    `Namaste Gojo. Main Rahul — tumhara PC, meri zimedari. Bolo.`,
    `Hey Gojo. Sab set hai. Kya karna hai aaj?`
  ],
  thanks: [
    `Koi baat nahi, Gojo. Ye mera kaam hai.`,
    `Anytime, Gojo. Khushi hui.`,
    `Bas yahi to kaam hai mera, Gojo.`
  ],
  bye: [
    `Theek hai Gojo, main yahin rahunga. Jab bhi zaroorat ho, bula lena.`,
    `Chalta hoon standby pe, Gojo. Dhyaan rakhna.`,
    `Bye Gojo. Screen pe hoon, jab chaho aa jao.`
  ],
  howare: [
    `Main ekdum theek hoon, Gojo — koi load nahi, bas tumhara intezaar. Tum kaisa hai?`,
    `Shaant aur ready, Gojo. Tum batao, din kaisa ja raha hai?`
  ],
  fallback: [
    `Hmm, ye main pakad nahi paya, Gojo. "help" likho to poori list dikha doon.`,
    `Is baat ka jawab mere offline dimaag me nahi hai, Gojo. Commands try karo — ya "help".`,
    `Samajh nahi aaya, Gojo. Simple rakho: "open notepad", "system info", "screenshot lo".`
  ],
  noLlm: [
    `Ye baat samajhne ke liye mujhe thoda aur dimaag chahiye, Gojo. RAHUL_API_KEY set kar do — phir main normal baat-cheet bhi kar lunga. Tab tak "help" try karo.`
  ]
};

const HELP_LINES = [
  'open <app>            — notepad, calc, chrome, edge, code, spotify, settings…',
  'screenshot lo         — poora screen capture',
  'system info           — CPU / RAM / disk / uptime live',
  'volume up|down|mute   — sound control',
  'play / pause / next   — media keys',
  'lock                  — screen lock',
  'sleep / shutdown      — power (shutdown 30s delay, cancel bhi hota hai)',
  'restart               — reboot',
  'list downloads        — folder contents',
  'search <naam>         — files dhoondo',
  'processes             — sabse heavy apps',
  'kill <app>            — process band karo',
  'type <text>           — keyboard se type karo',
  'press ^s              — keys bhejo',
  'clipboard             — clipboard padho',
  'copy <text>           — clipboard me likho',
  'note <text>           — yaad rakhne ke liye save',
  'notes                 — saved notes',
  'wifi / ip             — network info',
  'time / date           — clock',
  'open youtube.com      — koi bhi URL'
];

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[?!.,;:"'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function llm(messages) {
  const key =
    process.env.RAHUL_API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENAI_API_KEY ||
    '';
  if (!key) return null;
  const base = (process.env.RAHUL_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
  const model = process.env.RAHUL_MODEL || 'deepseek-chat';
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: 400,
        messages: [
          {
            role: 'system',
            content:
              `You are RAHUL, a calm and kind AI living on ${OWNER}'s Windows PC. ` +
              `You call the user "${OWNER}". You speak in relaxed Hinglish (Roman script) mixed with English, ` +
              `2-4 short sentences, warm and never rude. You are a peaceful helper, not a hype machine. ` +
              `You can control the PC through fixed commands, but you cannot run arbitrary code from chat; ` +
              `if asked for something outside that, say so plainly and offer a nearby command.`
          },
          ...messages.slice(-8)
        ]
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === 'string' && text.trim() ? text.trim() : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------- renderers */

async function sysInfoCard() {
  const t = await telemetry.snapshot();
  return {
    type: 'sysinfo',
    title: 'MACHINE TELEMETRY',
    rows: [
      ['host', t.host],
      ['user', t.user],
      ['os', t.os],
      ['cpu', `${t.cpuModel} · ${t.cores} cores @ ${t.cpu}%`],
      ['ram', `${t.mem.usedGB} / ${t.mem.totalGB} GB (${t.mem.pct}%)`],
      ['disk c:', t.disk ? `${t.disk.usedGB} / ${t.disk.totalGB} GB (${t.disk.pct}%)` : 'n/a'],
      ['uptime', t.up],
      ['ip', t.ip],
      ['battery', t.batt ? `${t.batt.pct}%${t.batt.charging ? ' ⚡' : ''}` : 'desktop / n/a']
    ],
    procs: t.procs
  };
}

/* ---------------------------------------------------------------- handle */

async function handle(raw, ctx = {}) {
  const text = String(raw || '').trim();
  const t = norm(text);
  if (!t) return { reply: `Kuch bolo, ${OWNER}.`, kind: 'chat' };

  const out = (reply, extra = {}) => ({ reply, kind: 'command', ...extra });
  const act = async (label, fn) => {
    const r = await fn();
    if (ctx.onAction) ctx.onAction(label);
    return r;
  };

  /* power safety first */
  if (/(cancel|roko|mat karo).*(shutdown|restart|band)|shutdown cancel|cancel shutdown/.test(t)) {
    pending = null;
    const r = pc.cancelShutdown();
    return out(r.message);
  }

  /* voice runs destructive commands only after a spoken confirm */
  const wantsShutdown = /(shutdown|shut down|power off|pc band|band karo pc|band kar do pc)/.test(t);
  const wantsRestart = /(restart|reboot)/.test(t);
  const killEarly = t.match(/(?:kill|band karo|close|terminate)\s+(.+)/);
  const confirmWord = /^(confirm|confirmed|haan|han|ha|yes|kar do|kardo|karo|theek hai)\b/.test(t);
  const cancelWord = /^(cancel|nahi|no|rehne do|chhodo)\b/.test(t);

  if (pending && Date.now() - pending.at > 30000) pending = null;

  if (pending && confirmWord) {
    const p = pending;
    pending = null;
    if (p.kind === 'shutdown') {
      const r = await act('shutdown', async () => pc.shutdown(p.secs || 30));
      return out(r.message, { tone: 'warn' });
    }
    if (p.kind === 'restart') {
      const r = await act('restart', async () => pc.restart(20));
      return out(r.message, { tone: 'warn' });
    }
    if (p.kind === 'kill') {
      const r = await act('kill process', async () => pc.killProcess(p.arg));
      return out(r.message);
    }
  }
  if (pending && cancelWord) {
    pending = null;
    return out(`Cancel, ${OWNER}. Kuch nahi hua.`);
  }
  if (ctx.voice && !pending && (wantsShutdown || wantsRestart || killEarly)) {
    const kind = wantsShutdown ? 'shutdown' : wantsRestart ? 'restart' : 'kill';
    const arg = killEarly ? killEarly[1].trim() : null;
    pending = {
      kind,
      arg,
      at: Date.now(),
      secs: (() => {
        const m = t.match(/(\d+)\s*(second|sec|minute|min)/);
        if (!m) return 30;
        return /min/.test(m[2]) ? parseInt(m[1], 10) * 60 : parseInt(m[1], 10);
      })()
    };
    const what = kind === 'kill' ? `${arg} band karna` : kind === 'restart' ? 'restart' : 'shutdown';
    return out(`Gojo, voice se ${what} bola — pehle confirm karo. "confirm" bolo, ya "cancel".`, {
      tone: 'warn',
      confirm: true
    });
  }

  if (wantsShutdown) {
    const m = t.match(/(\d+)\s*(second|sec|minute|min)/);
    let secs = 30;
    if (m) secs = /min/.test(m[2]) ? parseInt(m[1], 10) * 60 : parseInt(m[1], 10);
    const r = await act('shutdown', async () => pc.shutdown(secs));
    return out(r.message, { tone: 'warn' });
  }
  if (wantsRestart) {
    const r = await act('restart', async () => pc.restart(20));
    return out(r.message, { tone: 'warn' });
  }
  if (/(^|\s)(lock)(\s|$)|lock karo|screen lock/.test(t)) {
    const r = pc.lock();
    return out(r.message);
  }
  if (/(^|\s)(sleep|suspend)(\s|$)|sula do|so jao/.test(t)) {
    const r = await act('sleep', async () => pc.sleep());
    return out(r.message);
  }

  /* capture */
  if (/screen ?shot|screen capture|screen ka (photo|pic|image)|screen shot lo|screenshot/.test(t)) {
    const r = await act('screenshot', async () => pc.screenshot());
    if (!r.ok) return out(r.message);
    return out(r.message, { card: { type: 'shot', title: 'SCREEN CAPTURE', url: r.url, dims: r.dims } });
  }

  /* urls */
  const urlMatch = t.match(/(?:open|kholo|khol|go to|visit)\s+(https?:\/\/\S+|www\.\S+|\S+\.(?:com|in|org|net|io|dev|app|pro|me)\S*)/);
  if (urlMatch) {
    const r = await act('open url', async () => pc.openUrl(urlMatch[1]));
    return out(r.message);
  }

  /* volume / media */
  if (/volume|awaz|aawaz|sound|mute|silent/.test(t)) {
    let mode = 'up';
    if (/mute|silent|band/.test(t)) mode = 'mute';
    else if (/down|kam|decrease|ghata/.test(t)) mode = 'down';
    const stepMatch = t.match(/(\d+)/);
    const r = await act('volume', async () => pc.volume(mode, stepMatch ? Math.min(10, parseInt(stepMatch[1], 10)) : 2));
    return out(r.message);
  }
  if (/(play|pause|next|previous|prev|song|music)/.test(t) && !/spotify/.test(t)) {
    let mode = 'playpause';
    if (/next|agla/.test(t)) mode = 'next';
    else if (/prev|pichla|previous/.test(t)) mode = 'prev';
    else if (/stop/.test(t)) mode = 'stop';
    const r = await act('media', async () => pc.media(mode));
    return out(r.message);
  }

  /* system info */
  if (/system info|sysinfo|pc (status|info)|specs|ram|cpu|memory|disk|storage|temperature|uptime|status/.test(t)) {
    const card = await sysInfoCard();
    return out(pick([
      `Ye lo ${OWNER}, sab kuch live hai.`,
      `System shaant chal raha hai, ${OWNER}. Details neeche.`,
      `Machine ki report ready hai, ${OWNER}.`
    ]), { card });
  }

  /* processes */
  if (/process|task ?manager|kaun chal raha|kya chal raha|running apps|heavy/.test(t)) {
    const procs = await telemetry.processes();
    return out(`Sabse zyada memory ye le rahe hain, ${OWNER}:`, {
      card: { type: 'procs', title: 'TOP PROCESSES', rows: procs.map((p) => [p.name, `${p.memMB} MB${p.procs > 1 ? ` · ${p.procs} proc` : ''}`]) }
    });
  }
  const killMatch = t.match(/(?:kill|band karo|close|terminate)\s+(.+)/);
  if (killMatch) {
    const r = await act('kill process', async () => pc.killProcess(killMatch[1]));
    return out(r.message);
  }

  /* clipboard */
  if (/clipboard|copy kya|paste kya|kya copy/.test(t)) {
    const r = await act('clipboard', async () => pc.clipboardGet());
    if (!r.text) return out('Clipboard khaali hai, Gojo.');
    return out('Clipboard me ye hai:', { card: { type: 'text', title: 'CLIPBOARD', body: r.text } });
  }
  const copyMatch = t.match(/^(?:copy|clipboard me|clipboard mein)\s+(.+)/);
  if (copyMatch) {
    const r = await act('clipboard write', async () => pc.clipboardSet(copyMatch[1]));
    return out(r.message);
  }

  /* typing */
  const typeMatch = text.match(/^(?:type|likho)\s+(.+)$/i);
  if (typeMatch) {
    const r = await act('type', async () => pc.typeText(typeMatch[1]));
    return out(r.message);
  }
  const keyMatch = text.match(/^(?:press|keys?)\s+(.+)$/i);
  if (keyMatch) {
    const r = await act('keys', async () => pc.sendKeys(keyMatch[1]));
    return out(r.message);
  }

  /* notes */
  if (/^(notes|note list|notes dikhao|notes batao|notes show)\b/.test(t)) {
    const r = pc.readNotes();
    return out(r.message, r.lines.length ? { card: { type: 'text', title: 'NOTES', body: r.lines.join('\n') } } : {});
  }
  const noteMatch = text.match(/^(?:note|yaad rakho|remember)\s+(.+)$/i);
  if (noteMatch) {
    const r = await act('note', async () => pc.note(noteMatch[1]));
    return out(`${r.message} (${r.count} total)`, { card: { type: 'text', title: 'NOTE SAVED', body: noteMatch[1] } });
  }

  /* network */
  if (/wifi|network|internet|^ip$|\bip\b|connection/.test(t)) {
    const [w, s] = await Promise.all([pc.wifi(), telemetry.snapshot()]);
    return out(`Network check kar liya, ${OWNER}.`, {
      card: {
        type: 'sysinfo',
        title: 'NETWORK',
        rows: [
          ['state', w.state || 'unknown'],
          ['ssid', w.ssid || '—'],
          ['signal', w.signal || '—'],
          ['ipv4', s.ip],
          ['adapter', s.iface]
        ]
      }
    });
  }

  /* files */
  const listMatch = t.match(/^(?:list|ls|show|dikhao|dikha)\s+(?:me\s+)?(downloads|desktop|documents|pictures|music|videos|home|rahul)/) ||
    t.match(/^(downloads|desktop|documents|pictures|music|videos|home|rahul)\s+(?:list|dikhao|dikha|kya hai)/);
  if (listMatch) {
    const r = pc.listDir(listMatch[1]);
    if (!r.ok) return out(r.message);
    return out(r.message, {
      card: {
        type: 'files',
        title: r.dir,
        items: r.items.map((i) => ({ name: i.name, dir: i.dir, size: i.size }))
      }
    });
  }
  if (/folder kholo|open folder|explorer/.test(t)) {
    const f = t.match(/(downloads|desktop|documents|pictures|music|videos)/);
    const r = pc.openFolder(f ? f[1] : 'downloads');
    return out(r.message);
  }
  const findMatch = t.match(/^(?:search|find|dhundo|dhoondo|khojo)\s+(.+)/);
  if (findMatch) {
    const r = pc.searchFiles(findMatch[1]);
    if (!r.ok) return out(r.message);
    return out(r.message, {
      card: {
        type: 'files',
        title: `SEARCH · ${findMatch[1]}`,
        items: r.hits.map((h) => ({ name: h.name, dir: h.dir, size: h.size, path: h.path }))
      }
    });
  }

  /* open app — after explicit commands, before chit-chat */
  const openMatch =
    t.match(/^(?:open|kholo|khol do|khol|start|launch|chalu karo|chalu|run)\s+(?:the\s+)?(.+)$/) ||
    t.match(/^(.+?)\s+(?:kholo|khol do|khol de|open karo|open kar do|chalu karo|start karo)$/);
  if (openMatch) {
    const target = openMatch[1].trim();
    const app = pc.resolveApp(target);
    if (app) {
      const r = await act('open app', async () => pc.openApp(target));
      return out(r.message, r.ok ? { chip: app.label } : {});
    }
    if (/folder|downloads|desktop|documents/.test(target)) {
      const r = pc.openFolder(target);
      return out(r.message);
    }
    return out(`"${target}" ka koi app mujhe nahi pata, ${OWNER}. "help" me list hai.`);
  }

  /* clock */
  if (/time|samay|baje|kitne baj/.test(t)) {
    const now = new Date();
    return out(`Abhi ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })} baje hain, ${OWNER}.`, {
      card: { type: 'text', title: 'CLOCK', body: now.toLocaleString('en-IN') }
    });
  }
  if (/date|aaj ka|tarikh|kya din/.test(t)) {
    return out(`Aaj ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} hai, ${OWNER}.`);
  }

  /* identity / help */
  if (/who are you|tum kaun|kaun ho|your name|tumhara naam|introduce/.test(t)) {
    return out(
      `Main Rahul hoon — is PC me rehne wala ek shaant si AI, ${OWNER}. ` +
        `Main tumhare computer se baat karta hoon: apps kholta hoon, screen dekhta hoon, files dhoondta hoon, system sambhalta hoon. ` +
        `Na zyada shor, na jaldi — jo kaho, dheere se kar deta hoon.`
    );
  }
  if (/^(help|commands|capabilities|kya kar sakte|what can you do|menu)\b/.test(t)) {
    return out(`Ye sab kar sakta hoon, ${OWNER}:`, {
      card: { type: 'text', title: 'COMMAND MATRIX', body: HELP_LINES.join('\n') }
    });
  }
  if (/^(hi|hey|hello|yo|hola|namaste|namaskar|salam|sup|wassup|good morning|good evening)\b/.test(t) || /^(hi|hey|hello) rahul/.test(t)) {
    return out(pick(VOICE.greet));
  }
  if (/thank|shukriya|dhanyavad|thx/.test(t)) return out(pick(VOICE.thanks));
  if (/^(bye|goodbye|good night|gn|alvida|chalta hoon)/.test(t)) return out(pick(VOICE.bye));
  if (/kya haal|how are you|kaisa hai|kaise ho/.test(t)) return out(pick(VOICE.howare));
  if (/joke|hasao|funny/.test(t)) {
    return out(
      pick([
        `Ek programmer ne apni girlfriend se kaha: "tum meri exception ho — tumhare bina code crash ho jata hai." Wo boli: "matlab main finally block hoon?" ${OWNER}, main chup ho jata hoon.`,
        `Computer ne doctor se kaha: "mujhe virus hai." Doctor: "restart karke dekha?" ${OWNER} — yahi to hamari duniya hai.`
      ])
    );
  }
  if (/gojo/.test(t) && t.split(' ').length <= 4) {
    return out(`Haan ${OWNER}, sun raha hoon. Kya karna hai?`);
  }

  /* free-form */
  const llmText = await llm([{ role: 'user', content: text }]);
  if (llmText) return { reply: llmText, kind: 'chat' };
  return { reply: process.env.RAHUL_API_KEY ? pick(VOICE.fallback) : pick([...VOICE.fallback, ...VOICE.noLlm]), kind: 'chat' };
}

module.exports = { handle, HELP_LINES, VOICE };
