// End-to-end: real server, 200 simulated phones over WebSockets, a full
// 6-week game, with a hard server crash + restart in the middle.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const WebSocket = require('ws');

const PHONES = Number(process.env.PHONES) || 200;
const PORT = 3900 + Math.floor(Math.random() * 90);
const TOKEN = 'testtoken';
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'survive-test-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server = null;
let serverErrors = '';
function startServer(fresh) {
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js'), `--port=${PORT}`, ...(fresh ? ['--fresh'] : [])], {
    env: { ...process.env, DATA_DIR: DATA, QUIET: '1', HOST_TOKEN: TOKEN },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (d) => (serverErrors += d));
  return waitFor(async () => {
    try { const r = await fetch(`http://localhost:${PORT}/healthz`); return r.ok; } catch { return false; }
  }, 8000, 'server start');
}

async function waitFor(fn, ms, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return true;
    await sleep(40);
  }
  throw new Error('timeout waiting for ' + label);
}

// ── simulated phone ──
class Phone {
  constructor(i) {
    this.i = i;
    this.id = 'phone' + String(i).padStart(4, '0');
    this.state = null;
    this.sent = {}; // week → { key: value }
    this.forecasted = {};
    this.closed = false;
    this.connect();
  }
  connect() {
    if (this.closed) return;
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    this.ws = ws;
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', deviceId: this.id })));
    ws.on('message', (raw) => this.onState(JSON.parse(raw)));
    ws.on('close', () => setTimeout(() => this.connect(), 150));
    ws.on('error', () => {});
  }
  onState(m) {
    if (m.t !== 'state') return;
    this.state = m;
    const { pub } = m;
    const w = pub.week;
    if (pub.phase === 'forecast' && !this.forecasted[w]) {
      this.forecasted[w] = true;
      const opts = pub.question.options;
      this.send({ t: 'forecast', v: opts[(this.i + w) % opts.length].v });
    }
    if (pub.phase === 'vote') {
      const mine = this.sent[w] || (this.sent[w] = {});
      for (const k of pub.decisions) {
        if (mine[k]) continue;
        const opts = { discount: ['none', 'd10', 'd30'], ads: ['none', 'small', 'big'], stock: ['lean', 'right', 'heavy'], staff: ['keep', 'add'], bonus: ['take', 'skip'] }[k];
        mine[k] = opts[(this.i * 7 + w * 3 + k.length) % opts.length];
        this.send({ t: 'vote', key: k, v: mine[k] });
      }
    }
  }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  close() { this.closed = true; this.ws.close(); }
}

// ── host ──
class Host {
  constructor() { this.view = null; this.connect(); }
  connect() {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    this.ws = ws;
    ws.on('open', () => ws.send(JSON.stringify({ t: 'host', token: TOKEN })));
    ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.t === 'state') this.view = m.view; });
    ws.on('close', () => { if (!this.closed) setTimeout(() => this.connect(), 150); });
    ws.on('error', () => {});
  }
  cmd(c, extra = {}) { this.ws.send(JSON.stringify({ t: 'cmd', cmd: c, ...extra })); }
  phase() { return this.view && this.view.phase; }
  close() { this.closed = true; this.ws.close(); }
}

test(`${PHONES} phones play a full game, survive a server crash, and tallies are exact`, { timeout: 120000 }, async () => {
  await startServer(true);
  const host = new Host();
  await waitFor(() => host.view, 3000, 'host view');
  const phones = Array.from({ length: PHONES }, (_, i) => new Phone(i));
  await waitFor(() => host.view.counts.players === PHONES, 10000, 'all phones joined');

  host.cmd('settings', { settings: { weeks: 6, timer: 15 } });
  await waitFor(() => host.view.weeks === 6, 3000, 'settings');
  host.cmd('next'); // start
  let crashed = false;
  let scoreBeforeCrash = null;

  for (let guard = 0; guard < 200 && host.phase() !== 'ending'; guard++) {
    const v = host.view;
    const phase = v.phase;
    const week = v.week;
    if (phase === 'brief') host.cmd('next');
    else if (phase === 'forecast') {
      await waitFor(() => host.view.counts.voted >= PHONES || host.phase() !== 'forecast', 8000, 'forecasts');
      if (host.phase() === 'forecast') host.cmd('next');
    } else if (phase === 'vote') {
      const keys = v.decisions;
      await waitFor(() => phones.every((p) => p.sent[week] && keys.every((k) => p.sent[week][k])), 10000, 'phones voted');
      await waitFor(() => host.view.counts.voted >= PHONES, 8000, 'vote count reaches 200');
      host.cmd('next');
      await waitFor(() => host.phase() === 'split' && host.view.split, 5000, 'split');
      // exact tallies: compare server counts with what the phones sent
      const sp = host.view.split;
      for (const k of keys) {
        const expected = {};
        phones.forEach((p) => { const val = p.sent[week][k]; expected[val] = (expected[val] || 0) + 1; });
        for (const [opt, n] of Object.entries(sp.split[k].counts)) assert.equal(n, expected[opt] || 0, `week ${week} ${k}=${opt}`);
        assert.equal(sp.split[k].total, PHONES);
      }
    } else if (phase === 'split') host.cmd('next');
    else if (phase === 'reveal') host.cmd('next');
    else if (phase === 'leaderboard') {
      if (week === 3 && !crashed) {
        // ── crash the server hard, then restart it ──
        crashed = true;
        scoreBeforeCrash = host.view.leaderboard[0];
        await sleep(2300); // let the throttled save land
        server.kill('SIGKILL');
        await new Promise((r) => server.once('exit', r));
        host.view = null;
        await startServer(false);
        await waitFor(() => host.view && host.view.phase === 'leaderboard', 8000, 'host resumes');
        await waitFor(() => host.view.counts.total >= PHONES, 10000, 'phones reconnect');
        assert.equal(host.view.week, 3, 'resumed in the same week');
        assert.equal(host.view.counts.players, PHONES, 'nobody lost');
        assert.deepEqual(host.view.leaderboard[0], scoreBeforeCrash, 'scores survive the crash');
        // phones kept their identity
        const p0 = phones[0].state.me;
        assert.ok(p0 && p0.id === phones[0].id);
      }
      host.cmd('next');
    }
    await waitFor(() => !host.view || host.view.phase !== phase || host.view.week !== week || host.view.phase === 'ending', 8000, `leave ${phase} w${week}`);
  }

  assert.equal(host.phase(), 'ending');
  assert.ok(crashed, 'the crash test ran');
  const e = host.view.ending;
  assert.ok(e && e.sheet.balanced, 'final balance sheet balances');
  assert.ok(e.content.title);
  assert.ok(e.comparison.sheet.balanced);
  // phones see the ending too
  await waitFor(() => phones.every((p) => p.state && p.state.pub.phase === 'ending'), 5000, 'phones see ending');
  assert.ok(phones.every((p) => p.state.me.score >= 0 && p.state.me.rank >= 1));

  phones.forEach((p) => p.close());
  host.close();
  server.kill('SIGTERM');
  assert.equal(serverErrors.trim(), '', 'server printed no errors');
});

test.after(() => { try { server && server.kill('SIGKILL'); } catch {} });
