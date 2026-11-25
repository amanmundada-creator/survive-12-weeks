// Host / projector screen.
(function () {
  const { inr, inrShort, num, esc, $, sleep, countTo, DECISION_LABELS } = window.U;
  const token = new URLSearchParams(location.search).get('token');
  const stage = $('#stage');
  const main = $('#main');

  let view = null;
  let join = null;
  let recvAt = 0;
  let mainKey = '';
  let revealDone = {};
  let revealFinished = null;
  let endingStep = 0;
  let notesOn = false;
  let lastPhase = null;
  let lastTickSec = null;
  let ws = null;
  let soundUnlocked = false;

  // ── fixed 1920×1080 stage, scaled to the window ──
  function fit() {
    const k = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transform = `translate(${(window.innerWidth - 1920 * k) / 2}px, ${(window.innerHeight - 1080 * k) / 2}px) scale(${k})`;
  }
  window.addEventListener('resize', fit);
  fit();

  // ── connection ──
  function connect() {
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    ws.onopen = () => { $('#conn').classList.remove('on'); ws.send(JSON.stringify({ t: 'host', token })); };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'denied') { document.body.innerHTML = '<h1 style="color:#fff;font-family:sans-serif;padding:40px">Wrong host link. Use the one printed in the terminal.</h1>'; return; }
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
    if (e.target.tagName === 'INPUT') { if (e.key === 'Enter') e.target.blur(); return; }
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
    else if (k === 'r') $('#confirm').classList.add('on');
    else if (k === 'm') { Sound.setMuted(!Sound.isMuted()); toast(Sound.isMuted() ? 'Sound off' : 'Sound on'); localStorage.setItem('muted', Sound.isMuted() ? '1' : ''); }
    else if (k === 'f') { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); else document.exitFullscreen(); }
    else if (k === 'n') { notesOn = !notesOn; renderNotes(); }
    else if (k === 'a') { cmd('autoplay', { on: !(view && view.autoplay) }); toast(view && view.autoplay ? 'Auto-play off' : 'Auto-play on'); }
  });
  $('#confirm .yes').onclick = doRestart;
  $('#confirm .no').onclick = () => $('#confirm').classList.remove('on');
  function doRestart() { $('#confirm').classList.remove('on'); revealDone = {}; endingStep = 0; cmd('restart'); toast('Restarted'); }
  document.addEventListener('click', unlockSound);
  function unlockSound() { if (!soundUnlocked) { soundUnlocked = true; Sound.unlock(); $('#sound-hint').textContent = ''; } }
  Sound.setMuted(localStorage.getItem('muted') === '1');

  // ── top bar ──
  function stars(r) {
    const full = Math.round(r * 2) / 2;
    let s = '';
    for (let i = 1; i <= 5; i++) s += Math.round(r) >= i ? '★' : '☆';
    return s;
  }

  function renderTop() {
    const v = view;
    const k = v.phase === 'reveal' && revealFinished === v.week ? v.kitchenAfter : v.kitchen;
    const weekTxt = v.phase === 'setup' ? `${v.weeks}-week game · waiting to start` : v.phase === 'ending' ? 'Game over' : `Week ${v.week} of ${v.weeks} · ${v.weeks - v.week} left after this`;
    const orders = k ? k.orders : 0;
    const pct = Math.min(100, (orders / v.goal) * 100);
    let tiles = '';
    if (k) {
      const runway = k.runway;
      const danger = k.cash < 100000 || (runway != null && runway < 2);
      const beat = runway == null ? 1.8 : runway < 1.5 ? 0.45 : runway < 3 ? 0.7 : runway < 6 ? 1.1 : 1.6;
      const rwPct = runway == null ? 100 : Math.min(100, (runway / 8) * 100);
      tiles = `
        <div class="tile tile-cash ${danger ? 'danger' : ''}" style="--beat:${beat}s">
          <div class="tile-l"><span class="heart"></span>Cash in bank</div>
          <div class="tile-v">${inr(k.cash)}</div>
          <div class="runway"><i style="width:${rwPct}%;background:${danger ? 'var(--red)' : 'var(--cash)'}"></i></div>
          <div class="runway-t">${runway == null ? 'Cash is not shrinking' : `Cash lasts ~${runway < 1 ? '<1' : Math.round(runway)} more week${Math.round(runway) === 1 ? '' : 's'} at this rate`}</div>
        </div>
        <div class="tile tile-truck"><div class="tile-l">🚚 Money on the way</div><div class="tile-v">${inr(k.receivable)}</div></div>
        <div class="tile"><div class="tile-l">Orders this week</div><div class="tile-v">${num(orders)}</div></div>
        <div class="tile"><div class="tile-l">Rating</div><div class="tile-v"><span class="stars">${stars(k.rating)}</span> <span style="font-size:24px">${k.rating.toFixed(1)}</span></div></div>`;
    } else {
      tiles = `<div class="tile tile-cash" style="--beat:1.8s"><div class="tile-l"><span class="heart"></span>Cash in bank</div><div class="tile-v">${inr(v.startCash)}</div><div class="runway-t">Starting money</div></div>`;
    }
    $('#top').innerHTML = `
      <div class="brand"><div class="brand-name">${esc(v.kitchenName)}</div><div class="brand-week">${weekTxt}</div></div>
      <div class="goal">
        <div class="goal-t">🎯 Goal: <b>${num(v.goal)} orders a week by Week ${v.weeks}</b> without running out of cash</div>
        <div class="goal-bar"><div class="goal-fill" style="width:${pct}%"></div><div class="goal-num">${num(orders)} / ${num(v.goal)}</div></div>
      </div>
      <div class="tiles">${tiles}</div>`;
  }

  // ── timer ──
  function remaining() {
    if (!view || view.remainingMs == null) return null;
    if (view.paused) return view.remainingMs;
    return Math.max(0, view.remainingMs - (Date.now() - recvAt));
  }

  function renderTimer() {
    const t = $('#timer');
    const showFor = ['brief', 'forecast', 'vote'];
    const rem = remaining();
    if (!view || !showFor.includes(view.phase) || rem == null) { t.classList.remove('on'); return; }
    const total = view.phase === 'vote' ? view.timer * 1000 : view.phase === 'forecast' ? 15000 : 10000;
    const sec = Math.ceil(rem / 1000);
    t.classList.add('on');
    t.classList.toggle('hurry', sec <= 10 && view.phase === 'vote' && !view.paused);
    t.classList.toggle('paused', !!view.paused);
    t.querySelector('.t').textContent = sec;
    t.querySelector('.fg').style.strokeDashoffset = String(100 - (rem / total) * 100);
    t.querySelector('.lbl').textContent = view.paused ? 'paused' : { brief: 'reading time', forecast: 'to forecast', vote: 'to vote' }[view.phase];
    if (view.phase === 'vote' && sec <= 10 && sec > 0 && sec !== lastTickSec && !view.paused) { lastTickSec = sec; Sound.tick(); }
  }
  setInterval(() => { if (view) renderTimer(); }, 200);

  function renderNotes() {
    const n = $('#notes');
    n.classList.toggle('on', notesOn);
    if (notesOn && view) n.innerHTML = `<b>Presenter note (only you see this, N to hide)</b>${esc(view.note || '')}`;
  }

  function renderCornerQr() {
    const c = $('#corner-qr');
    const show = view && ['brief', 'forecast', 'vote'].includes(view.phase) && join;
    c.classList.toggle('on', !!show);
    if (show && c.dataset.url !== join.url) {
      c.dataset.url = join.url;
      c.querySelector('.qr').innerHTML = join.qr;
      c.querySelector('.cq-u').textContent = join.url.replace(/^https?:\/\//, '');
    }
  }

  // ── main render ──
  function render() {
    if (!view) return;
    if (view.phase !== lastPhase) onPhaseChange(lastPhase, view.phase);
    lastPhase = view.phase;
    renderTop();
    renderTimer();
    renderCornerQr();
    renderNotes();
    $('#pause').classList.toggle('on', !!view.paused);
    if (!soundUnlocked && view.sound) $('#sound-hint').textContent = '🔈 Click or press any key once to enable sound';
    renderMain(false);
  }

  function onPhaseChange(from, to) {
    lastTickSec = null;
    if (!view.sound) return;
    if (to === 'brief') Sound.whoosh();
    if (to === 'vote') Sound.ding();
    if (to === 'split') Sound.register();
    if (to === 'leaderboard') Sound.coin();
    if (to === 'ending') { (view.endingTheme === 'red' ? Sound.sting : Sound.fanfare)(); endingStep = 0; }
    if (to === 'setup') { revealDone = {}; endingStep = 0; }
  }

  function renderMain(force) {
    const v = view;
    const key = `${v.phase}|${v.week}|${v.phase === 'ending' ? endingStep + (v.ending && v.ending.id) : ''}`;
    if (key === mainKey && !force) return updateLive();
    mainKey = key;
    const fn = { setup: viewSetup, brief: viewBrief, forecast: viewForecast, vote: viewVote, split: viewSplit, reveal: viewReveal, leaderboard: viewLeaderboard, ending: viewEnding }[v.phase];
    if (fn) fn();
    updateLive();
  }

  // live bits that change without re-rendering the whole phase
  function updateLive() {
    const v = view;
    document.querySelectorAll('[data-live=count]').forEach((el) => (el.innerHTML = `${num(v.counts.voted)} <small>/ ${num(v.counts.total)} ${v.phase === 'vote' ? 'voted' : 'answered'}</small>`));
    if (v.phase === 'setup') {
      const n = $('#join-n');
      if (n) n.innerHTML = `${num(v.counts.players)} <small>${v.counts.players === 1 ? 'chef has' : 'chefs have'} joined</small>`;
      const qr = $('#join-qr');
      if (qr && join && qr.dataset.url !== join.url) { qr.dataset.url = join.url; qr.innerHTML = join.qr; $('#join-url').textContent = join.url.replace(/^https?:\/\//, ''); }
      document.querySelectorAll('.seg [data-weeks]').forEach((b) => b.classList.toggle('on', Number(b.dataset.weeks) === v.weeks));
      document.querySelectorAll('.seg [data-timer]').forEach((b) => b.classList.toggle('on', Number(b.dataset.timer) === v.timer));
      document.querySelectorAll('.seg [data-sound]').forEach((b) => b.classList.toggle('on', (b.dataset.sound === 'on') === !!v.sound));
      const title = document.querySelector('.setup-title em');
      if (title) title.textContent = v.weeks;
      renderNickCloud();
    }
  }

  // ── SETUP ──
  function viewSetup() {
    const v = view;
    main.innerHTML = `
      <div class="setup">
        <div>
          <h1 class="setup-title">Survive <em>${v.weeks}</em> Weeks</h1>
          <p class="setup-sub">You run <b>${esc(v.kitchenName)}</b>, a cloud kitchen with ₹5,00,000 in the bank. <i>Orders are climbing.</i> Can you keep the cash alive long enough to scale?</p>
          <div class="form">
            <div class="frow"><label>Game length</label><div class="seg">
              <button data-weeks="6">Quick · 6 weeks<small>≈ 10 min</small></button>
              <button data-weeks="8">Standard · 8 weeks<small>≈ 15 min</small></button>
              <button data-weeks="12">Full · 12 weeks<small>≈ 22 min</small></button>
            </div></div>
            <div class="frow"><label for="kname">Kitchen name</label><input id="kname" type="text" maxlength="40" value="${esc(v.kitchenName)}"></div>
            <div class="frow"><label>Voting timer</label><div class="seg">
              <button data-timer="30">30s</button><button data-timer="40">40s</button><button data-timer="60">60s</button><button data-timer="90">90s</button>
            </div></div>
            <div class="frow"><label>Sound</label><div class="seg"><button data-sound="on">On</button><button data-sound="off">Off</button></div></div>
            <button class="start-btn" id="start">Start the game <kbd>Space</kbd></button>
          </div>
        </div>
        <div class="join card">
          <div class="join-h">📱 Scan to join the kitchen</div>
          <div class="qr" id="join-qr"></div>
          <div class="join-url" id="join-url"></div>
          <div class="count join-n" id="join-n"></div>
          <div class="nick-cloud" id="nicks"></div>
        </div>
      </div>`;
    main.querySelectorAll('[data-weeks]').forEach((b) => (b.onclick = () => cmd('settings', { settings: { weeks: Number(b.dataset.weeks) } })));
    main.querySelectorAll('[data-timer]').forEach((b) => (b.onclick = () => cmd('settings', { settings: { timer: Number(b.dataset.timer) } })));
    main.querySelectorAll('[data-sound]').forEach((b) => (b.onclick = () => cmd('settings', { settings: { sound: b.dataset.sound === 'on' } })));
    $('#kname').onchange = (e) => cmd('settings', { settings: { kitchenName: e.target.value } });
    $('#start').onclick = () => { unlockSound(); cmd('next'); };
    const qr = $('#join-qr');
    if (join) { qr.dataset.url = join.url; qr.innerHTML = join.qr; $('#join-url').textContent = join.url.replace(/^https?:\/\//, ''); }
    renderNickCloud();
  }
  function renderNickCloud() {
    const el = $('#nicks');
    if (!el || !view.nicks) return;
    const have = new Set([...el.children].map((c) => c.textContent));
    const want = view.nicks.slice(-24);
    if (want.length === have.size && want.every((n) => have.has(n))) return;
    el.innerHTML = want.map((n) => `<span>${esc(n)}</span>`).join('');
  }

  // ── BRIEF ──
  const ART = { kitchen: '👩‍🍳', phone: '📱', lantern: '🪔', rain: '🌧️', rival: '🏪', onion: '🧅', building: '🏢', clipboard: '📋', refund: '↩️', truck: '🚚', bank: '🏦', sack: '🌾', menu: '📜' };
  function headlineHtml(ev) {
    const tone = ev.tone === 'bad' ? 'tone-bad' : ev.tone === 'good' ? 'tone-good' : '';
    const kicker = ev.id === 'flavour' ? `Week ${view.week} · Kitchen news` : `<b>Breaking</b> · ${esc(ev.title)}`;
    return `<div class="headline card ${tone}">
      ${ev.demoDay ? '<div class="demo-day">🎤 Investor Demo Day</div>' : ''}
      <div class="art">${ART[ev.art] || '🍛'}</div>
      <div><div class="kicker">${kicker}</div><h2>${esc(ev.headline)}</h2>${ev.effect ? `<div class="effect">${esc(ev.effect)}</div>` : '<div class="effect">No surprises this week. Your decisions decide everything.</div>'}</div>
    </div>`;
  }
  function advisorsHtml(mini) {
    const a = view.advisors;
    if (!a) return '';
    return ['growth', 'ops', 'finance'].map((k) => mini
      ? `<div class="adv-mini card"><div class="adv-e">${a[k].emoji}</div><div><b>${esc(a[k].name)}</b>${esc(a[k].line)}</div></div>`
      : `<div class="adv card ${k}"><div class="adv-h"><div class="adv-e">${a[k].emoji}</div><div><div class="adv-n">${esc(a[k].name)}</div><div class="adv-r">${esc(a[k].role)} advisor</div></div></div><div class="adv-l">“${esc(a[k].line)}”</div></div>`).join('');
  }
  function viewBrief() {
    const ev = view.event;
    main.innerHTML = `<div class="brief">${headlineHtml(ev)}
      <div style="display:grid;gap:22px;align-content:start">
        ${ev.bonus ? `<div class="bonus-card card"><div class="be">${ART[ev.bonus.art] || '🤝'}</div><div><h3>${esc(ev.bonus.title)}</h3><p>${esc(ev.bonus.question)} You'll vote on it with this week's decisions.</p></div></div>` : ''}
        <div class="sec" style="margin:0">Your advisors say… (each one has a bias)</div>
        <div class="advisors">${advisorsHtml(false)}</div>
      </div></div>`;
    if (ev.id === 'monsoon') addRain();
  }
  function addRain() {
    const r = document.createElement('div');
    r.className = 'rain';
    for (let i = 0; i < 70; i++) { const d = document.createElement('i'); d.style.left = Math.random() * 100 + '%'; d.style.animationDuration = 0.6 + Math.random() * 0.6 + 's'; d.style.animationDelay = -Math.random() * 2 + 's'; r.appendChild(d); }
    main.appendChild(r);
  }

  // ── FORECAST ──
  function viewForecast() {
    const q = view.question;
    if (!q) return;
    const cls = (o) => (o.v === 'higher' ? 'hi' : o.v === 'lower' ? 'lo' : '');
    main.innerHTML = `<div class="forecast">
      <div class="phase-title">Week ${view.week} prediction · ${esc(q.tag)}</div>
      <div class="fq ${q.text.length > 90 ? 'long' : ''}">${esc(q.text)}</div>
      <div class="fopts n${q.options.length}">${q.options.map((o, i) => `<div class="fopt ${cls(o)}"><span class="fl">${'ABCD'[i]}</span>${esc(o.label)}</div>`).join('')}</div>
      <div class="count" data-live="count"></div>
      <div class="fhint">Answer on your phone · 100 points if you’re right · answer after the reveal</div>
    </div>`;
  }

  // ── VOTE ──
  const OPTION_HINTS = {
    discount: { none: 'Full price. Fewer orders.', d10: 'More orders, a bit less per order.', d30: 'Lots of orders. You fund the discount.' },
    ads: { none: 'People slowly forget you.', small: 'A steady trickle of new eyes.', big: 'A splash. Paid today.' },
    stock: { lean: 'Little waste. Might run out.', right: 'Buy for what you can cook.', heavy: 'Never run out. Paid upfront.' },
    staff: { keep: 'Same kitchen size.', add: '+450 orders capacity, ₹5,500/week forever.' },
  };
  function viewVote() {
    const keys = view.decisions;
    const ev = view.event;
    const dec = keys.map((k) => {
      if (k === 'bonus') return `<div class="dec card bonus"><h3>🤝 ${esc(ev.bonus.title.replace('Boardroom: ', ''))}</h3><div class="dec-opts">${['take', 'skip'].map((o) => `<div class="dec-opt"><b>${esc(ev.bonus.options[o])}</b><span>${esc(ev.bonus.hints[o])}</span></div>`).join('')}</div></div>`;
      const L = DECISION_LABELS[k];
      return `<div class="dec card"><h3>${L.title}</h3><div class="dec-opts">${Object.keys(OPTION_HINTS[k]).map((o) => `<div class="dec-opt"><b>${L[o]}</b><span>${OPTION_HINTS[k][o]}</span></div>`).join('')}</div></div>`;
    }).join('');
    main.innerHTML = `<div class="vote">
      <div class="vote-head"><h2>Decide on your phones</h2><div class="count" data-live="count"></div><div class="secret">🤫 Votes stay secret until the timer ends</div></div>
      <div class="dec-grid ${keys.length > 4 ? 'five' : ''}">${dec}</div>
      <div class="adv-strip">${advisorsHtml(true)}</div>
    </div>`;
  }

  // ── SPLIT ──
  async function viewSplit() {
    const sp = view.split;
    if (!sp) { main.innerHTML = ''; return; }
    const ev = view.event;
    let biggest = null;
    const cards = sp.keys.map((k) => {
      const d = sp.split[k];
      const L = k === 'bonus' ? { title: ev.bonus.title.replace('Boardroom: ', ''), take: ev.bonus.options.take, skip: ev.bonus.options.skip } : DECISION_LABELS[k];
      const opts = Object.keys(d.counts);
      const bars = opts.map((o) => {
        const p = d.total ? Math.round((d.counts[o] / d.total) * 100) : 0;
        return `<div class="bar ${o === d.winner ? 'win' : ''}" data-w="${p}"><i></i><span class="bl">${esc(L[o])}</span><span class="bp">${p}% · ${d.counts[o]}</span></div>`;
      }).join('');
      if (d.total) {
        const p = Math.round((d.counts[d.winner] / d.total) * 100);
        if (k === 'discount' || !biggest) biggest = { k, p, label: L[d.winner], title: L.title };
      }
      return `<div class="sp card" data-k="${k}"><h3>${esc(L.title)} <small>${d.total} votes</small></h3>${bars}${d.tie ? `<div class="coin-wrap"><div><div class="coin">₹</div><div class="coin-t">Tie! Flipping a coin…</div></div></div>` : ''}</div>`;
    }).join('');
    main.innerHTML = `<div class="split">
      <div class="split-head"><h2>The room has decided</h2>${biggest ? `<div class="split-big"><b>${biggest.p}%</b> chose “${esc(biggest.label)}” for ${esc(biggest.title.toLowerCase())}</div>` : '<div class="split-big">Nobody voted, so the kitchen kept things as they were.</div>'}</div>
      <div class="split-grid ${sp.keys.length > 4 ? 'five' : ''}">${cards}</div>
    </div>`;
    requestAnimationFrame(() => main.querySelectorAll('.bar').forEach((b) => (b.querySelector('i').style.transform = `scaleX(${b.dataset.w / 100})`)));
    const coins = main.querySelectorAll('.coin-wrap');
    if (coins.length) {
      if (view.sound) Sound.flip();
      await sleep(2300);
      coins.forEach((c) => {
        const k = c.closest('.sp').dataset.k;
        const d = sp.split[k];
        const L = k === 'bonus' ? ev.bonus.options : DECISION_LABELS[k];
        c.querySelector('.coin-t').innerHTML = `Coin says: <b>${esc(L[d.winner])}</b>`;
        c.querySelector('.coin').style.animation = 'none';
      });
      await sleep(1600);
      coins.forEach((c) => (c.style.display = 'none'));
    }
  }

  // ── REVEAL (the signature moment) ──
  const TRUCK = `<svg class="truck-svg" viewBox="0 0 130 70" aria-hidden="true"><rect x="4" y="12" width="74" height="40" rx="6" fill="#e8590c"/><text x="41" y="38" text-anchor="middle" font-size="16" font-weight="900" fill="#fff" font-family="sans-serif">₹ ZipEats</text><path d="M78 24h26l16 16v12H78z" fill="#f2a900"/><rect x="86" y="28" width="16" height="11" rx="2" fill="#fffaf0"/><circle cx="26" cy="56" r="9" fill="#2a1508"/><circle cx="26" cy="56" r="4" fill="#fffaf0"/><circle cx="100" cy="56" r="9" fill="#2a1508"/><circle cx="100" cy="56" r="4" fill="#fffaf0"/><path d="M0 62h130" stroke="#ecd6b6" stroke-width="3"/></svg>`;

  function viewReveal() {
    const r = view.result;
    if (!r) return;
    const l = r.line;
    const c = l.costs;
    const rows = [
      ['Ingredients bought', c.ingredients, `paid today`],
      ['Packaging', c.packaging],
      ['Ads', c.ads],
      ['Staff', c.staff],
      ['Rent + utilities', c.rent + c.utilities],
      ['Loan interest', c.interest],
      ['Hygiene fine', c.penalty],
      ['Bulk ingredient deal', c.supplierDeal],
    ].filter((x) => x[1] > 0);
    const memo = [
      ['Discount you paid for', c.discount, 'already taken off sales'],
      ['ZipEats commission + fees', c.commission, 'taken from your payout'],
      ['Food thrown away', c.wastage, 'part of ingredients'],
    ].filter((x) => x[1] > 0);
    const plus = [[l.collected ? 'From ZipEats: earlier sales finally arrive' : 'From ZipEats: nothing arrived this week', l.collected]];
    if (l.loanIn) plus.push(['Bridge loan received', l.loanIn]);
    if (l.rescue) plus.push(['🚨 Emergency rescue loan', l.rescue]);
    main.innerHTML = `<div class="reveal">
      <div class="rv-left">
        <div class="rv-big">
          <div class="rv-num orders card"><div class="tickets" id="tickets"></div><div class="l">Orders this week</div><div class="v" id="rv-orders">0</div><div class="s">${l.unserved > 0 ? `😟 ${num(l.unserved)} customers turned away` : 'Every customer served'}</div></div>
          <div class="rv-num sales card"><div class="l">Sales</div><div class="v" id="rv-sales">₹0</div><div class="s">${l.refunds ? `incl. ${inr(l.refunds)} refunded` : 'Looks great, right?'}</div></div>
        </div>
        <div class="costs card">
          <h4><span>Cash out and in this week</span></h4>
          ${rows.map((x) => `<div class="cost"><span>${x[0]}${x[2] ? `<small>${x[2]}</small>` : ''}</span><span class="cv">−${inr(x[1]).replace('₹', '₹')}</span></div>`).join('')}
          ${plus.map((x) => `<div class="cost plus"><span>${x[0]}</span><span class="cv">+${inr(x[1])}</span></div>`).join('')}
          <h4 style="margin-top:12px"><span>Hidden in the numbers</span></h4>
          ${memo.map((x) => `<div class="cost memo"><span>${x[0]}<small>${x[2]}</small></span><span class="cv">${inr(x[1])}</span></div>`).join('')}
        </div>
        <div class="truck-row card">${TRUCK}<div class="truck-t">Money on the way from ZipEats<b>${inr(l.receivable)}</b>arrives next week${r.line.event === 'settlement' ? ' (or later: payouts are delayed!)' : ''}</div></div>
      </div>
      <div class="rv-right">
        <div class="cash-card card" id="cash-card"><div><div class="l">Cash in bank</div><div class="v" id="rv-cash">${inr(l.startCash)}</div></div><div class="d" id="rv-delta"></div></div>
        <div class="chart-card card"><div id="rv-chart"></div></div>
        <div class="verdict card" id="verdict"></div>
      </div>
    </div>`;
    const chartData = view.chart.slice(0, -1);
    Chart2.renderChart($('#rv-chart'), chartData, { weeks: view.weeks, goal: view.goal, w: 960, h: 470 });
    if (revealDone[view.week]) return finishReveal(true);
    revealDone[view.week] = true;
    playReveal();
  }

  async function playReveal() {
    const r = view.result;
    const l = r.line;
    const s = view.sound;
    const myWeek = view.week;
    const alive = () => view.phase === 'reveal' && view.week === myWeek;
    // 1. orders + flying tickets
    const tk = $('#tickets');
    const nTickets = Math.min(28, Math.max(6, Math.round(l.orders / 70)));
    for (let i = 0; i < nTickets; i++) {
      setTimeout(() => {
        if (!tk.isConnected) return;
        const t = document.createElement('div');
        t.className = 'ticket';
        t.style.left = 40 + Math.random() * 280 + 'px';
        t.style.top = 20 + Math.random() * 40 + 'px';
        t.style.setProperty('--dx', (Math.random() * 200 - 100) + 'px');
        t.style.setProperty('--r', (Math.random() * 60 - 30) + 'deg');
        tk.appendChild(t);
        setTimeout(() => t.remove(), 1000);
        if (s && i % 3 === 0) Sound.ding();
      }, i * 90);
    }
    await countTo($('#rv-orders'), 0, l.orders, 2600);
    if (!alive()) return;
    if (l.event === 'viral' || l.event === 'festival') confetti(60);
    // 2. sales
    if (s) Sound.coin();
    await countTo($('#rv-sales'), 0, l.sales, 1600, inr);
    await sleep(500);
    // 3. costs land one by one
    const costs = main.querySelectorAll('.cost');
    for (const c of costs) {
      if (!alive()) return;
      c.classList.add('in');
      if (s) (c.classList.contains('plus') ? Sound.coin : c.classList.contains('memo') ? Sound.tick : Sound.cost)();
      await sleep(c.classList.contains('memo') ? 650 : 900);
    }
    // 4. the truck
    if (!alive()) return;
    $('.truck-row').classList.add('in');
    if (s) Sound.whoosh();
    await sleep(2200);
    // 5. cash moves
    if (!alive()) return;
    const cc = $('#cash-card');
    cc.classList.add('in');
    const down = l.cash < l.startCash;
    cc.classList.add(down ? 'down' : 'up');
    if (s) (down ? Sound.buzz : Sound.register)();
    await countTo($('#rv-cash'), l.startCash, l.cash, 2200, inr);
    finishReveal(false);
  }

  function finishReveal(instant) {
    revealFinished = view.week;
    renderTop();
    const r = view.result;
    const l = r.line;
    main.querySelectorAll('.cost').forEach((c) => c.classList.add('in'));
    const tr = $('.truck-row'); if (tr) tr.classList.add('in');
    const cc = $('#cash-card'); if (!cc) return;
    cc.classList.add('in', l.cash < l.startCash ? 'down' : 'up');
    $('#rv-orders').textContent = num(l.orders);
    $('#rv-sales').textContent = inr(l.sales);
    $('#rv-cash').textContent = inr(l.cash);
    const delta = l.cash - l.startCash;
    $('#rv-delta').textContent = (delta >= 0 ? '▲ +' : '▼ ') + inr(delta).replace('−', '−');
    Chart2.renderChart($('#rv-chart'), view.chart, { weeks: view.weeks, goal: view.goal, w: 960, h: 470, animate: !instant });
    const v = $('#verdict');
    let msg;
    if (l.bankrupt) { msg = `💀 Out of cash, again. There is no second rescue. ${esc(view.kitchenName)} closes its doors.`; v.classList.add('alarm'); }
    else if (l.rescue) { msg = `🚨 Cash went below zero! The bank lent you an emergency ${inr(l.rescue)} at 6% a week. Next time there is no rescue.`; v.classList.add('alarm'); }
    else if (l.sales > 0 && delta < 0) msg = `Sales were <b>${inr(l.sales)}</b>, yet cash went <b style="color:var(--red)">down ${inr(-delta)}</b>. The money is on the truck.`;
    else msg = `Cash went <b style="color:var(--cash)">up ${inr(delta)}</b>. Last week’s sales finally arrived.`;
    v.innerHTML = msg;
    v.classList.add('in');
    if (!instant && (l.rescue || l.bankrupt || l.cash < 100000)) { const f = document.createElement('div'); f.className = 'flash'; stage.appendChild(f); setTimeout(() => f.remove(), 1000); }
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

  // ── LEADERBOARD ──
  function gauge(frac) {
    const a = Math.PI * (1 - (frac == null ? 0 : frac));
    const x = 140 + 110 * Math.cos(a), y = 140 - 110 * Math.sin(a);
    return `<svg viewBox="0 0 280 160" aria-hidden="true">
      <path d="M30 140 A110 110 0 0 1 250 140" fill="none" stroke="#ecd6b6" stroke-width="26" stroke-linecap="round"/>
      <path d="M30 140 A110 110 0 0 1 250 140" fill="none" stroke="url(#gg)" stroke-width="26" stroke-linecap="round" pathLength="100" stroke-dasharray="${(frac || 0) * 100} 100"/>
      <defs><linearGradient id="gg"><stop offset="0" stop-color="#c9182b"/><stop offset=".5" stop-color="#f2a900"/><stop offset="1" stop-color="#1f7a4a"/></linearGradient></defs>
      <line x1="140" y1="140" x2="${x}" y2="${y}" stroke="#2a1508" stroke-width="7" stroke-linecap="round"/><circle cx="140" cy="140" r="12" fill="#2a1508"/>
      <text x="22" y="158" font-size="15" font-weight="800" fill="#74543d">Coin toss</text><text x="258" y="158" text-anchor="end" font-size="15" font-weight="800" fill="#74543d">Oracle</text></svg>`;
  }
  function viewLeaderboard() {
    const r = view.result;
    const v = view;
    if (!r) return;
    const fs = r.forecastSplit || {};
    const tot = Object.values(fs).reduce((a, b) => a + b, 0);
    const rightPct = tot ? Math.round(((fs[r.answer] || 0) / tot) * 100) : 0;
    const q = r.question;
    const ansBars = q ? q.options.map((o) => { const p = tot ? Math.round(((fs[o.v] || 0) / tot) * 100) : 0; return `<div class="abar ${o.v === r.answer ? 'right' : ''}"><i style="width:${p}%"></i><span>${esc(o.label)}${o.v === r.answer ? ' ✓' : ''}</span><b>${p}%</b></div>`; }).join('') : '';
    const crowd = v.crowd;
    const frac = crowd.total ? crowd.right / crowd.total : null;
    const gLabel = frac == null ? 'Waiting for forecasts' : frac >= 0.75 ? 'Collective genius' : frac >= 0.5 ? 'Mostly sharp' : frac >= 0.25 ? 'Optimistic crowd' : 'Wishful thinking';
    const names = { growth: ['🚀', 'Rocket Rhea'], ops: ['🍳', 'Steady Sam'], finance: ['💰', 'Penny Priya'] };
    const best = names[r.bestAdvisor];
    const last = v.week >= v.weeks || (v.kitchen && v.kitchen.bankrupt);
    main.innerHTML = `<div class="lb">
      <div class="lb-left">
        <div class="answer card"><div class="a-tag">${esc(q ? q.tag : 'Prediction')} · ${esc(q ? q.text : '')}</div>
          <h2>Answer: <span class="${r.answer === 'lower' || r.answer === 'yes' && q && q.id === 'danger' ? 'lo' : 'hi'}">${esc(r.answerLabel || r.answer)}</span></h2>
          <div class="abars">${ansBars}</div>
          <p class="why">💡 ${esc(r.why || '')}</p>
          <p>${tot ? `${rightPct}% of you got it right.` : 'Nobody answered this week.'} ${r.majorityRight === false ? 'Most of the room got it wrong.' : r.majorityRight ? 'The room called it.' : ''}</p></div>
        <div class="gauge-card card">${gauge(frac)}<div class="gauge-t"><b>Crowd wisdom: ${gLabel}</b>The room’s majority answer has been right ${crowd.right} of ${crowd.total} week${crowd.total === 1 ? '' : 's'}.</div></div>
        <div class="adv-week card"><div class="adv-e">${best[0]}</div><div><b>${best[1]}</b>’s advice would have done best this week. You followed ${names[r.trusted][1]} most closely.</div></div>
      </div>
      <div class="board card">
        <h3>🏆 Sharpest Forecasters</h3>
        ${v.leaderboard.map((p, i) => `<div class="lbrow"><div class="rk">${i + 1}</div><div>${esc(p.nick)}<span class="rl">${{ growth: 'Growth', ops: 'Ops', finance: 'Finance' }[p.role]}</span></div><div class="sc">${num(p.score)}</div></div>`).join('') || '<p class="muted" style="font-size:24px">No players yet.</p>'}
        <div class="next-hint">${last ? 'Press Space to see how the story ends →' : `Press Space for Week ${v.week + 1} →`}</div>
      </div>
    </div>`;
  }

  // ── ENDING ──
  function viewEnding() {
    const e = view.ending;
    if (!e) return;
    const root = document.createElement('div');
    main.innerHTML = '';
    main.appendChild(root);
    Ending.renderEnding(root, { content: e.content, sheet: e.sheet, chart: view.chart, comparison: e.comparison, stats: e.stats, podium: view.podium, goal: view.goal, weeks: view.weeks }, endingStep);
    const act = document.createElement('div');
    act.className = 'end-actions';
    act.innerHTML = endingStep < 2 ? '<span class="next-hint">Space → next</span>' : '<button id="replay">▶ Replay with the same room</button>';
    root.appendChild(act);
    const rb = $('#replay');
    if (rb) rb.onclick = () => { revealDone = {}; endingStep = 0; cmd('replay'); };
    if (endingStep === 0 && e.content.theme === 'green' && view.sound) confetti(120);
  }

  connect();
})();
