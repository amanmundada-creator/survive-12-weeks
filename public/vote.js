// Phone page: your own kitchen, Kahoot-style questions.
(function () {
  const { inr, inrShort, num, esc, $, DECISION_LABELS } = window.U;
  const screen = $('#screen');
  const SHAPES = ['▲', '◆', '●', '■'];

  let deviceId = localStorage.getItem('deviceId');
  if (!deviceId) {
    deviceId = 'd' + Array.from(crypto.getRandomValues(new Uint8Array(12))).map((b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('deviceId', deviceId);
  }
  let vibrateOn = localStorage.getItem('vibrate') !== 'off';
  let pub = null, me = null, recvAt = 0, key = '', ws = null, buzzed = null, editingNick = false;
  let localAnswer = null;
  let removed = false;
  const localChoices = {};

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
      if (m.t === 'kicked') {
        removed = true;
        $('#conn').classList.remove('on');
        $('#clock').classList.add('off');
        screen.innerHTML = '<div class="card locked"><div class="locked-e">🚪</div><div class="locked-t">You were removed by the host</div><div class="locked-s">You can join again when the host starts a new game.</div></div>';
        return;
      }
      if (m.t !== 'state') return;
      const changed = !pub || pub.phase !== m.pub.phase || pub.week !== m.pub.week;
      removed = false;
      pub = m.pub; me = m.me; recvAt = Date.now();
      if (changed) { localAnswer = null; for (const k in localChoices) delete localChoices[k]; buzzed = null; }
      render();
    };
    ws.onclose = () => { if (removed) { setTimeout(connect, 15000); return; } $('#conn').classList.add('on'); setTimeout(connect, 1000 + Math.random() * 1500); };
  }
  const send = (o) => ws && ws.readyState === 1 && ws.send(JSON.stringify(o));
  const buzz = (ms) => { if (vibrateOn && navigator.vibrate) navigator.vibrate(ms); };

  function remaining() {
    if (!pub || pub.remainingMs == null) return null;
    return pub.paused ? pub.remainingMs : Math.max(0, pub.remainingMs - (Date.now() - recvAt));
  }
  function tickClock() {
    const c = $('#clock');
    const rem = remaining();
    const timed = pub && ['question', 'decide'].includes(pub.phase) && rem != null;
    c.classList.toggle('off', !timed);
    if (!timed) { $('#tbar').style.width = '0%'; return; }
    const sec = Math.ceil(rem / 1000);
    c.textContent = pub.paused ? '⏸' : pub.endedEarly ? '✓' : sec;
    c.classList.toggle('hurry', sec <= 5);
    const total = (pub.phase === 'question' ? pub.qSeconds : pub.dSeconds) * 1000;
    $('#tbar').style.width = Math.min(1, rem / total) * 100 + '%';
    if (pub.phase === 'decide' && sec === 5 && buzzed !== pub.week) { buzzed = pub.week; buzz([120, 80, 120]); }
  }
  setInterval(tickClock, 250);

  function header() {
    if (!me) return;
    $('#me-nick').textContent = `${me.roleInfo.emoji} ${me.nick}`;
    $('#me-sub').innerHTML = `💰 ${inrShort(me.score)}${me.rank ? ` · #${me.rank} of ${me.of}` : ''}${me.streak >= 2 ? ` · 🔥${me.streak}` : ''}${me.closed ? ' · <b style="color:var(--red)">closed</b>' : ''}`;
  }

  function render() {
    if (!pub || !me) return;
    header();
    tickClock();
    if (editingNick) return;
    const choices = { ...me.choices, ...localChoices };
    const ans = localAnswer != null ? localAnswer : me.answer;
    const k = [pub.phase, pub.week, ans, JSON.stringify(choices), me.closed, pub.phase === 'setup' ? me.nick + localStorage.getItem('seenRole') : '', ['answer', 'results', 'ending'].includes(pub.phase) ? JSON.stringify(me.lastQuiz) + me.rank + me.score : '', pub.decisions.join()].join('|');
    if (k === key) return;
    key = k;
    const fn = { setup: viewLobby, intro: viewIntro, brief: viewBrief, question: viewQuestion, answer: viewAnswer, decide: viewDecide, results: viewResults, ending: viewEnding }[pub.phase];
    screen.className = 'screen';
    if (fn) fn(choices, ans);
    if (pub.phase !== 'setup' && !localStorage.getItem('seenRole')) {
      const div = document.createElement('div');
      div.innerHTML = roleCard(true) + '<button class="big-btn" id="gotit2" style="margin-top:10px">Got it</button>';
      screen.prepend(div);
      $('#gotit2').onclick = () => { localStorage.setItem('seenRole', '1'); key = ''; render(); };
    }
  }

  // ── lobby ──
  function roleCard(flip) {
    const r = me.roleInfo;
    return `<div class="card role-card ${flip ? 'role-flip' : ''}"><div class="role-e">${r.emoji}</div><div class="sub">Your style</div><div class="role-n">${esc(r.name)}</div><div class="role-p">${esc(r.pride)}</div><div class="role-b">You run your own kitchen with ₹5,00,000. Richest kitchen at the end wins.</div></div>`;
  }
  function nickEditor() {
    return `<div><div class="sub" style="margin-bottom:6px">Your kitchen’s name on the leaderboard</div><div class="nick-row"><input id="nick" maxlength="24" value="${esc(me.nick)}" autocomplete="off" aria-label="Nickname"><button id="nick-save">Save</button></div></div>`;
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
    if (!localStorage.getItem('seenRole')) {
      screen.innerHTML = `<div class="h">Your kitchen is open! 🎉</div>${roleCard(true)}${nickEditor()}<button class="big-btn" id="gotit">Got it</button>`;
      $('#gotit').onclick = () => { localStorage.setItem('seenRole', '1'); key = ''; render(); };
    } else {
      screen.innerHTML = `<div class="card wait"><div class="wait-e">👩‍🍳</div><div class="wait-t">You’re in! Waiting for the host…</div><div class="wait-s">While you wait, learn how your kitchen works:</div></div>${pub.facts ? briefHtml() : ''}${nickEditor()}${settingsRow()}`;
      bindSettings();
    }
    bindNick();
  }
  function settingsRow() { return `<div class="settings-row"><span>Buzz when time is short</span><button class="toggle" id="vib">${vibrateOn ? 'On' : 'Off'}</button></div>`; }
  function bindSettings() {
    const b = $('#vib');
    if (b) b.onclick = () => { vibrateOn = !vibrateOn; localStorage.setItem('vibrate', vibrateOn ? 'on' : 'off'); b.textContent = vibrateOn ? 'On' : 'Off'; };
  }

  // ── the business briefing ──
  function briefHtml() {
    return `<div class="brief-cards">${window.U.briefCards(pub.facts).map((c) => `<div class="card bc"><div class="bc-e">${c.e}</div><div><b>${c.t}</b><p>${c.b}</p></div></div>`).join('')}</div>`;
  }
  function viewIntro() {
    screen.innerHTML = `<div class="h">How your kitchen works</div><p class="sub">Read this now. The ${pub.minutes}-minute clock starts when the host is ready.</p>${briefHtml()}`;
  }

  // ── brief ──
  function advisorCards() {
    const a = pub.advisors;
    if (!a) return '';
    return ['growth', 'ops', 'finance'].map((k) => `<div class="card adv ${k}"><div class="adv-e">${a[k].emoji}</div><div><div class="adv-n">${esc(a[k].name)} <small>· ${esc(a[k].role)}</small></div><div class="adv-l">“${esc(a[k].line)}”</div></div></div>`).join('');
  }
  function kitchenCard() {
    return `<div class="card mykit"><div><span>Cash in bank</span><b>${inr(me.cash)}</b></div><div><span>🚚 On the way</span><b>${inr(me.receivable)}</b></div></div>`;
  }
  function viewBrief() {
    const ev = pub.event;
    const tone = ev.tone === 'bad' ? 'bad' : ev.tone === 'good' ? 'good' : '';
    screen.innerHTML = `<div class="h">Week ${pub.week}</div>${kitchenCard()}
      <div class="card news ${tone}"><div class="news-k">${ev.id === 'flavour' ? 'Kitchen news' : 'Breaking · ' + esc(ev.title)}</div><div class="news-h">${esc(ev.headline)}</div>${ev.effect ? `<div class="news-e">${esc(ev.effect)}</div>` : ''}</div>
      <div class="sub"><b>Advisors</b> (each has a bias):</div>${advisorCards()}
      <p class="sub" style="text-align:center">A question is coming. Be quick!</p>`;
  }

  // ── question ──
  function viewQuestion(choices, ans) {
    const q = pub.quiz;
    if (!q) return;
    if (ans != null) {
      screen.innerHTML = `<div class="card locked"><div class="locked-e">${SHAPES[ans]}</div><div class="locked-t">Answer locked in</div><div class="locked-s">“${esc(q.options[ans])}”<br>Waiting for everyone else…</div></div>`;
      return;
    }
    screen.innerHTML = `<div class="kq-q">${esc(q.text)}</div>
      <div class="kq-btns n${q.options.length}">${q.options.map((o, i) => `<button class="kq-b c${i}" data-i="${i}"><span class="shape">${SHAPES[i]}</span><span>${esc(o)}</span></button>`).join('')}</div>
      <p class="fnote">Right = +₹10k to ₹20k (faster = more) · Wrong = −₹10k</p>`;
    screen.querySelectorAll('.kq-b').forEach((b) => (b.onclick = () => { localAnswer = Number(b.dataset.i); send({ t: 'answer', i: localAnswer }); buzz(20); render(); }));
  }

  // ── answer ──
  function viewAnswer() {
    const q = pub.quiz;
    const lq = me.lastQuiz;
    if (!q) return;
    const right = lq && lq.right;
    const cls = !lq || !lq.answered ? 'none' : right ? 'ok' : 'no';
    const head = cls === 'ok' ? `✓ Correct! +${inr(lq.delta)}` : cls === 'no' ? `✗ Wrong · ${inr(lq.delta)}` : 'No answer this time';
    if (cls === 'ok') buzz([40, 40, 40]);
    screen.innerHTML = `<div class="card qres ${cls}"><div class="qr-h">${head}</div>${me.streak >= 2 && right ? `<div class="streak">🔥 ${me.streak} in a row</div>` : ''}</div>
      <div class="card"><div class="sub">The answer</div><div class="ans-big"><span class="shape c${q.correct}">${SHAPES[q.correct]}</span> ${esc(q.options[q.correct])}</div><div class="why">💡 ${esc(q.why)}</div></div>
      <p class="sub" style="text-align:center">💰 Your kitchen: ${inr(me.score)} · #${me.rank} of ${me.of}</p>`;
  }

  // ── decide ──
  function viewDecide(choices) {
    if (me.closed) {
      screen.innerHTML = `<div class="card locked"><div class="locked-e">🔒</div><div class="locked-t">Your kitchen has closed</div><div class="locked-s">You ran out of cash twice. Keep answering questions: winnings pay off your unpaid bills.</div></div>`;
      return;
    }
    const keys = pub.decisions;
    const ev = pub.event;
    const done = keys.filter((k) => choices[k]).length;
    const all = done === keys.length;
    const cards = keys.map((k) => {
      if (k === 'bonus') return `<div class="card dec bonus"><div class="dec-t">🤝 ${esc(ev.bonus.title.replace('Boardroom: ', ''))}${choices.bonus ? '<small>✓</small>' : ''}</div><div class="q">${esc(ev.bonus.question)}</div><div class="opts">${['take', 'skip'].map((o) => `<button class="opt ${choices.bonus === o ? 'on' : ''}" data-k="bonus" data-v="${o}"><b>${esc(ev.bonus.options[o])}</b><span>${esc(ev.bonus.hints[o])}</span></button>`).join('')}</div></div>`;
      const L = DECISION_LABELS[k];
      return `<div class="card dec"><div class="dec-t">${L.title}${choices[k] ? '<small>✓</small>' : ''}</div><div class="opts">${Object.keys(HINTS[k]).map((o) => `<button class="opt ${choices[k] === o ? 'on' : ''}" data-k="${k}" data-v="${o}" aria-pressed="${choices[k] === o}"><b>${L[o].replace(' · ', '<br>')}</b><span>${HINTS[k][o]}</span></button>`).join('')}</div></div>`;
    }).join('');
    screen.innerHTML = `<div class="allset ${all ? '' : 'todo'}">${all ? 'Locked in ✓ · change until time’s up' : `Your kitchen, your call: ${done} of ${keys.length}`}</div>
      ${me.lastChoice && !all ? '<button class="repeat-btn" id="repeat">↺ Same as last week</button>' : ''}${cards}`;
    screen.querySelectorAll('.opt').forEach((b) => (b.onclick = () => {
      localChoices[b.dataset.k] = b.dataset.v;
      send({ t: 'choose', key: b.dataset.k, v: b.dataset.v });
      buzz(12);
      const y = window.scrollY;
      render();
      window.scrollTo(0, y);
    }));
    const rb = $('#repeat');
    if (rb) rb.onclick = () => { for (const k of keys) localChoices[k] = me.lastChoice[k] || (k === 'bonus' ? 'skip' : localChoices[k]); send({ t: 'repeat' }); buzz(12); render(); };
  }

  // ── results: your kitchen this week ──
  function viewResults() {
    const L = me.last;
    if (!L) { screen.innerHTML = `<div class="card locked"><div class="locked-e">📊</div><div class="locked-t">Results on the big screen</div></div>`; return; }
    const l = L.line;
    const qd = L.quiz && L.quiz.delta ? L.quiz.delta : 0;
    const ops = l.cash - l.startCash; // the kitchen itself (quiz money arrived before the week ran)
    const dc = ops + qd;
    const c = l.costs;
    const out = c.ingredients + c.packaging + c.ads + c.staff + c.rent + c.utilities + c.interest + c.penalty + c.supplierDeal;
    screen.innerHTML = `<div class="card res-pts"><div class="sub">Your kitchen, week ${l.week}</div><div class="p ${dc < 0 ? 'neg' : ''}">${dc >= 0 ? '+' : ''}${inr(dc)}</div><div class="r">cash this week · #${me.rank} of ${me.of}</div></div>
      <div class="card wk">
        <div><span>📦 Orders</span><b>${num(l.orders)}${l.unserved ? ` <small>(${num(l.unserved)} turned away)</small>` : ''}</b></div>
        <div><span>💵 Sales</span><b>${inr(l.sales)}</b></div>
        <div><span>➖ Paid out now</span><b class="neg">−${inr(out)}</b></div>
        <div><span>➕ Arrived from ZipEats</span><b class="pos">+${inr(l.collected)}</b></div>
        ${L.quiz && L.quiz.delta ? `<div><span>❓ Quiz</span><b class="${L.quiz.delta > 0 ? 'pos' : 'neg'}">${L.quiz.delta > 0 ? '+' : ''}${inr(L.quiz.delta)}</b></div>` : ''}
        <div class="tot"><span>🏦 Cash in bank</span><b>${inr(l.cash)}</b></div>
        <div><span>🚚 Still on the way</span><b>${inr(l.receivable)}</b></div>
      </div>
      ${l.rescue ? `<div class="card alarm">🚨 You ran out of cash! A lender saved you with ${inr(l.rescue)} at 6% a week. Next time there’s no rescue.</div>` : ''}
      ${l.bankrupt ? '<div class="card alarm">💀 Out of cash again. Your kitchen has closed.</div>' : ''}
      ${!l.rescue && !l.bankrupt && l.sales > 0 && ops < 0 ? `<p class="lesson-s">You sold ${inr(l.sales)}, but your kitchen paid out more cash than arrived. The rest is on the truck.</p>` : ''}
      ${!L.decidedSelf ? '<p class="sub" style="text-align:center">You didn’t decide this week, so your kitchen repeated last week’s choices.</p>' : ''}`;
  }

  // ── ending ──
  function viewEnding() {
    const e = me.ending;
    const g = pub.ending;
    screen.innerHTML = `${me.isWinner ? '<div class="card win">🏆 You won! Your balance sheet is on the big screen.</div>' : g && g.winner ? `<div class="sub" style="text-align:center">🏆 Winner: <b>${esc(g.winner)}</b></div>` : ''}
      <div class="card res-pts"><div class="p">#${me.rank}</div><div class="r">of ${me.of} · ${inr(me.score)} cash score</div><div class="sub" style="margin-top:6px">${me.correct} of ${me.answered} questions right · quiz ${me.quizNet >= 0 ? '+' : ''}${inr(me.quizNet)}</div></div>
      ${e ? `<div class="card end ${e.theme}"><div class="sub">Your kitchen’s ending</div><div class="end-t">${esc(e.title)}</div><div class="end-g">“${esc(e.tagline)}”</div></div>
      <div class="card"><div class="sub" style="margin-bottom:6px"><b>Your balance sheet</b></div>${miniSheet(e.sheet)}</div>` : ''}
      <div class="card lesson">Growth is not cash.<br>Margins, payout delays and fixed costs decide who survives.</div>`;
  }
  function miniSheet(sh) {
    const loans = sh.liabilities.bridgeLoan + sh.liabilities.emergencyLoan;
    const rows = [['Cash in bank', sh.assets.cash], ['Owed by ZipEats', sh.assets.receivable], ['Ingredients in stock', sh.assets.inventory], ['Loans', loans], ['Unpaid bills', sh.liabilities.unpaidBills], ['Profit / loss so far', sh.equity.retained]].filter((r, i) => i < 3 || i === 5 || r[1]);
    return `<div class="mini">${rows.map(([l, v]) => `<div class="mini-row ${v < 0 || (l === 'Unpaid bills' && v > 0) ? 'bad' : ''}"><span>${l}</span><b>${inr(v)}</b></div>`).join('')}<div class="mini-row tot"><span>Assets = liabilities + equity</span><b>${sh.balanced ? '✓' : '✗'}</b></div></div>`;
  }

  connect();
})();
