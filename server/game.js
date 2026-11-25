// The live game (Kahoot-style). Every player runs their OWN kitchen with the
// same events and the same luck. Each week: headline → quiz question (cash
// prize for right answers, penalty for wrong) → answer → each player decides
// for their kitchen → results. A game clock (default 5 minutes) runs on top;
// when it runs out, the current week finishes and the winner's balance sheet
// is analysed on the big screen.
const fs = require('fs');
const path = require('path');
const B = require('./balance');
const { initialState, simulateWeek, balanceSheet, receivableTotal, addQuizMoney, applyInvestorFunding } = require('./sim');
const { buildSchedule, EVENT_INFO, BONUS_INFO } = require('./events');
const { weekRng } = require('./rng');
const { classifyEnding, endingContent, META } = require('./endings');
const { runGame } = require('./runner');
const { balanced } = require('./strategies');
const { pickQuiz } = require('./quiz');
const { randomNick, ROLES, DECISIONS, DEFAULT_CHOICE, advisorAdvice, presenterNote } = require('./content');

const ROLE_KEYS = Object.keys(ROLES);
const CORE = ['discount', 'ads', 'stock', 'staff'];
const MAX_WEEKS = 12;
const ANSWER_MS = 7000;
const AUTO_RESULTS_MS = 12000;
const EARLY_END_MS = 1200; // pause after the last answer so it lands visibly

class Game {
  constructor({ config, file, onChange }) {
    this.config = config;
    this.file = file;
    this.onChange = onChange || (() => {});
    this.timer = null;
    this.clockTimer = null;
    this.autoplay = false;
    this.s = null;
    if (file && fs.existsSync(file)) {
      try {
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (saved.version === 2) {
          this.s = saved;
          Object.values(this.s.players).forEach((p) => (p.connected = false));
          this.resumeTimers();
        }
      } catch (e) { console.error('Could not read saved game, starting fresh:', e.message); }
    }
    if (!this.s) this.reset();
  }

  // ── setup / lifecycle ──
  reset(keepPlayers = false, newSeed) {
    const c = this.config;
    const old = this.s;
    const settings = old ? old.settings : { minutes: c.gameMinutes || 5, kitchenName: c.kitchenName, qSeconds: c.questionSeconds || 20, dSeconds: c.decisionSeconds || 20, sound: c.sound };
    const players = keepPlayers && old ? old.players : {};
    Object.values(players).forEach((p) => Object.assign(p, { sim: null, streak: 0, correct: 0, answered: 0, quizNet: 0, last: null, lastChoice: null, lastQuiz: null, endingId: null }));
    this.s = {
      version: 2,
      seed: newSeed != null ? newSeed : (old && keepPlayers ? old.seed + 1 : c.seed || Math.floor(Math.random() * 1e6)),
      phase: 'setup',
      settings,
      week: 0,
      plannedWeeks: 0,
      schedule: null,
      players,
      quiz: null,
      answers: {},
      used: [],
      lastCat: null,
      choices: {},
      advisors: null,
      room: null,
      roomHistory: [],
      answerStats: null,
      ending: null,
      kicked: {},
      phaseEndsAt: null,
      pausedRemaining: null,
      clockEndsAt: null,
      clockPaused: null,
      updatedAt: Date.now(),
    };
    this.clearTimers();
    this.changed(true);
  }

  setSettings(p) {
    if (this.s.phase !== 'setup') return;
    const st = this.s.settings;
    if ([3, 5, 8, 10, 15].includes(Number(p.minutes))) st.minutes = Number(p.minutes);
    if (typeof p.kitchenName === 'string' && p.kitchenName.trim()) st.kitchenName = p.kitchenName.trim().slice(0, 40);
    if (Number(p.qSeconds) >= 10 && Number(p.qSeconds) <= 60) st.qSeconds = Number(p.qSeconds);
    if (Number(p.dSeconds) >= 10 && Number(p.dSeconds) <= 90) st.dSeconds = Number(p.dSeconds);
    if (typeof p.sound === 'boolean') st.sound = p.sound;
    this.changed(false);
  }

