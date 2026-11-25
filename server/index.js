// Survive 12 Weeks: the server.
//   npm start          normal game
//   npm run demo       game + simulated crowd for rehearsal
//   npm run tunnel     game + public URL through cloudflared
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const express = require('express');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const { Game } = require('./game');
const { BotCrowd } = require('./bots');
const { previewEndings } = require('./preview');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const flag = (name) => args.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const flagVal = (name) => { const a = args.find((x) => x.startsWith(`--${name}=`)); return a ? a.split('=')[1] : null; };

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const PORT = Number(flagVal('port') || process.env.PORT || config.port || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DEMO = flag('demo');
const TUNNEL = flag('tunnel');
const QUIET = !!process.env.QUIET;
fs.mkdirSync(DATA_DIR, { recursive: true });

// Host token: stays the same between restarts so your host link keeps working.
const tokenFile = path.join(DATA_DIR, 'host-token.txt');
let HOST_TOKEN = process.env.HOST_TOKEN;
if (!HOST_TOKEN) {
  if (fs.existsSync(tokenFile)) HOST_TOKEN = fs.readFileSync(tokenFile, 'utf8').trim();
  else { HOST_TOKEN = crypto.randomBytes(4).toString('hex'); fs.writeFileSync(tokenFile, HOST_TOKEN); }
}

const saveFile = path.join(DATA_DIR, 'game.json');
if (flag('fresh') && fs.existsSync(saveFile)) fs.unlinkSync(saveFile);

// ── network address / join URL ──
function lanIp() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const [name, list] of Object.entries(nets)) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) candidates.push({ name, address: n.address });
    }
  }
  const pref = candidates.find((c) => /^(en|eth|wlan|wl)/.test(c.name)) || candidates[0];
  return pref ? pref.address : 'localhost';
}
let tunnelUrl = null;
// Public address: set by you (BASE_URL), by Render automatically, or by the tunnel.
const PUBLIC_URL = process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || null;
const joinUrl = () => (PUBLIC_URL || tunnelUrl || `http://${lanIp()}:${PORT}`).replace(/\/$/, '');
const hostBase = () => (PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const qrCache = new Map();
async function qrFor(url) {
  if (!qrCache.has(url)) qrCache.set(url, await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#2a1508', light: '#fffaf0' } }));
  return qrCache.get(url);
}
const isLocal = (host) => /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(host || '');
// The address the audience should use, as seen from one host screen: if you
// opened the host page at a public address, the QR uses that same address.
function joinUrlFor(ws) {
  if (process.env.BASE_URL || tunnelUrl) return joinUrl();
  if (ws && ws.origin && !isLocal(ws.originHost)) return ws.origin;
  return joinUrl();
}

// ── game + broadcasting ──
const sockets = { hosts: new Set(), phones: new Map() }; // phones: ws → deviceId
let pending = null;
let lastFull = 0;
function scheduleBroadcast({ light }) {
  if (pending) return;
  const wait = light ? Math.max(0, 300 - (Date.now() - lastFull)) : 0;
  pending = setTimeout(broadcast, wait);
}

async function broadcast() {
  pending = null;
  lastFull = Date.now();
  const view = game.hostView();
  for (const ws of sockets.hosts) {
    if (ws.readyState !== 1) continue;
    const url = joinUrlFor(ws);
    ws.send(JSON.stringify({ t: 'state', view, join: { url, qr: await qrFor(url) } }));
  }
  const pub = JSON.stringify(game.publicView());
  for (const [ws, id] of sockets.phones) {
    if (ws.readyState !== 1) continue;
    ws.send(`{"t":"state","pub":${pub},"me":${JSON.stringify(game.playerView(id))}}`);
  }
}

const game = new Game({ config, file: saveFile, onChange: scheduleBroadcast });
let bots = null;
if (DEMO) {
  bots = new BotCrowd(game, Number(flagVal('bots')) || config.demoBots || 60);
  setInterval(() => bots.tick(), 200);
}

// ── web server ──
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true); // so links show https behind Render's proxy
const pub = path.join(ROOT, 'public');
const page = (file) => (req, res) => res.sendFile(path.join(pub, file));
const DENIED = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 20px;line-height:1.5;color:#2a1508">
<h1>Host link needed</h1>
<p>This page is the presenter’s screen, so it needs the secret token at the end of the address:<br><code>__ADDR__/host?token=YOUR-TOKEN</code></p>
<p><b>Running online on Render?</b> Open your service on dashboard.render.com → <b>Environment</b> → copy the value of <b>HOST_TOKEN</b>, then add <code>?token=</code> and that value to this address.</p>
<p><b>Running on your laptop?</b> Use the host link printed in the terminal.</p>
<p>Joining as a player? Go to the <a href="/">join page</a> instead.</p></div>`;
const hostOnly = (req, res, next) => (req.query.token === HOST_TOKEN ? next() : res.status(403).send(DENIED.replace('__ADDR__', req.protocol + '://' + (req.headers['x-forwarded-host'] || req.headers.host))));
app.get('/', page('vote.html'));
app.get('/vote', page('vote.html'));
app.get('/host', hostOnly, page('host.html'));
app.get('/ending-preview', hostOnly, page('ending-preview.html'));
app.get('/api/endings', hostOnly, (req, res) => res.json(previewEndings(Number(req.query.weeks) || 12)));
app.get('/healthz', (req, res) => res.json({ ok: true, phase: game.s.phase, players: Object.keys(game.s.players).length, configuredJoinUrl: joinUrl() }));
app.use(express.static(pub, { maxAge: 0 }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

wss.on('connection', (ws, req) => {
  const fwdHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const fwdProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || (req.socket.encrypted ? 'https' : 'http');
  ws.originHost = fwdHost;
  ws.origin = fwdHost ? `${fwdProto}://${fwdHost}` : null;
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'host') {
      if (m.token !== HOST_TOKEN) { ws.send(JSON.stringify({ t: 'denied' })); return ws.close(); }
      ws.isHost = true;
      sockets.hosts.add(ws);
      return scheduleBroadcast({ light: false });
    }
    if (ws.isHost && m.t === 'cmd') return hostCommand(m);
    if (m.t === 'hello') {
      const id = String(m.deviceId || '').slice(0, 64);
      if (!/^[a-zA-Z0-9_-]{6,64}$/.test(id)) return;
      ws.deviceId = id;
      sockets.phones.set(ws, id);
      game.join(id, m.nick);
      return scheduleBroadcast({ light: false });
    }
    const id = ws.deviceId;
    if (!id) return;
    if (m.t === 'nick') game.setNick(id, m.nick);
    else if (m.t === 'forecast') game.forecast(id, m.v);
    else if (m.t === 'vote') game.vote(id, m.key, m.v);
  });
  ws.on('close', () => {
    sockets.hosts.delete(ws);
    const id = sockets.phones.get(ws);
    sockets.phones.delete(ws);
    if (id && ![...sockets.phones.values()].includes(id)) game.disconnect(id);
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, 15000);

function hostCommand(m) {
  switch (m.cmd) {
    case 'next': return game.next();
    case 'pause': return game.pause();
    case 'addTime': return game.addTime(15000);
    case 'settings': return game.setSettings(m.settings || {});
    case 'restart': return game.reset(true, Math.floor(Math.random() * 1e6));
    case 'replay': return game.reset(true);
    case 'autoplay': return game.setAutoplay(m.on);
    case 'kick-all': return game.reset(false);
    default: return undefined;
  }
}

// ── cloudflared tunnel ──
function startTunnel() {
  let proc;
  try {
    proc = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`]);
  } catch (e) { return tunnelMissing(); }
  proc.on('error', tunnelMissing);
  const onData = (d) => {
    const m = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && !tunnelUrl) {
      tunnelUrl = m[0];
      console.log(`\n🌍 Public tunnel ready: ${tunnelUrl}\n   The QR code on the host screen now points here.\n`);
      printQr();
      scheduleBroadcast({ light: false });
    }
  };
  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);
  process.on('exit', () => proc.kill());
}
function tunnelMissing() {
  console.log('\n⚠  cloudflared is not installed, so no public tunnel was created.');
  console.log('   Install it (Mac: `brew install cloudflared`, Windows: `winget install Cloudflare.cloudflared`),');
  console.log('   or use your phone hotspot instead. The game still works on the local network.\n');
}

async function printQr() {
  if (QUIET) return;
  const url = joinUrl();
  console.log(await QRCode.toString(url, { type: 'terminal', small: true }));
  console.log(`📱 Audience joins at:  ${url}`);
}

server.listen(PORT, async () => {
  if (QUIET) return;
  console.log('\n🍛  SURVIVE 12 WEEKS · cloud kitchen game\n');
  await printQr();
  console.log(`🖥  HOST SCREEN (open this on the projector laptop, keep it private):`);
  console.log(`    ${hostBase()}/host?token=${HOST_TOKEN}`);
  console.log(`🎬  Rehearse endings: ${hostBase()}/ending-preview?token=${HOST_TOKEN}`);
  if (DEMO) console.log(`🤖  Demo mode: ${bots.bots.length} simulated voters joined. Press A on the host screen for auto-play.`);
  if (game.s.phase !== 'setup') console.log(`↩  Resumed a saved game (week ${game.s.week}, ${game.s.phase}). Press R on the host screen to start over.`);
  console.log('\nPress Ctrl+C to stop.\n');
  if (TUNNEL) startTunnel();
});

function shutdown() { game.save(); process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
