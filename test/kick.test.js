// The host can remove a player; the phone is told and can't rejoin that game.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const WebSocket = require('ws');

const PORT = 3800 + Math.floor(Math.random() * 90);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'survive-kick-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let server;

function open(onMsg, first) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    ws.on('open', () => { ws.send(JSON.stringify(first)); resolve(ws); });
    ws.on('message', (raw) => onMsg(JSON.parse(raw)));
    ws.on('error', () => {});
  });
}

test('host removes a player', async () => {
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js'), `--port=${PORT}`, '--fresh'], { env: { ...process.env, DATA_DIR: DATA, QUIET: '1', HOST_TOKEN: 'k' }, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://localhost:${PORT}/healthz`)).ok) break; } catch {} await sleep(50); }
  let hostView = null;
  const host = await open((m) => { if (m.t === 'state') hostView = m.view; }, { t: 'host', token: 'k' });
  const msgs = { a: [], b: [] };
  await open((m) => msgs.a.push(m.t), { t: 'hello', deviceId: 'phoneAAAA' });
  await open((m) => msgs.b.push(m.t), { t: 'hello', deviceId: 'phoneBBBB' });
  await sleep(500);
  assert.equal(hostView.players.length, 2);
  assert.ok(hostView.nicks.every((n) => n.id && n.nick), 'lobby chips carry ids');

  host.send(JSON.stringify({ t: 'cmd', cmd: 'kick', id: 'phoneAAAA' }));
  await sleep(500);
  assert.ok(msgs.a.includes('kicked'), 'removed phone is told');
  assert.deepEqual(hostView.players.map((p) => p.id), ['phoneBBBB'], 'only the other player remains');

  // tries to come back
  const again = [];
  await open((m) => again.push(m.t), { t: 'hello', deviceId: 'phoneAAAA' });
  await sleep(400);
  assert.deepEqual(again, ['kicked'], 'cannot rejoin this game');
  assert.equal(hostView.players.length, 1);

  // a new game lets them back in
  host.send(JSON.stringify({ t: 'cmd', cmd: 'restart' }));
  await sleep(300);
  const back = [];
  await open((m) => back.push(m.t), { t: 'hello', deviceId: 'phoneAAAA' });
  await sleep(400);
  assert.ok(back.includes('state') && !back.includes('kicked'), 'can join a new game');
  server.kill();
});

test.after(() => { try { server.kill('SIGKILL'); } catch {} });