  // About how many weeks fit in the clock (used for the goal and loan sizing).
  estimateWeeks() {
    const st = this.s.settings;
    const perWeek = 8 + st.qSeconds * 0.7 + ANSWER_MS / 1000 + st.dSeconds * 0.7 + 10;
    return Math.max(3, Math.min(MAX_WEEKS, Math.round((st.minutes * 60) / perWeek)));
  }

  goal() {
    const w = this.s.plannedWeeks || this.estimateWeeks();
    const g = this.config.goals || B.GOAL_BY_LENGTH;
    const pts = Object.keys(g).map(Number).sort((a, b) => a - b);
    if (w <= pts[0]) return Math.round(g[pts[0]] - (pts[0] - w) * 70);
    for (let i = 1; i < pts.length; i++) if (w <= pts[i]) return Math.round(g[pts[i - 1]] + ((g[pts[i]] - g[pts[i - 1]]) * (w - pts[i - 1])) / (pts[i] - pts[i - 1]));
    return g[pts[pts.length - 1]];
  }

  start() {
    if (this.s.phase !== 'setup') return;
    const s = this.s;
    s.plannedWeeks = this.estimateWeeks();
    s.schedule = buildSchedule(Math.max(6, s.plannedWeeks), s.seed);
    while (s.schedule.length < MAX_WEEKS) s.schedule.push({ week: s.schedule.length + 1, id: 'flavour', bonus: null, headline: 'Another busy week in the kitchen' });
    s.schedule.forEach((e) => (e.demoDay = false));
    Object.values(s.players).forEach((p) => (p.sim = initialState({ weeks: s.plannedWeeks })));
    s.clockEndsAt = Date.now() + s.settings.minutes * 60000;
    this.armClock();
    this.beginWeek(1);
  }

  newKitchen() { return initialState({ weeks: this.s.plannedWeeks || this.estimateWeeks() }); }

  beginWeek(w) {
    const s = this.s;
    s.week = w;
    s.answers = {};
    s.choices = {};
    s.answerStats = null;
    s.endedEarly = null;
    const ev = s.schedule[w - 1];
    s.advisors = advisorAdvice(this.typicalKitchen(), ev, weekRng(s.seed + 99, w), this.goal());
    s.quiz = pickQuiz({ week: w, seed: s.seed, event: ev, used: s.used, lastCat: s.lastCat, room: s.room });
    s.used.push(s.quiz.id);
    s.lastCat = s.quiz.cat;
    this.setPhase('brief', 10000);
  }

  typicalKitchen() {
    const open = Object.values(this.s.players).filter((p) => p.sim && !p.sim.bankrupt).map((p) => p.sim).sort((a, b) => a.cash - b.cash);
    return open.length ? open[Math.floor(open.length / 2)] : this.newKitchen();
  }

  // ── timers ──
  setPhase(phase, ms) {
    this.clearPhaseTimer();
    this.s.phase = phase;
    this.s.pausedRemaining = null;
    if (!ms && this.autoplay && phase === 'results') ms = AUTO_RESULTS_MS;
    this.s.phaseEndsAt = ms ? Date.now() + ms : null;
    if (ms) this.timer = setTimeout(() => this.next(), ms);
    this.changed(true);
  }

  clearPhaseTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; }
  clearTimers() { this.clearPhaseTimer(); if (this.clockTimer) clearTimeout(this.clockTimer); this.clockTimer = null; }

  armClock() {
    if (this.clockTimer) clearTimeout(this.clockTimer);
    const s = this.s;
    if (!s.clockEndsAt || s.clockPaused != null) return;
    // at zero the screens refresh; the week in progress still finishes
    this.clockTimer = setTimeout(() => this.changed(false), Math.max(0, s.clockEndsAt - Date.now()) + 50);
  }

  resumeTimers() {
    const s = this.s;
    const gap = Date.now() - (s.updatedAt || Date.now());
    if (s.clockEndsAt && s.clockPaused == null) s.clockEndsAt += gap; // don't lose clock time while the server was down
    if (s.pausedRemaining == null && s.phaseEndsAt) {
      const left = Math.max(1500, s.phaseEndsAt - (s.updatedAt || Date.now()));
      s.phaseEndsAt = Date.now() + left;
      this.timer = setTimeout(() => this.next(), left);
    }
    this.armClock();
  }

  remainingMs() {
    if (this.s.pausedRemaining != null) return this.s.pausedRemaining;
    return this.s.phaseEndsAt ? Math.max(0, this.s.phaseEndsAt - Date.now()) : null;
  }

  clockMs() {
    const s = this.s;
    if (!s.clockEndsAt) return s.phase === 'ending' ? 0 : s.settings.minutes * 60000;
    if (s.clockPaused != null) return s.clockPaused;
    return Math.max(0, s.clockEndsAt - Date.now());
  }

  pause() {
    const s = this.s;
    const paused = s.pausedRemaining != null || s.clockPaused != null;
    if (paused) {
      if (s.pausedRemaining != null) {
        const left = s.pausedRemaining;
        s.pausedRemaining = null;
        s.phaseEndsAt = Date.now() + left;
        this.timer = setTimeout(() => this.next(), left);
      }
      if (s.clockPaused != null) { s.clockEndsAt = Date.now() + s.clockPaused; s.clockPaused = null; this.armClock(); }
    } else {
      if (s.phaseEndsAt) { s.pausedRemaining = Math.max(0, s.phaseEndsAt - Date.now()); this.clearPhaseTimer(); }
      if (s.clockEndsAt) { s.clockPaused = this.clockMs(); if (this.clockTimer) clearTimeout(this.clockTimer); }
    }
    this.changed(false);
  }

  addTime(ms = 15000) {
    const s = this.s;
    if (s.pausedRemaining != null) s.pausedRemaining += ms;
    else if (s.phaseEndsAt) {
      s.phaseEndsAt += ms;
      this.clearPhaseTimer();
      this.timer = setTimeout(() => this.next(), s.phaseEndsAt - Date.now());
    }
    this.changed(false);
  }

  addClock(ms = 60000) {
    const s = this.s;
    if (!s.clockEndsAt) return;
    if (s.clockPaused != null) s.clockPaused += ms;
    else { s.clockEndsAt = Math.max(Date.now(), s.clockEndsAt) + ms; this.armClock(); }
    this.changed(false);
  }

  setAutoplay(on) {
    this.autoplay = !!on;
    if (this.autoplay && this.s.phase === 'results' && !this.s.phaseEndsAt) this.setPhase('results', AUTO_RESULTS_MS);
    else this.changed(false);
  }

  timeUp() { return this.clockMs() <= 0; }

  next() {
    const s = this.s;
    switch (s.phase) {
      case 'setup': return this.start();
      case 'brief': return this.setPhase('question', s.settings.qSeconds * 1000);
      case 'question': return this.closeQuestion();
      case 'answer': return this.setPhase('decide', s.settings.dSeconds * 1000);
      case 'decide': return this.runWeek();
      case 'results': {
        const alive = Object.values(s.players).some((p) => p.sim && !p.sim.bankrupt);
        if (this.timeUp() || s.week >= MAX_WEEKS || !alive) return this.finish();
        return this.beginWeek(s.week + 1);
      }
      default: return undefined;
    }
  }

  // ── players ──
  join(deviceId, nick) {
    const s = this.s;
    if (s.kicked && s.kicked[deviceId]) return null; // removed by the host for this game
    let p = s.players[deviceId];
    if (!p) {
      const counts = { growth: 0, ops: 0, finance: 0 };
      Object.values(s.players).forEach((x) => counts[x.role]++);
      const min = Math.min(...Object.values(counts));
      const options = ROLE_KEYS.filter((r) => counts[r] === min);
      p = {
        id: deviceId, nick: (nick && String(nick).slice(0, 24)) || randomNick(),
        role: options[Math.floor(Math.random() * options.length)],
        sim: s.phase === 'setup' || s.phase === 'ending' ? null : this.newKitchen(), // late joiners start a fresh kitchen
        streak: 0, correct: 0, answered: 0, quizNet: 0, last: null, lastChoice: null, joinedAt: Date.now(), bot: false,
      };
      s.players[deviceId] = p;
    }
    p.connected = true;
    this.changed(false, true);
    return p;
  }

  setNick(id, nick) {
    const p = this.s.players[id];
    if (!p) return;
    const clean = String(nick || '').replace(/[<>]/g, '').trim().slice(0, 24);
    if (clean) p.nick = clean;
    this.changed(false, true);
  }

  // Host removes a player: their kitchen leaves the game and the phone can't
  // rejoin until the host starts a new game.
  kick(id) {
    const s = this.s;
    if (!s.players[id]) return false;
    delete s.players[id];
    delete s.answers[id];
    delete s.choices[id];
    s.kicked = s.kicked || {};
    s.kicked[id] = true;
    this.changed(true);
    // the room may now be complete
    if (s.phase === 'question') this.maybeEndEarly('question', () => this.activePlayers().every((x) => s.answers[x.id]));
    if (s.phase === 'decide') this.maybeEndEarly('decide', () => this.decidersDone());
    return true;
  }

  disconnect(id) { const p = this.s.players[id]; if (p) { p.connected = false; this.changed(false, true); } }

  activePlayers() { return Object.values(this.s.players).filter((p) => p.connected); }

  // ── quiz ──
  answer(id, i) {
    const s = this.s;
    const p = s.players[id];
    if (s.phase !== 'question' || !p || s.answers[id]) return false; // one answer, no changing (like Kahoot)
    i = Number(i);
    if (!Number.isInteger(i) || i < 0 || i >= s.quiz.options.length) return false;
    s.answers[id] = { i, left: this.remainingMs() };
    this.changed(false, true);
    this.maybeEndEarly('question', () => this.activePlayers().every((x) => s.answers[x.id]));
    return true;
  }

  closeQuestion() {
    const s = this.s;
    const q = s.quiz;
    const total = s.settings.qSeconds * 1000;
    const counts = q.options.map(() => 0);
    for (const p of Object.values(s.players)) {
      const a = s.answers[p.id];
      let delta = 0;
      let right = null;
      if (a) {
        counts[a.i]++;
        p.answered++;
        right = a.i === q.correct;
        if (right) {
          p.streak++;
          p.correct++;
          const speed = Math.max(0, Math.min(1, (a.left || 0) / total));
          delta = Math.round((10000 + 10000 * speed) / 500) * 500 + 2000 * Math.min(5, p.streak - 1);
        } else { p.streak = 0; delta = -10000; }
      } else p.streak = 0;
      if (delta && p.sim) p.sim = addQuizMoney(p.sim, delta);
      p.quizNet += delta;
      p.lastQuiz = { week: s.week, answered: !!a, right, delta, pick: a ? a.i : null };
    }
    const answered = counts.reduce((x, y) => x + y, 0);
    s.answerStats = { counts, answered, right: counts[q.correct] };
    this.setPhase('answer', ANSWER_MS);
  }

  // ── decisions ──
  decisionKeys() {
    const ev = this.s.schedule && this.s.schedule[this.s.week - 1];
    return ev && ev.bonus ? [...CORE, 'bonus'] : CORE.slice();
  }

  choose(id, key, v) {
    const s = this.s;
    const p = s.players[id];
    if (s.phase !== 'decide' || !p || !p.sim || p.sim.bankrupt) return false;
    if (!this.decisionKeys().includes(key)) return false;
    const opts = key === 'bonus' ? ['take', 'skip'] : DECISIONS[key].options.map((o) => o.v);
    if (!opts.includes(v)) return false;
    if (!s.choices[id]) s.choices[id] = {};
    s.choices[id][key] = v;
    this.changed(false, true);
    this.maybeEndEarly('decide', () => this.decidersDone());
    return true;
  }

  // "Same as last week" in one tap
  repeatLast(id) {
    const s = this.s;
    const p = s.players[id];
    if (s.phase !== 'decide' || !p || !p.lastChoice || !p.sim || p.sim.bankrupt) return false;
    s.choices[id] = {};
    for (const k of this.decisionKeys()) s.choices[id][k] = p.lastChoice[k] || DEFAULT_CHOICE[k];
    this.changed(false, true);
    this.maybeEndEarly('decide', () => this.decidersDone());
    return true;
  }

  decidersDone() {
    const keys = this.decisionKeys();
    return this.activePlayers().filter((p) => p.sim && !p.sim.bankrupt).every((p) => this.s.choices[p.id] && keys.every((k) => this.s.choices[p.id][k]));
  }

  maybeEndEarly(phase, done) {
    const s = this.s;
    if (s.phase !== phase || s.pausedRemaining != null || !this.activePlayers().length || !done()) return;
    const soon = Date.now() + EARLY_END_MS;
    if (s.phaseEndsAt && s.phaseEndsAt <= soon) return;
    this.clearPhaseTimer();
    s.phaseEndsAt = soon;
    s.endedEarly = phase;
    this.timer = setTimeout(() => this.next(), EARLY_END_MS);
    this.changed(false);
  }

  runWeek() {
    const s = this.s;
    const w = s.week;
    const ev = s.schedule[w - 1];
    const keys = this.decisionKeys();
    const discountCounts = { none: 0, d10: 0, d30: 0 };
    const split = Object.fromEntries(keys.map((k) => [k, {}]));
    let kitchens = 0, cashDown = 0, ordersUp = 0, sumOrders = 0, sumCash = 0, closedNow = 0;
    for (const p of Object.values(s.players)) {
      if (!p.sim) p.sim = this.newKitchen();
      if (p.sim.bankrupt) continue;
      const picked = s.choices[p.id] || {};
      const d = {};
      for (const k of keys) d[k] = picked[k] || (p.lastChoice && p.lastChoice[k]) || DEFAULT_CHOICE[k];
      const before = p.sim;
      const prevOrders = before.history.length ? before.history[before.history.length - 1].orders : null;
      p.sim = simulateWeek(before, d, ev, weekRng(s.seed, w));
      p.lastChoice = d;
      const l = p.sim.history[p.sim.history.length - 1];
      kitchens++;
      discountCounts[d.discount]++;
      for (const k of keys) split[k][d[k]] = (split[k][d[k]] || 0) + 1;
      if (l.cashBeforeRescue < l.startCash) cashDown++;
      if (prevOrders == null ? l.orders > B.START_AWARENESS : l.orders > prevOrders) ordersUp++;
      if (p.sim.bankrupt) closedNow++;
      sumOrders += l.orders;
      sumCash += l.cash;
      p.last = { week: w, line: l, choices: d, decidedSelf: !!s.choices[p.id], quiz: p.lastQuiz && p.lastQuiz.week === w ? p.lastQuiz : null };
    }
    const ranked = this.ranked();
    s.room = {
      week: w, kitchens, discountCounts, split,
      cashDownShare: kitchens ? cashDown / kitchens : null,
      ordersUpShare: kitchens ? ordersUp / kitchens : null,
      avgOrders: kitchens ? Math.round(sumOrders / kitchens) : 0,
      avgCash: kitchens ? Math.round(sumCash / kitchens) : 0,
      closedNow,
      topCash: ranked.slice(0, 4).map((p) => ({ nick: p.nick, cash: Math.round(p.sim.cash) })),
    };
    s.roomHistory.push({ week: w, orders: s.room.avgOrders, cash: s.room.avgCash });
    this.setPhase('results');
  }

  // ── scores ──
  // Cash score = cash in the bank minus anything borrowed or unpaid, so a loan
  // can't buy a place on the leaderboard.
  cashScore(p) {
    if (!p.sim) return B.START_CASH;
    const loans = p.sim.loans.reduce((a, l) => a + l.principal, 0);
    return Math.round(p.sim.cash - loans - p.sim.unpaidBills - (p.sim.funding || 0));
  }

  ranked() {
    return Object.values(this.s.players).filter((p) => p.sim)
      .sort((a, b) => this.cashScore(b) - this.cashScore(a) || b.correct - a.correct || a.joinedAt - b.joinedAt);
  }

  ranks() {
    const m = {};
    this.ranked().forEach((p, i) => (m[p.id] = i + 1));
    return m;
  }

  leaderboard(n = 5) {
    return this.ranked().slice(0, n).map((p) => ({ nick: p.nick, score: this.cashScore(p), role: p.role, correct: p.correct, closed: !!(p.sim && p.sim.bankrupt), orders: p.sim && p.sim.history.length ? p.sim.history[p.sim.history.length - 1].orders : 0 }));
  }

  // ── the end: analyse the winner's balance sheet ──
  finish() {
    const s = this.s;
    const weeksPlayed = s.week;
    s.plannedWeeks = weeksPlayed;
    const ctx = { weeks: weeksPlayed, goal: this.goal() };
    const endings = {};
    for (const p of Object.values(s.players)) {
      if (!p.sim) continue;
      const id = classifyEnding(p.sim, ctx);
      p.endingId = id;
      endings[id] = (endings[id] || 0) + 1;
    }
    const ranked = this.ranked();
    const winner = ranked[0];
    let winState = winner ? winner.sim : this.newKitchen();
    const id = winner ? winner.endingId : 'stuck';
    if (id === 'scaled') winState = applyInvestorFunding(winState);
    if (winner) winner.sim = winState;
    const content = endingContent(id, winState, ctx);
    const comp = runGame({ weeks: weeksPlayed, seed: s.seed, strategy: balanced, schedule: s.schedule.slice(0, weeksPlayed) });
    const compContent = endingContent(comp.ending, comp.state, ctx);
    s.ending = {
      id, content,
      winner: winner ? { nick: winner.nick, role: winner.role, score: this.cashScore(winner), correct: winner.correct, answered: winner.answered, quizNet: winner.quizNet } : null,
      sheet: balanceSheet(winState),
      chart: chartSeries(winState),
      comparison: { id: comp.ending, title: compContent.title, theme: compContent.theme, sheet: balanceSheet(comp.state), history: chartSeries(comp.state) },
      endings,
      closed: Object.values(s.players).filter((p) => p.sim && p.sim.bankrupt).length,
      weeksPlayed,
    };
    this.clearTimers();
    s.clockEndsAt = null;
    this.setPhase('ending');
  }

  // ── views ──
  eventCard() {
    const s = this.s;
    if (!s.schedule || !s.week) return null;
    const ev = s.schedule[s.week - 1];
    const info = EVENT_INFO[ev.id];
    return { id: ev.id, headline: ev.headline, tone: info.tone, art: info.art, title: info.title || 'This week', effect: info.effect || null, bonus: ev.bonus ? { key: ev.bonus, ...BONUS_INFO[ev.bonus] } : null };
  }

  advisorView() {
    const a = this.s.advisors;
    if (!a) return null;
    return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, { name: v.name, role: v.role, emoji: v.emoji, line: v.line }]));
  }

  quizView(withAnswer) {
    const q = this.s.quiz;
    if (!q) return null;
    const v = { id: q.id, cat: q.cat, text: q.text, options: q.options };
    if (withAnswer) Object.assign(v, { correct: q.correct, why: q.why });
    return v;
  }

  counts() {
    const s = this.s;
    const active = this.activePlayers();
    const players = Object.keys(s.players).length;
    if (s.phase === 'question') return { done: active.filter((p) => s.answers[p.id]).length, total: active.length, players, label: 'answered' };
    if (s.phase === 'decide') {
      const keys = this.decisionKeys();
      const deciders = active.filter((p) => p.sim && !p.sim.bankrupt);
      return { done: deciders.filter((p) => s.choices[p.id] && keys.every((k) => s.choices[p.id][k])).length, total: deciders.length, players, label: 'locked in' };
    }
    return { done: 0, total: active.length, players, label: '' };
  }

  publicView() {
    const s = this.s;
    const showAnswer = s.phase === 'answer';
    return {
      phase: s.phase, week: s.week, kitchenName: s.settings.kitchenName, sound: s.settings.sound,
      qSeconds: s.settings.qSeconds, dSeconds: s.settings.dSeconds,
      remainingMs: this.remainingMs(), paused: s.pausedRemaining != null || s.clockPaused != null,
      clockMs: this.clockMs(), minutes: s.settings.minutes, goal: this.goal(), timeUp: s.clockEndsAt ? this.timeUp() : false,
      event: this.eventCard(), advisors: this.advisorView(),
      quiz: ['question', 'answer'].includes(s.phase) ? this.quizView(showAnswer) : null,
      answerStats: s.phase === 'answer' ? s.answerStats : null,
      decisions: s.week && s.schedule ? this.decisionKeys() : CORE,
      endedEarly: !!s.endedEarly && s.endedEarly === s.phase,
      ending: s.ending ? { title: s.ending.content.title, theme: s.ending.content.theme, winner: s.ending.winner && s.ending.winner.nick } : null,
    };
  }

  playerView(id) {
    const s = this.s;
    const p = s.players[id];
    if (!p) return null;
    const ranks = this.ranks();
    const sim = p.sim;
    const sheet = sim && s.phase === 'ending' ? balanceSheet(sim) : null;
    const m = p.endingId && META[p.endingId];
    return {
      id: p.id, nick: p.nick, role: p.role, roleInfo: ROLES[p.role],
      score: this.cashScore(p), cash: sim ? Math.round(sim.cash) : B.START_CASH,
      receivable: sim ? Math.round(receivableTotal(sim)) : 0, closed: !!(sim && sim.bankrupt), rescued: !!(sim && sim.emergencyUsed),
      rank: ranks[p.id] || null, of: Object.keys(ranks).length, streak: p.streak, correct: p.correct, answered: p.answered, quizNet: p.quizNet,
      answer: s.answers[p.id] ? s.answers[p.id].i : null,
      lastQuiz: p.lastQuiz && p.lastQuiz.week === s.week ? p.lastQuiz : null,
      choices: s.choices[p.id] || {}, lastChoice: p.lastChoice,
      last: s.phase === 'results' && p.last && p.last.week === s.week ? p.last : null,
      ending: s.phase === 'ending' && sim && m ? { id: p.endingId, title: m.title, theme: m.theme, tagline: m.tagline, sheet } : null,
      isWinner: !!(s.ending && s.ending.winner && ranks[p.id] === 1),
    };
  }

  hostView() {
    const s = this.s;
    const view = {
      ...this.publicView(),
      seed: s.seed, autoplay: this.autoplay, counts: this.counts(),
      plannedWeeks: s.plannedWeeks || this.estimateWeeks(),
      quiz: this.quizView(['answer', 'decide', 'results'].includes(s.phase)),
      answerStats: s.answerStats,
      leaderboard: this.leaderboard(5), podium: this.leaderboard(3),
      room: s.room, roomHistory: s.roomHistory, startCash: B.START_CASH,
      nicks: s.phase === 'setup' ? Object.values(s.players).slice(-36).map((p) => ({ id: p.id, nick: p.nick })) : null,
      players: Object.values(s.players).map((p) => ({ id: p.id, nick: p.nick, connected: !!p.connected, score: this.cashScore(p), closed: !!(p.sim && p.sim.bankrupt) })).sort((a, b) => a.nick.localeCompare(b.nick)),
      note: presenterNote(s.phase === 'setup' && Object.keys(s.players).length ? 'lobby' : s.phase, { week: s.week, quiz: s.quiz, room: s.room }),
    };
    if (s.phase === 'ending' && s.ending) view.ending = s.ending;
    return view;
  }

  // ── saving ──
  changed(save, light = false) {
    this.s.updatedAt = Date.now();
    if (save) this.save();
    else this.saveSoon();
    this.onChange({ light });
  }

  saveSoon() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.save(); }, 2000);
  }

  save() {
    if (!this.file) return;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.s));
      fs.renameSync(tmp, this.file);
    } catch (e) { console.error('Save failed:', e.message); }
  }
}

function chartSeries(sim) {
  return [{ week: 0, orders: null, cash: B.START_CASH, sales: 0, receivable: 0 }].concat(
    sim.history.map((l) => ({ week: l.week, orders: l.orders, cash: l.cash, sales: l.sales, receivable: l.receivable, event: l.event, rescue: l.rescue > 0 }))
  );
}

module.exports = { Game, chartSeries, CORE };
