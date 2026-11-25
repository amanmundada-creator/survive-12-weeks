// End-to-end: real server, 200 simulated phones over WebSockets, each running
// its own kitchen, a full game (until the 12-week cap) with a hard server
// crash + restart in the middle. Checks exact answer counts, that questions
// and decisions end early once everyone is in, and that the winner's balance
// sheet balances.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const WebSocket = require('ws');

const PHONES = Number(process.env.PHONES) || 200;
const PORT = 3900 + Math.floor(Math.random() * 90);
const TOKEN = 'test+token/=';
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'survive-test-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OPTS = { discount: ['none', 'd10', 'd30'], ads: ['none', 'small', 'big'], stock: ['lean', 'right', 'heavy'], staff: ['keep', 'add'], bonus: ['take', 'skip'] };

let server = null;
let serverErrors = '';
function startServer(fresh) {
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js'), `--port=${PORT}`, ...(fresh ? ['--fresh'] : [])], {
    env: { ...process.env, DATA_DIR: DATA, QUIET: '1', HOST_TOKEN: TOKEN },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (d) => (serverErrors += d));
  return waitFor(async () => { try { return (await fetch(`http://localhost:${PORT}/healthz`)).ok; } catch { return false; } }, 8000, 'server start');
}
async function waitFor(fn, ms, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(40); }
  throw new Error('timeout waiting for ' + label);
}

class Phone {
  constructor(i) {
    this.i = i;
    this.id = 'phone' + String(i).padStart(4, '0');
    this.state = null;
    this.answered = {};
    this.chosen = {};
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
    const { pub, me } = m;
    const w = pub.week;
    if (pub.phase === 'question' && this.answered[w] == null && pub.quiz) {
      this.answered[w] = (this.i + w) % pub.quiz.options.length;
      this.send({ t: 'answer', i: this.answered[w] });
    }
    if (pub.phase === 'decide' && me && !me.closed && !this.chosen[w]) {
      this.chosen[w] = {};
      for (const k of pub.decisions) {
        this.chosen[w][k] = OPTS[k][(this.i * 7 + w * 3 + k.length) % OPTS[k].length];
        this.send({ t: 'choose', key: k, v: this.chosen[w][k] });
      }
    }
  }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  close() { this.closed = true; this.ws.close(); }
}

class Host {
  constructor() { this.view = null; this.connect(); }
  connect() {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    this.ws = ws;
    ws.on('open', () => ws.send(JSON.stringify({ t: 'host', token: TOKEN.replace(/\+/g, ' ') }))); // a "+" that turned into a space still works
    ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.t === 'state') this.view = m.view; });
    ws.on('close', () => { if (!this.closed) setTimeout(() => this.connect(), 150); });
    ws.on('error', () => {});
  }
  cmd(c, extra = {}) { this.ws.send(JSON.stringify({ t: 'cmd', cmd: c, ...extra })); }
  phase() { return this.view && this.view.phase; }
  close() { this.closed = true; this.ws.close(); }
}

test(`${PHONES} phones, own kitchens, early-ending timers, crash recovery`, { timeout: 180000 }, async () => {
  await startServer(true);
  const host = new Host();
  await waitFor(() => host.view, 3000, 'host view');
  const phones = Array.from({ length: PHONES }, (_, i) => new Phone(i));
  await waitFor(() => host.view.counts.players === PHONES, 10000, 'all phones joined');
  // long timers: only "everyone is in" can end a question or decision quickly
  host.cmd('settings', { settings: { minutes: 15, qSeconds: 60, dSeconds: 60 } });
  await waitFor(() => host.view.minutes === 15 && host.view.qSeconds === 60, 3000, 'settings');
  host.cmd('next');
  let crashed = false, earlyQ = 0, earlyD = 0;

  for (let guard = 0; guard < 400 && host.phase() !== 'ending'; guard++) {
    const v = host.view;
    const { phase, week } = v;
    if (phase === 'intro' || phase === 'brief' || phase === 'answer') host.cmd('next');
    else if (phase === 'question' || phase === 'decide') {
      const t0 = Date.now();
      await waitFor(() => host.view && (host.view.phase !== phase || host.view.week !== week), 20000, `${phase} ends by itself (week ${week})`);
      if (Date.now() - t0 < 20000) phase === 'question' ? earlyQ++ : earlyD++;
      if (phase === 'question') {
        const expected = host.view.quiz.options.map((_, i) => phones.filter((p) => p.answered[week] === i).length);
        assert.deepEqual(host.view.answerStats.counts, expected, `week ${week} answer counts`);
      }
      continue;
    } else if (phase === 'results') {
      assert.ok(host.view.room.kitchens > 0);
      if (week === 3 && !crashed) {
        crashed = true;
        const before = host.view.leaderboard.slice(0, 3);
        await sleep(2300); // let the throttled save land
        server.kill('SIGKILL');
        await new Promise((r) => server.once('exit', r));
        host.view = null;
        await startServer(false);
        await waitFor(() => host.view && host.view.phase === 'results', 8000, 'host resumes');
        await waitFor(() => host.view.counts.total >= PHONES, 10000, 'phones reconnect');
        assert.equal(host.view.week, 3, 'same week after restart');
        assert.equal(host.view.counts.players, PHONES, 'nobody lost');
        assert.deepEqual(host.view.leaderboard.slice(0, 3), before, 'cash scores survive the crash');
      }
      host.cmd('next');
    }
    await waitFor(() => host.view && (host.view.phase !== phase || host.view.week !== week), 15000, `leave ${phase} w${week}`);
  }

  assert.equal(host.phase(), 'ending', 'game reached the end');
  assert.ok(crashed, 'crash test ran');
  assert.ok(earlyQ >= 10 && earlyD >= 10, `timers ended early (questions ${earlyQ}, decisions ${earlyD})`);
  const e = host.view.ending;
  assert.ok(e.winner && e.sheet.balanced, 'winner balance sheet balances');
  assert.equal(e.winner.nick, host.view.leaderboard[0].nick, 'winner is top of the leaderboard');
  assert.equal(Object.values(e.endings).reduce((a, b) => a + b, 0), PHONES, 'every kitchen got an ending');
  await waitFor(() => phones.every((p) => p.state && p.state.pub.phase === 'ending' && p.state.me.ending), 8000, 'phones see their own ending');
  assert.ok(phones.every((p) => p.state.me.ending.sheet.balanced), 'every phone’s balance sheet balances');
  assert.equal(phones.filter((p) => p.state.me.isWinner).length, 1, 'exactly one winner');

  phones.forEach((p) => p.close());
  host.close();
  server.kill('SIGTERM');
  assert.equal(serverErrors.trim(), '', 'server printed no errors');
});

test.after(() => { try { server && server.kill('SIGKILL'); } catch {} });
