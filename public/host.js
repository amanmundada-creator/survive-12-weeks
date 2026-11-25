// Host / projector screen (Kahoot-style: everyone runs their own kitchen).
(function () {
  const { inr, inrShort, num, esc, $, DECISION_LABELS } = window.U;
  const token = new URLSearchParams(location.search).get('token');
  const stage = $('#stage');
  const main = $('#main');

  let view = null, join = null, recvAt = 0, mainKey = '', endingStep = 0, notesOn = false, lastPhase = null, lastTickSec = null, ws = null, soundUnlocked = false;
  const SHAPES = ['▲', '◆', '●', '■'];

  function fit() {
    const k = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transform = `translate(${(window.innerWidth - 1920 * k) / 2}px, ${(window.innerHeight - 1080 * k) / 2}px) scale(${k})`;
  }
  window.addEventListener('resize', fit);
  fit();

  function connect() {
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    ws.onopen = () => { $('#conn').classList.remove('on'); ws.send(JSON.stringify({ t: 'host', token })); };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'denied') { document.body.innerHTML = '<h1 style="color:#fff;font-family:sans-serif;padding:40px">Wrong host link. Check the token at the end of the address.</h1>'; return; }
      if (m.t === 'state') { view = m.view; join = m.join; recvAt = Date.now(); render(); }
    };
    ws.onclose = () => { $('#conn').classList.add('on'); setTimeout(connect, 1000); };
  }
  const cmd = (c, extra = {}) => ws && ws.readyState === 1 && ws.send(JSON.stringify({ t: 'cmd', cmd: c, ...extra }));

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toast.h);
    toast.h = setTimeout(() => t.classList.remove('on'), 1600);
  }

  // ── keyboard ──
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape' && e.target.id === 'pp-search') togglePlayers(false); return; }
    if (e.key === 'Escape' && $('#players-panel').classList.contains('on')) return togglePlayers(false);
    unlockSound();
    if ($('#confirm').classList.contains('on')) {
      if (e.key === 'Escape') $('#confirm').classList.remove('on');
      if (e.key === 'Enter') doRestart();
      return;
    }
    const k = e.key.toLowerCase();
    if (e.code === 'Space' || k === 'arrowright') {
      e.preventDefault();
      if (view && view.phase === 'ending') { if (endingStep < 2) { endingStep++; renderMain(true); } return; }
      cmd('next');
    } else if (k === 'arrowleft' && view && view.phase === 'ending') { if (endingStep > 0) { endingStep--; renderMain(true); } }
    else if (k === 'p') cmd('pause');
    else if (e.key === '+' || e.key === '=') { cmd('addTime'); toast('+15 seconds'); }
    else if (k === 'c') { cmd('addClock'); toast('+1 minute on the game clock'); }
    else if (k === 'r') $('#confirm').classList.add('on');
    else if (k === 'm') { Sound.setMuted(!Sound.isMuted()); toast(Sound.isMuted() ? 'Sound off' : 'Sound on'); localStorage.setItem('muted', Sound.isMuted() ? '1' : ''); }
    else if (k === 'f') { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); else document.exitFullscreen(); }
    else if (k === 'n') { notesOn = !notesOn; renderNotes(); }
    else if (k === 'k') togglePlayers();
    else if (k === 'a') { cmd('autoplay', { on: !(view && view.autoplay) }); toast(view && view.autoplay ? 'Auto-play off' : 'Auto-play on'); }
  });
  $('#confirm .yes').onclick = doRestart;
  $('#confirm .no').onclick = () => $('#confirm').classList.remove('on');
  function doRestart() { $('#confirm').classList.remove('on'); endingStep = 0; cmd('restart'); toast('Restarted'); }
  document.addEventListener('click', unlockSound);
  function unlockSound() { if (!soundUnlocked) { soundUnlocked = true; Sound.unlock(); $('#sound-hint').textContent = ''; } }
  Sound.setMuted(localStorage.getItem('muted') === '1');

  // ── players panel: remove people ──
  let pendingKick = null;
  function togglePlayers(force) {
    const p = $('#players-panel');
    const on = force == null ? !p.classList.contains('on') : force;
    p.classList.toggle('on', on);
    if (on) { renderPlayers(); setTimeout(() => $('#pp-search').focus(), 30); }
  }
  function kick(id, nick) {
    if (pendingKick !== id) { // second click confirms
      pendingKick = id;
      renderPlayers();
      clearTimeout(kick.t);
      kick.t = setTimeout(() => { pendingKick = null; renderPlayers(); }, 4000);
      return;
    }
    pendingKick = null;
    cmd('kick', { id });
    toast(`Removed ${nick}`);
  }
  function renderPlayers() {
    const list = $('#pp-list');
    if (!view || !$('#players-panel').classList.contains('on')) return;
    const q = $('#pp-search').value.trim().toLowerCase();
    const ps = (view.players || []).filter((p) => !q || p.nick.toLowerCase().includes(q));
    const key = q + '|' + pendingKick + '|' + view.phase + '|' + ps.map((p) => p.id + p.nick + p.connected + p.closed + (view.phase === 'setup' ? '' : p.score)).join(',');
    if (list.dataset.k === key) return;
    list.dataset.k = key;
    list.innerHTML = ps.length ? ps.map((p) => `<div class="pp-row"><span class="pp-dot ${p.connected ? 'on' : ''}" title="${p.connected ? 'online' : 'offline'}"></span><span class="pp-nick">${esc(p.nick)}${p.closed ? ' <small>closed</small>' : ''}</span><span class="pp-score">${view.phase === 'setup' ? '' : inrShort(p.score)}</span><button class="pp-kick ${pendingKick === p.id ? 'sure' : ''}" data-id="${esc(p.id)}" data-nick="${esc(p.nick)}">${pendingKick === p.id ? 'Click again to remove' : 'Remove'}</button></div>`).join('') : '<p class="pp-sub">Nobody matches.</p>';
    list.querySelectorAll('.pp-kick').forEach((b) => (b.onclick = () => kick(b.dataset.id, b.dataset.nick)));
    $('#players-btn').textContent = `👥 Players (${(view.players || []).length})`;
  }
  $('#players-btn').onclick = () => togglePlayers();
  $('#pp-close').onclick = () => togglePlayers(false);
  $('#pp-search').oninput = () => renderPlayers();
  $('#players-panel').onclick = (e) => { if (e.target.id === 'players-panel') togglePlayers(false); };

  // ── clocks ──
  const phaseLeft = () => (!view || view.remainingMs == null ? null : view.paused ? view.remainingMs : Math.max(0, view.remainingMs - (Date.now() - recvAt)));
  const clockLeft = () => (!view ? 0 : view.paused || view.phase === 'setup' ? view.clockMs : Math.max(0, view.clockMs - (Date.now() - recvAt)));
  const mmss = (ms) => { const t = Math.ceil(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

  function renderTop() {
    const v = view;
    // hide the leader while the room is asked who the leader is
    const lb = v.phase === 'question' && v.quiz && v.quiz.id === 'roomLeader' ? { nick: '???', score: null } : v.leaderboard && v.leaderboard[0];
    const room = v.room;
    const weekTxt = v.phase === 'setup' ? `${v.minutes}-minute game · waiting to start` : v.phase === 'ending' ? 'Game over' : `Week ${v.week}`;
    $('#top').innerHTML = `
      <div class="brand"><div class="brand-name">${esc(v.kitchenName)}</div><div class="brand-week">${weekTxt}</div></div>
      <div class="game-clock" id="game-clock"><div class="gc-l">Game clock</div><div class="gc-v" id="gc-v">${mmss(clockLeft())}</div></div>
      <div class="tiles">
        <div class="tile"><div class="tile-l">Kitchens</div><div class="tile-v">${room ? num(room.kitchens - (room.closedNow || 0)) : num(v.counts.players)}</div></div>
        <div class="tile"><div class="tile-l">Average cash</div><div class="tile-v">${room ? inrShort(room.avgCash) : inrShort(v.startCash)}</div></div>
        <div class="tile tile-cash"><div class="tile-l">🏆 Leader</div><div class="tile-v lead-v">${lb && v.phase !== 'setup' && v.week > 0 ? `${esc(lb.nick)} <small>${lb.score == null ? '' : inrShort(lb.score)}</small>` : '–'}</div></div>
      </div>`;
    tickClock();
  }

  function tickClock() {
    const el = $('#gc-v');
    if (!el || !view) return;
    const left = clockLeft();
    el.textContent = left <= 0 && view.phase !== 'setup' ? (view.phase === 'ending' ? '0:00' : 'Last week!') : mmss(left);
    $('#game-clock').classList.toggle('low', left < 60000 && view.phase !== 'setup' && view.phase !== 'ending');
  }

  function renderTimer() {
    const t = $('#timer');
    const rem = phaseLeft();
    if (!view || !['brief', 'question', 'decide'].includes(view.phase) || rem == null) { t.classList.remove('on'); return; }
    const total = view.phase === 'question' ? view.qSeconds * 1000 : view.phase === 'decide' ? view.dSeconds * 1000 : 10000;
    const sec = Math.ceil(rem / 1000);
    t.classList.add('on');
    t.classList.toggle('hurry', sec <= 5 && view.phase !== 'brief' && !view.paused);
    t.classList.toggle('paused', !!view.paused);
    t.querySelector('.t').textContent = view.endedEarly ? '✓' : sec;
    t.querySelector('.fg').style.strokeDashoffset = String(100 - Math.min(1, rem / total) * 100);
    t.querySelector('.lbl').textContent = view.paused ? 'paused' : view.endedEarly ? 'everyone’s in!' : { brief: 'reading time', question: 'to answer', decide: 'to decide' }[view.phase];
    if (view.phase !== 'brief' && sec <= 5 && sec > 0 && sec !== lastTickSec && !view.paused && view.sound) { lastTickSec = sec; Sound.tick(); }
  }
  setInterval(() => { if (view) { renderTimer(); tickClock(); } }, 200);

  function renderNotes() {
    const n = $('#notes');
    n.classList.toggle('on', notesOn);
    if (notesOn && view) n.innerHTML = `<b>Presenter note (only you see this, N to hide)</b>${esc(view.note || '')}`;
  }

  function renderCornerQr() {
    const c = $('#corner-qr');
    const show = view && ['brief', 'question', 'decide'].includes(view.phase) && join;
    c.classList.toggle('on', !!show);
    if (show && c.dataset.url !== join.url) {
      c.dataset.url = join.url;
      c.querySelector('.qr').innerHTML = join.qr;
      c.querySelector('.cq-u').textContent = join.url.replace(/^https?:\/\//, '');
    }
  }

  function render() {
    if (!view) return;
    if (view.phase !== lastPhase) onPhaseChange(view.phase);
    lastPhase = view.phase;
    renderTop();
    renderTimer();
    renderCornerQr();
    renderNotes();
    $('#pause').classList.toggle('on', !!view.paused);
    if (!soundUnlocked && view.sound) $('#sound-hint').textContent = '🔈 Click or press any key once to enable sound';
    renderMain(false);
    renderPlayers();
    $('#players-btn').textContent = `👥 Players (${(view.players || []).length})`;
  }

  function onPhaseChange(to) {
    lastTickSec = null;
    if (to === 'setup' || to === 'ending') endingStep = 0;
    if (!view.sound) return;
    if (to === 'brief') Sound.whoosh();
    if (to === 'question') Sound.ding();
    if (to === 'answer') Sound.register();
    if (to === 'decide') Sound.coin();
    if (to === 'results') Sound.cost();
    if (to === 'ending') Sound.fanfare();
  }

  function renderMain(force) {
    const v = view;
    const key = `${v.phase}|${v.week}|${v.phase === 'ending' ? endingStep : ''}`;
    if (key === mainKey && !force) return updateLive();
    mainKey = key;
    const fn = { setup: viewSetup, brief: viewBrief, question: viewQuestion, answer: viewAnswer, decide: viewDecide, results: viewResults, ending: viewEnding }[v.phase];
    if (fn) fn();
    updateLive();
  }

  function updateLive() {
    const v = view;
    document.querySelectorAll('[data-live=count]').forEach((el) => (el.innerHTML = `${num(v.counts.done)} <small>/ ${num(v.counts.total)} ${v.counts.label}</small>`));
    if (v.phase === 'setup') {
      const n = $('#join-n');
      if (n) n.innerHTML = `${num(v.counts.players)} <small>${v.counts.players === 1 ? 'kitchen has' : 'kitchens have'} joined</small>`;
      const qr = $('#join-qr');
      if (qr && join && qr.dataset.url !== join.url) { qr.dataset.url = join.url; qr.innerHTML = join.qr; $('#join-url').textContent = join.url.replace(/^https?:\/\//, ''); }
      document.querySelectorAll('.seg [data-min]').forEach((b) => b.classList.toggle('on', Number(b.dataset.min) === v.minutes));
      document.querySelectorAll('.seg [data-q]').forEach((b) => b.classList.toggle('on', Number(b.dataset.q) === v.qSeconds));
      document.querySelectorAll('.seg [data-sound]').forEach((b) => b.classList.toggle('on', (b.dataset.sound === 'on') === !!v.sound));
      const el = $('#nicks');
      if (el && v.nicks) {
        const want = v.nicks.slice(-24);
        const k = want.map((x) => x.id + x.nick).join('|');
        if (el.dataset.k !== k) {
          el.dataset.k = k;
          el.innerHTML = want.map((x) => `<span>${esc(x.nick)}<button class="chip-x" data-id="${esc(x.id)}" data-nick="${esc(x.nick)}" title="Remove ${esc(x.nick)}">×</button></span>`).join('');
          el.querySelectorAll('.chip-x').forEach((b) => (b.onclick = () => { cmd('kick', { id: b.dataset.id }); toast(`Removed ${b.dataset.nick}`); }));
        }
      }
    }
  }

  // ── SETUP ──
  function viewSetup() {
    const v = view;
    main.innerHTML = `
      <div class="setup">
        <div>
          <h1 class="setup-title">Survive the <em>Cash</em> Crunch</h1>
          <p class="setup-sub">Everyone runs their own cloud kitchen with <b>₹5,00,000</b>. Right answers put cash in your kitchen, wrong answers take it out. <i>Richest kitchen when the clock hits zero wins.</i></p>
          <div class="form">
            <div class="frow"><label>Game clock</label><div class="seg">
              <button data-min="3">3 min</button><button data-min="5">5 min</button><button data-min="8">8 min</button><button data-min="10">10 min</button><button data-min="15">15 min</button>
            </div></div>
            <div class="frow"><label for="kname">Kitchen name</label><input id="kname" type="text" maxlength="40" value="${esc(v.kitchenName)}"></div>
            <div class="frow"><label>Answer time</label><div class="seg">
              <button data-q="15">15s</button><button data-q="20">20s</button><button data-q="30">30s</button>
            </div></div>
            <div class="frow"><label>Sound</label><div class="seg"><button data-sound="on">On</button><button data-sound="off">Off</button></div></div>
            <button class="start-btn" id="start">Start the game <kbd>Space</kbd></button>
          </div>
        </div>
        <div class="join card">
          <div class="join-h">📱 Scan to open your kitchen</div>
          <div class="qr" id="join-qr"></div>
          <div class="join-url" id="join-url"></div>
          <div class="count join-n" id="join-n"></div>
          <div class="nick-cloud" id="nicks"></div>
        </div>
      </div>`;
    main.querySelectorAll('[data-min]').forEach((b) => (b.onclick = () => cmd('settings', { settings: { minutes: Number(b.dataset.min) } })));
    main.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => cmd('settings', { settings: { qSeconds: Number(b.dataset.q), dSeconds: Number(b.dataset.q) } })));
    main.querySelectorAll('[data-sound]').forEach((b) => (b.onclick = () => cmd('settings', { settings: { sound: b.dataset.sound === 'on' } })));
    $('#kname').onchange = (e) => cmd('settings', { settings: { kitchenName: e.target.value } });
    $('#start').onclick = () => { unlockSound(); cmd('next'); };
    const qr = $('#join-qr');
    if (join) { qr.dataset.url = join.url; qr.innerHTML = join.qr; $('#join-url').textContent = join.url.replace(/^https?:\/\//, ''); }
  }

  // ── BRIEF ──
  const ART = { kitchen: '👩‍🍳', phone: '📱', lantern: '🪔', rain: '🌧️', rival: '🏪', onion: '🧅', building: '🏢', clipboard: '📋', refund: '↩️', truck: '🚚', bank: '🏦', sack: '🌾', menu: '📜' };
  function advisorsHtml(mini) {
    const a = view.advisors;
    if (!a) return '';
    return ['growth', 'ops', 'finance'].map((k) => mini
      ? `<div class="adv-mini card"><div class="adv-e">${a[k].emoji}</div><div><b>${esc(a[k].name)}</b>${esc(a[k].line)}</div></div>`
      : `<div class="adv card ${k}"><div class="adv-h"><div class="adv-e">${a[k].emoji}</div><div><div class="adv-n">${esc(a[k].name)}</div><div class="adv-r">${esc(a[k].role)} advisor</div></div></div><div class="adv-l">“${esc(a[k].line)}”</div></div>`).join('');
  }
  function viewBrief() {
    const ev = view.event;
    const tone = ev.tone === 'bad' ? 'tone-bad' : ev.tone === 'good' ? 'tone-good' : '';
    main.innerHTML = `<div class="brief">
      <div class="headline card ${tone}">
        <div class="art">${ART[ev.art] || '🍛'}</div>
        <div><div class="kicker">${ev.id === 'flavour' ? `Week ${view.week} · Kitchen news` : `<b>Breaking</b> · ${esc(ev.title)}`}</div><h2>${esc(ev.headline)}</h2><div class="effect">${esc(ev.effect || 'No surprises this week. Your decisions decide everything.')}</div></div>
      </div>
      <div style="display:grid;gap:22px;align-content:start">
        ${ev.bonus ? `<div class="bonus-card card"><div class="be">${ART[ev.bonus.art] || '🤝'}</div><div><h3>${esc(ev.bonus.title)}</h3><p>${esc(ev.bonus.question)} Each kitchen decides for itself.</p></div></div>` : ''}
        <div class="sec" style="margin:0">Your advisors say… (each one has a bias)</div>
        <div class="advisors">${advisorsHtml(false)}</div>
      </div></div>`;
  }

  // ── QUESTION (the Kahoot moment) ──
  function viewQuestion() {
    const q = view.quiz;
    if (!q) return;
    main.innerHTML = `<div class="kq">
      <div class="kq-head"><div class="phase-title">Week ${view.week} · Quick question</div><div class="count" data-live="count"></div></div>
      <div class="kq-text ${q.text.length > 80 ? 'long' : ''}">${esc(q.text)}</div>
      <div class="kq-grid n${q.options.length}">${q.options.map((o, i) => `<div class="kq-opt c${i}"><span class="shape">${SHAPES[i]}</span><span>${esc(o)}</span></div>`).join('')}</div>
      <div class="kq-foot">✅ Right: <b>+₹10,000 to ₹20,000</b> (faster = more) &nbsp;·&nbsp; ❌ Wrong: <b>−₹10,000</b> from your kitchen</div>
    </div>`;
  }

  // ── ANSWER ──
  function viewAnswer() {
    const q = view.quiz;
    const st = view.answerStats;
    if (!q || !st) return;
    const max = Math.max(1, ...st.counts);
    const pct = st.answered ? Math.round((st.right / st.answered) * 100) : 0;
    main.innerHTML = `<div class="kq">
      <div class="kq-head"><div class="phase-title">The answer</div><div class="kq-score">${st.answered ? `<b>${pct}%</b> got it right` : 'Nobody answered'}</div></div>
      <div class="kq-text small">${esc(q.text)}</div>
      <div class="kq-bars">${q.options.map((o, i) => `<div class="kq-bar c${i} ${i === q.correct ? 'right' : 'wrong'}"><div class="kb-col"><i style="height:${Math.round((st.counts[i] / max) * 100)}%"></i></div><div class="kb-n">${st.counts[i]}</div><div class="kb-l"><span class="shape">${SHAPES[i]}</span>${esc(o)}${i === q.correct ? ' ✓' : ''}</div></div>`).join('')}</div>
      <div class="kq-why">💡 ${esc(q.why)}</div>
    </div>`;
  }

  // ── DECIDE ──
  const OPTION_HINTS = {
    discount: { none: 'Full price. Fewer orders.', d10: 'More orders, a bit less per order.', d30: 'Lots of orders. You fund the discount.' },
    ads: { none: 'People slowly forget you.', small: 'A steady trickle of new eyes.', big: 'A splash. Paid today.' },
    stock: { lean: 'Little waste. Might run out.', right: 'Buy for what you can cook.', heavy: 'Never run out. Paid upfront.' },
    staff: { keep: 'Same kitchen size.', add: '+450 orders capacity, ₹5,500/week forever.' },
  };
  function viewDecide() {
    const keys = view.decisions;
    const ev = view.event;
    const dec = keys.map((k) => {
      if (k === 'bonus') return `<div class="dec card bonus"><h3>🤝 ${esc(ev.bonus.title.replace('Boardroom: ', ''))}</h3><div class="dec-opts">${['take', 'skip'].map((o) => `<div class="dec-opt"><b>${esc(ev.bonus.options[o])}</b><span>${esc(ev.bonus.hints[o])}</span></div>`).join('')}</div></div>`;
      const L = DECISION_LABELS[k];
      return `<div class="dec card"><h3>${L.title}</h3><div class="dec-opts">${Object.keys(OPTION_HINTS[k]).map((o) => `<div class="dec-opt"><b>${L[o]}</b><span>${OPTION_HINTS[k][o]}</span></div>`).join('')}</div></div>`;
    }).join('');
    main.innerHTML = `<div class="vote">
      <div class="vote-head"><h2>Run your own kitchen</h2><div class="count" data-live="count"></div><div class="secret">${ev.effect ? `This week: ${esc(ev.effect)}` : 'Decide on your phone'}</div></div>
      <div class="dec-grid ${keys.length > 4 ? 'five' : ''}">${dec}</div>
      <div class="adv-strip">${advisorsHtml(true)}</div>
    </div>`;
  }

  // ── RESULTS ──
  function viewResults() {
    const v = view;
    const r = v.room;
    if (!r) return;
    const downPct = Math.round((r.cashDownShare || 0) * 100);
    const upPct = Math.round((r.ordersUpShare || 0) * 100);
    const series = [{ week: 0, orders: null, cash: v.startCash }].concat(v.roomHistory);
    const last = v.timeUp;
    main.innerHTML = `<div class="results">
      <div class="res-left">
        <div class="res-stat card ${downPct >= 50 ? 'alarm' : ''}">
          <div class="rs-big">${downPct}%</div>
          <div class="rs-t">of kitchens have <b>less cash</b> than a week ago${upPct >= 50 ? `, even though <b>${upPct}% sold more</b>` : ''}.${r.closedNow ? ` <b>${r.closedNow}</b> kitchen${r.closedNow > 1 ? 's' : ''} closed this week.` : ''}</div>
        </div>
        <div class="chart-card card"><div class="sec" style="margin:0 0 4px">The room on average: orders vs cash</div><div id="rv-chart"></div></div>
      </div>
      <div class="board card">
        <h3>🏆 Richest kitchens</h3>
        ${v.leaderboard.map((p, i) => `<div class="lbrow"><div class="rk">${i + 1}</div><div>${esc(p.nick)}${p.closed ? '<span class="rl closed">closed</span>' : `<span class="rl">${num(p.orders)} orders</span>`}</div><div class="sc">${inrShort(p.score)}</div></div>`).join('')}
        <div class="next-hint">${last ? '⏰ Time’s up! Press Space for the winner →' : `Press Space for Week ${v.week + 1} →`}</div>
      </div>
    </div>`;
    Chart2.renderChart($('#rv-chart'), series, { weeks: Math.max(v.plannedWeeks, v.week + 1), goal: v.goal, w: 1000, h: 520, animate: true });
    if (last) confetti(80);
  }

  // ── ENDING: the winner's balance sheet ──
  function viewEnding() {
    const e = view.ending;
    if (!e) return;
    const root = document.createElement('div');
    main.innerHTML = '';
    main.appendChild(root);
    const kitchens = Object.values(e.endings).reduce((a, b) => a + b, 0);
    Ending.renderEnding(root, { content: e.content, sheet: e.sheet, chart: e.chart, comparison: e.comparison, winner: e.winner, room: { endings: e.endings, closed: e.closed, kitchens }, podium: view.podium, goal: view.goal, weeks: e.weeksPlayed }, endingStep);
    const act = document.createElement('div');
    act.className = 'end-actions';
    act.innerHTML = endingStep < 2 ? '<span class="next-hint">Space → next</span>' : '<button id="replay">▶ Play again with the same room</button>';
    root.appendChild(act);
    const rb = $('#replay');
    if (rb) rb.onclick = () => { endingStep = 0; cmd('replay'); };
    if (endingStep === 0) confetti(120);
  }

  function confetti(n) {
    if (window.U.reducedMotion()) return;
    const c = document.createElement('div');
    c.className = 'confetti';
    const colors = ['#e8590c', '#f2a900', '#1f7a4a', '#c9182b', '#ff8a3d'];
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      p.style.left = Math.random() * 100 + '%';
      p.style.background = colors[i % colors.length];
      p.style.setProperty('--dx', (Math.random() * 300 - 150) + 'px');
      p.style.setProperty('--r', (Math.random() * 900 - 450) + 'deg');
      p.style.animationDelay = Math.random() * 0.6 + 's';
      c.appendChild(p);
    }
    stage.appendChild(c);
    setTimeout(() => c.remove(), 3500);
  }

  connect();
})();
