// Phone page.
(function () {
  const { inr, num, esc, $, DECISION_LABELS } = window.U;
  const screen = $('#screen');

  let deviceId = localStorage.getItem('deviceId');
  if (!deviceId) {
    deviceId = 'd' + Array.from(crypto.getRandomValues(new Uint8Array(12))).map((b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('deviceId', deviceId);
  }
  let vibrateOn = localStorage.getItem('vibrate') !== 'off';
  let pub = null, me = null, recvAt = 0, key = '', ws = null, buzzed = null;
  const localVotes = {};
  let localForecast = null;
  let editingNick = false;

  const HINTS = {
    discount: { none: 'Full price, fewer orders', d10: 'More orders, less per order', d30: 'Lots of orders, tiny margin' },
    ads: { none: 'Free. People forget you', small: 'Steady new eyes', big: 'A splash, paid today' },
    stock: { lean: 'Little waste, may run out', right: 'Buy what you can cook', heavy: 'Never run out, paid upfront' },
    staff: { keep: 'Same kitchen', add: '+450 orders, ₹5.5k/wk' },
  };

  function connect() {
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    ws.onopen = () => { $('#conn').classList.remove('on'); ws.send(JSON.stringify({ t: 'hello', deviceId })); };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t !== 'state') return;
      const phaseChanged = !pub || pub.phase !== m.pub.phase || pub.week !== m.pub.week;
      pub = m.pub; me = m.me; recvAt = Date.now();
      if (phaseChanged) { for (const k in localVotes) delete localVotes[k]; localForecast = null; buzzed = null; }
      render();
    };
    ws.onclose = () => { $('#conn').classList.add('on'); setTimeout(connect, 1000 + Math.random() * 1500); };
  }
  const send = (o) => ws && ws.readyState === 1 && ws.send(JSON.stringify(o));

  function remaining() {
    if (!pub || pub.remainingMs == null) return null;
    if (pub.paused) return pub.remainingMs;
    return Math.max(0, pub.remainingMs - (Date.now() - recvAt));
  }
  function tickClock() {
    const c = $('#clock');
    const rem = remaining();
    const timed = pub && ['brief', 'forecast', 'vote'].includes(pub.phase) && rem != null;
    c.classList.toggle('off', !timed);
    if (!timed) { $('#tbar').style.width = '0%'; return; }
    const sec = Math.ceil(rem / 1000);
    c.textContent = pub.paused ? '⏸' : sec;
    c.classList.toggle('hurry', sec <= 10 && pub.phase === 'vote');
    const total = pub.phase === 'vote' ? pub.timer * 1000 : pub.phase === 'forecast' ? 15000 : 10000;
    $('#tbar').style.width = (rem / total) * 100 + '%';
    if (pub.phase === 'vote' && sec === 5 && buzzed !== pub.week && vibrateOn && navigator.vibrate) { buzzed = pub.week; navigator.vibrate([120, 80, 120]); }
  }
  setInterval(tickClock, 250);

  function header() {
    if (!me) return;
    $('#me-nick').textContent = `${me.roleInfo.emoji} ${me.nick}`;
    $('#me-sub').innerHTML = `${esc(me.roleInfo.name)} · ${num(me.score)} pts${me.rank ? ` · #${me.rank} of ${me.of}` : ''}${me.streak >= 2 ? ` · 🔥${me.streak}` : ''}`;
  }

  function render() {
    if (!pub || !me) return;
    header();
    tickClock();
    if (editingNick) return;
    const votes = { ...me.votes, ...localVotes };
    const forecast = localForecast || me.forecast;
    const k = [pub.phase, pub.week, forecast, JSON.stringify(votes), pub.phase === 'leaderboard' || pub.phase === 'ending' ? JSON.stringify(me.last) + me.rank : '', pub.phase === 'setup' ? me.nick + localStorage.getItem('seenRole') : '', pub.decisions.join()].join('|');
    if (k === key) return;
    key = k;
    const fn = { setup: viewLobby, brief: viewBrief, forecast: viewForecast, vote: viewVote, split: viewWatch, reveal: viewWatch, leaderboard: viewResult, ending: viewEnding }[pub.phase];
    screen.className = 'screen';
    void screen.offsetWidth;
    if (fn) fn(votes, forecast);
    if (pub.phase !== 'setup' && !localStorage.getItem('seenRole')) {
      const div = document.createElement('div');
      div.innerHTML = roleCard(true) + '<button class="big-btn" id="gotit2" style="margin-top:10px">Got it</button>';
      div.className = 'late-role';
      screen.prepend(div);
      $('#gotit2').onclick = () => { localStorage.setItem('seenRole', '1'); key = ''; render(); };
    }
  }

  // ── lobby / join ──
  function roleCard(flip) {
    const r = me.roleInfo;
    return `<div class="card role-card ${flip ? 'role-flip' : ''}"><div class="role-e">${r.emoji}</div><div class="sub">Your secret role</div><div class="role-n">${esc(r.name)}</div><div class="role-p">${esc(r.pride)}</div><div class="role-b">${esc(r.bonus)}</div></div>`;
  }
  function nickEditor() {
    return `<div><div class="sub" style="margin-bottom:6px">Your nickname (shown on the leaderboard)</div><div class="nick-row"><input id="nick" maxlength="24" value="${esc(me.nick)}" autocomplete="off" aria-label="Nickname"><button id="nick-save">Save</button></div></div>`;
  }
  function bindNick() {
    const inp = $('#nick');
    if (!inp) return;
    inp.onfocus = () => (editingNick = true);
    const save = () => { editingNick = false; const v = inp.value.trim(); if (v && v !== me.nick) send({ t: 'nick', nick: v }); key = ''; render(); };
    inp.onblur = () => setTimeout(() => { if (editingNick) save(); }, 150);
    inp.onkeydown = (e) => { if (e.key === 'Enter') inp.blur(); };
    $('#nick-save').onclick = save;
  }
  function viewLobby() {
    const first = !localStorage.getItem('seenRole');
    if (first) {
      screen.innerHTML = `<div class="h">You’re in the kitchen! 🎉</div><p class="sub">You’re part of the management team of <b>${esc(pub.kitchenName)}</b>.</p>${roleCard(true)}${nickEditor()}<button class="big-btn" id="gotit">Got it</button>`;
      $('#gotit').onclick = () => { localStorage.setItem('seenRole', '1'); key = ''; render(); };
    } else {
      screen.innerHTML = `<div class="card wait"><div class="wait-e">👩‍🍳</div><div class="wait-t">You’re in! Waiting for the host…</div><div class="wait-s">Look up at the big screen. The game starts soon.</div></div>${roleCard(false)}${nickEditor()}${settingsRow()}`;
      bindSettings();
    }
    bindNick();
  }
  function settingsRow() {
    return `<div class="settings-row"><span>Buzz at 5 seconds left</span><button class="toggle" id="vib">${vibrateOn ? 'On' : 'Off'}</button></div>`;
  }
  function bindSettings() {
    const b = $('#vib');
    if (b) b.onclick = () => { vibrateOn = !vibrateOn; localStorage.setItem('vibrate', vibrateOn ? 'on' : 'off'); b.textContent = vibrateOn ? 'On' : 'Off'; };
  }

  // ── brief ──
  function advisorCards() {
    const a = pub.advisors;
    if (!a) return '';
    return ['growth', 'ops', 'finance'].map((k) => `<div class="card adv ${k}"><div class="adv-e">${a[k].emoji}</div><div><div class="adv-n">${esc(a[k].name)} <small>· ${esc(a[k].role)}</small></div><div class="adv-l">“${esc(a[k].line)}”</div></div></div>`).join('');
  }
  function viewBrief() {
    const ev = pub.event;
    const tone = ev.tone === 'bad' ? 'bad' : ev.tone === 'good' ? 'good' : '';
    screen.innerHTML = `<div class="h">Week ${pub.week} of ${pub.weeks}</div>
      <div class="card news ${tone}"><div class="news-k">${ev.id === 'flavour' ? 'Kitchen news' : 'Breaking · ' + esc(ev.title)}</div><div class="news-h">${esc(ev.headline)}</div>${ev.effect ? `<div class="news-e">${esc(ev.effect)}</div>` : ''}</div>
      ${ev.bonus ? `<div class="card" style="border:2px dashed var(--ink)"><b>🤝 ${esc(ev.bonus.title)}</b><div class="sub">${esc(ev.bonus.question)}</div></div>` : ''}
      <div class="sub"><b>Your advisors say</b> (each one has a bias):</div>${advisorCards()}`;
  }

  // ── forecast ──
  function viewForecast(votes, forecast) {
    const q = pub.question;
    if (!q) return;
    const cls = (o) => (o.v === 'higher' ? 'hi' : o.v === 'lower' ? 'lo' : 'nt');
    screen.innerHTML = `<div class="q-tag">Week ${pub.week} prediction · ${esc(q.tag)}</div><div class="fq">${esc(q.text)}</div>
      <div class="fbtns n${q.options.length}">${q.options.map((o) => `<button class="fbtn ${cls(o)} ${forecast === o.v ? 'on' : ''}" data-v="${esc(o.v)}">${esc(o.label)}</button>`).join('')}</div>
      <div class="fnote">${forecast ? 'Locked in. You can still change it.' : 'A right answer = 100 points. Streaks score more.'}</div>`;
    screen.querySelectorAll('.fbtn').forEach((b) => (b.onclick = () => { localForecast = b.dataset.v; send({ t: 'forecast', v: b.dataset.v }); if (navigator.vibrate && vibrateOn) navigator.vibrate(15); render(); }));
  }

  // ── vote ──
  function viewVote(votes) {
    const keys = pub.decisions;
    const ev = pub.event;
    const cards = keys.map((k) => {
      if (k === 'bonus') {
        return `<div class="card dec bonus"><div class="dec-t">🤝 ${esc(ev.bonus.title.replace('Boardroom: ', ''))}${votes.bonus ? '<small>✓</small>' : ''}</div><div class="q">${esc(ev.bonus.question)}</div><div class="opts">${['take', 'skip'].map((o) => `<button class="opt ${votes.bonus === o ? 'on' : ''}" data-k="bonus" data-v="${o}"><b>${esc(ev.bonus.options[o])}</b><span>${esc(ev.bonus.hints[o])}</span></button>`).join('')}</div></div>`;
      }
      const L = DECISION_LABELS[k];
      return `<div class="card dec"><div class="dec-t">${L.title}${votes[k] ? '<small>✓</small>' : ''}</div><div class="opts">${Object.keys(HINTS[k]).map((o) => `<button class="opt ${votes[k] === o ? 'on' : ''}" data-k="${k}" data-v="${o}" aria-pressed="${votes[k] === o}"><b>${L[o].replace(' · ', '<br>')}</b><span>${HINTS[k][o]}</span></button>`).join('')}</div></div>`;
    }).join('');
    const done = keys.filter((k) => votes[k]).length;
    const all = done === keys.length;
    screen.innerHTML = `<div class="allset ${all ? '' : 'todo'}">${all ? 'Locked in ✓ · change until time’s up' : `Tap your choice: ${done} of ${keys.length} decided`}</div>${cards}
      <details class="vote-adv"><summary>💬 What did the advisors say? ▾</summary>${advisorCards()}</details>`;
    screen.querySelectorAll('.opt').forEach((b) => (b.onclick = () => {
      localVotes[b.dataset.k] = b.dataset.v;
      send({ t: 'vote', key: b.dataset.k, v: b.dataset.v });
      if (navigator.vibrate && vibrateOn) navigator.vibrate(12);
      const open = screen.querySelector('.vote-adv') && screen.querySelector('.vote-adv').open;
      const y = window.scrollY;
      render();
      if (open) screen.querySelector('.vote-adv').open = true;
      window.scrollTo(0, y);
    }));
  }

  // ── waiting for the reveal ──
  function viewWatch(votes) {
    const ev = pub.event;
    const mine = pub.decisions.filter((k) => votes[k]).map((k) => {
      const label = k === 'bonus' ? ev.bonus.options[votes[k]] : DECISION_LABELS[k][votes[k]];
      return `<div><span>${k === 'bonus' ? 'Boardroom' : DECISION_LABELS[k].title}</span><span>${esc(label)}</span></div>`;
    }).join('');
    screen.innerHTML = `<div class="card locked"><div class="locked-e">👀</div><div class="locked-t">Votes are locked</div><div class="locked-s">Watch the big screen to see what the room chose, and what happened to the cash.</div></div>
      ${mine ? `<div class="sub"><b>Your votes</b></div><div class="mychoices">${mine}</div>` : '<p class="sub" style="text-align:center">You didn’t vote this week.</p>'}`;
  }

  // ── personal result ──
  function viewResult() {
    const l = me.last;
    if (!l) { screen.innerHTML = `<div class="card locked"><div class="locked-e">📊</div><div class="locked-t">Results on the big screen</div></div>`; return; }
    screen.innerHTML = `<div class="card res-pts"><div class="p">+${num(l.pts)}</div><div class="r">You’re #${me.rank} of ${me.of} ${me.streak >= 2 ? `<span class="streak">🔥 ${me.streak} in a row</span>` : ''}</div></div>
      <div class="card">${l.forecast ? `<div class="fres ${l.fRight ? 'ok' : 'no'}">${l.fRight ? '✓ Your prediction was right' : '✗ Your prediction was wrong'}</div>` : '<div class="fres no">No prediction this week</div>'}${l.answerLabel ? `<div class="ans">Answer: <b>${esc(l.answerLabel)}</b>${l.forecast && !l.fRight ? ` · you said ${esc(l.forecastLabel)}` : ''}</div>` : ''}${l.why ? `<div class="why">💡 ${esc(l.why)}</div>` : ''}<div class="vsroom" style="margin-top:8px">${esc(l.vsRoom)}</div></div>
      ${l.parts.length ? `<div class="card"><ul class="parts">${l.parts.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}
      <p class="sub" style="text-align:center">Next week starts when the host is ready.</p>`;
  }

  // ── ending ──
  function viewEnding() {
    const acc = me.forecasts ? Math.round((me.correct / me.forecasts) * 100) : null;
    screen.innerHTML = `<div class="card end ${pub.endingTheme || ''}"><div class="sub">The kitchen’s ending</div><div class="end-t">${esc(pub.endingTitle || 'Game over')}</div><div class="end-g">“${esc(pub.endingTagline || '')}”</div></div>
      <div class="card res-pts"><div class="p">${num(me.score)}</div><div class="r">points · #${me.rank} of ${me.of}</div>${acc != null ? `<div class="sub" style="margin-top:6px">${me.correct} of ${me.forecasts} predictions right (${acc}%)</div>` : ''}</div>
      <div class="card lesson">Growth is not cash.<br>Margins, payout delays and fixed costs decide who survives.</div>
      <p class="sub" style="text-align:center">The full balance sheet is on the big screen.</p>`;
  }

  connect();
})();
