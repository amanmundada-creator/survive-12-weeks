// The live game: phases, timers, votes, scores. The server owns this state;
// screens only display it.
const fs = require('fs');
const path = require('path');
const B = require('./balance');
const { initialState, simulateWeek, balanceSheet, runwayWeeks, receivableTotal, capacity } = require('./sim');
const { buildSchedule, EVENT_INFO, BONUS_INFO } = require('./events');
const { weekRng, makeRng } = require('./rng');
const { classifyEnding, endingContent } = require('./endings');
const { runGame, goalFor } = require('./runner');
const { balanced } = require('./strategies');
const { pickQuestion, resolveQuestion, questionNote } = require('./forecasts');
const { randomNick, ROLES, DECISIONS, DEFAULT_CHOICE, advisorAdvice, presenterNote } = require('./content');

const ROLE_KEYS = Object.keys(ROLES);
const CORE = ['discount', 'ads', 'stock', 'staff'];
const BRIEF_MS = 10000;
const FORECAST_MS = 15000;
const AUTO = { split: 7000, reveal: 27000, leaderboard: 8000 };

class Game {
  constructor({ config, file, onChange }) {
    this.config = config;
    this.file = file;
    this.onChange = onChange || (() => {});
    this.timer = null;
    this.autoplay = false;
    this.s = null;
    if (file && fs.existsSync(file)) {
      try {
        this.s = JSON.parse(fs.readFileSync(file, 'utf8'));
        Object.values(this.s.players).forEach((p) => (p.connected = false));
        this.resumeTimer();
      } catch (e) {
        console.error('Could not read saved game, starting fresh:', e.message);
        this.s = null;
      }
    }
    if (!this.s) this.reset();
  }

  // ── lifecycle ──
  reset(keepPlayers = false, newSeed) {
    const c = this.config;
    const old = this.s;
    const settings = old ? old.settings : { weeks: c.defaultWeeks, kitchenName: c.kitchenName, timer: c.voteSeconds, sound: c.sound };
    const players = keepPlayers && old ? old.players : {};
    Object.values(players).forEach((p) => Object.assign(p, { score: 0, streak: 0, correct: 0, forecasts: 0, last: null }));
    this.s = {
      seed: newSeed != null ? newSeed : (old && keepPlayers ? old.seed + 1 : c.seed || Math.floor(Math.random() * 1e6)),
      phase: 'setup',
      settings,
      week: 0,
      sim: null,
      schedule: null,
      players,
      votes: {},
      forecasts: {},
      advisors: null,
      question: null,
      qHistory: [],
      split: null,
      result: null,
      crowd: { right: 0, total: 0 },
      advisorStats: { growth: { right: 0, trusted: 0 }, ops: { right: 0, trusted: 0 }, finance: { right: 0, trusted: 0 } },
      ending: null,
      phaseEndsAt: null,
      pausedRemaining: null,
      updatedAt: Date.now(),
    };
    this.clearTimer();
    this.changed(true);
  }

  goal() { return this.config.goals && this.config.goals[this.s.settings.weeks] ? this.config.goals[this.s.settings.weeks] : goalFor(this.s.settings.weeks); }

  setSettings(p) {
    if (this.s.phase !== 'setup') return;
    const st = this.s.settings;
    if ([6, 8, 12].includes(Number(p.weeks))) st.weeks = Number(p.weeks);
    if (typeof p.kitchenName === 'string' && p.kitchenName.trim()) st.kitchenName = p.kitchenName.trim().slice(0, 40);
    if (Number(p.timer) >= 15 && Number(p.timer) <= 120) st.timer = Number(p.timer);
    if (typeof p.sound === 'boolean') st.sound = p.sound;
    this.changed(false);
  }

  start() {
    if (this.s.phase !== 'setup') return;
    const weeks = this.s.settings.weeks;
    this.s.sim = initialState({ weeks });
    this.s.schedule = buildSchedule(weeks, this.s.seed);
    this.beginWeek(1);
  }

  beginWeek(w) {
    const s = this.s;
    s.week = w;
    s.votes = {};
    s.forecasts = {};
    s.split = null;
    s.result = null;
    const ev = s.schedule[w - 1];
    s.advisors = advisorAdvice(s.sim, ev, weekRng(s.seed + 99, w), this.goal());
    s.qHistory = s.qHistory || [];
    s.question = pickQuestion(s.sim, ev, w, s.seed, s.qHistory);
    s.qHistory.push(s.question.id);
    this.setPhase('brief', BRIEF_MS);
  }

  // ── phases and timers ──
  setPhase(phase, ms) {
    this.clearTimer();
    this.s.phase = phase;
    this.s.pausedRemaining = null;
    if (!ms && this.autoplay && AUTO[phase]) ms = AUTO[phase];
    this.s.phaseEndsAt = ms ? Date.now() + ms : null;
    if (ms) this.timer = setTimeout(() => this.next(), ms);
    this.changed(true);
  }

  clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; }

  resumeTimer() {
    const s = this.s;
    if (s.pausedRemaining != null) return; // stays paused
    if (s.phaseEndsAt) {
      const left = Math.max(1500, s.phaseEndsAt - (s.updatedAt || Date.now()));
      s.phaseEndsAt = Date.now() + left;
      this.timer = setTimeout(() => this.next(), left);
    }
  }

  remainingMs() {
    if (this.s.pausedRemaining != null) return this.s.pausedRemaining;
    return this.s.phaseEndsAt ? Math.max(0, this.s.phaseEndsAt - Date.now()) : null;
  }

  pause() {
    const s = this.s;
    if (s.pausedRemaining != null) {
      const left = s.pausedRemaining;
      s.pausedRemaining = null;
      s.phaseEndsAt = Date.now() + left;
      this.timer = setTimeout(() => this.next(), left);
    } else if (s.phaseEndsAt) {
      s.pausedRemaining = Math.max(0, s.phaseEndsAt - Date.now());
      this.clearTimer();
    }
    this.changed(false);
  }

  addTime(ms = 15000) {
    const s = this.s;
    if (s.pausedRemaining != null) s.pausedRemaining += ms;
    else if (s.phaseEndsAt) {
      s.phaseEndsAt += ms;
      this.clearTimer();
      this.timer = setTimeout(() => this.next(), s.phaseEndsAt - Date.now());
    }
    this.changed(false);
  }

  setAutoplay(on) {
    this.autoplay = !!on;
    const p = this.s.phase;
    if (this.autoplay && AUTO[p] && !this.s.phaseEndsAt) this.setPhase(p, AUTO[p]);
    else this.changed(false);
  }

  next() {
    const s = this.s;
    switch (s.phase) {
      case 'setup': return this.start();
      case 'brief': return this.setPhase('forecast', FORECAST_MS);
      case 'forecast': return this.setPhase('vote', s.settings.timer * 1000);
      case 'vote': return this.lock();
      case 'split': return this.setPhase('reveal');
      case 'reveal': this.scorePlayers(); return this.setPhase('leaderboard');
      case 'leaderboard': {
        if (s.sim.bankrupt || s.week >= s.settings.weeks) return this.finish();
        return this.beginWeek(s.week + 1);
      }
      default: return undefined;
    }
  }

  decisionKeys() {
    const ev = this.s.schedule[this.s.week - 1];
    return ev.bonus ? [...CORE, 'bonus'] : CORE.slice();
  }

  // ── players ──
  join(deviceId, nick) {
    const s = this.s;
    let p = s.players[deviceId];
    if (!p) {
      const counts = { growth: 0, ops: 0, finance: 0 };
      Object.values(s.players).forEach((x) => counts[x.role]++);
      const min = Math.min(...Object.values(counts));
      const options = ROLE_KEYS.filter((r) => counts[r] === min);
      p = {
        id: deviceId,
        nick: (nick && String(nick).slice(0, 24)) || randomNick(),
        role: options[Math.floor(Math.random() * options.length)],
        score: 0, streak: 0, correct: 0, forecasts: 0, last: null, joinedAt: Date.now(), bot: false,
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

  disconnect(id) { const p = this.s.players[id]; if (p) { p.connected = false; this.changed(false, true); } }

  forecast(id, v) {
    if (this.s.phase !== 'forecast' && this.s.phase !== 'brief') return false;
    const q = this.s.question;
    if (!this.s.players[id] || !q || !q.options.some((o) => o.v === v)) return false;
    this.s.forecasts[id] = v;
    this.changed(false, true);
    return true;
  }

  vote(id, key, v) {
    const s = this.s;
    if (s.phase !== 'vote' || !s.players[id]) return false;
    if (!this.decisionKeys().includes(key)) return false;
    const opts = key === 'bonus' ? ['take', 'skip'] : DECISIONS[key].options.map((o) => o.v);
    if (!opts.includes(v)) return false;
    if (!s.votes[id]) s.votes[id] = {};
    s.votes[id][key] = v;
    this.changed(false, true);
    return true;
  }

  // ── lock votes, tally, coin flips ──
  lock() {
    const s = this.s;
    const keys = this.decisionKeys();
    const rng = makeRng(s.seed * 1009 + s.week * 17);
    const split = {};
    const chosen = { ...DEFAULT_CHOICE };
    for (const k of keys) {
      const opts = k === 'bonus' ? ['take', 'skip'] : DECISIONS[k].options.map((o) => o.v);
      const counts = Object.fromEntries(opts.map((o) => [o, 0]));
      Object.values(s.votes).forEach((v) => { if (v[k] && counts[v[k]] !== undefined) counts[v[k]]++; });
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      const max = Math.max(...Object.values(counts));
      const top = opts.filter((o) => counts[o] === max);
      let winner;
      let tie = null;
      if (total === 0) winner = DEFAULT_CHOICE[k];
      else if (top.length === 1) winner = top[0];
      else { winner = top[Math.floor(rng() * top.length)]; tie = top; }
      chosen[k] = winner;
      split[k] = { counts, total, winner, tie };
    }
    s.split = { keys, split, chosen, voters: Object.keys(s.votes).length };
    this.resolveWeek(chosen);
    this.setPhase('split');
  }

  resolveWeek(chosen) {
    const s = this.s;
    const w = s.week;
    const ev = s.schedule[w - 1];
    const before = s.sim;
    const rng = () => weekRng(s.seed, w);
    const after = simulateWeek(before, chosen, ev, rng());
    const line = after.history[after.history.length - 1];
    const cashUp = line.cashBeforeRescue >= line.startCash;
    const qr = resolveQuestion(s.question, line);
    const answer = qr.answer;

    // advisor check: whose advice would have done best this week?
    const scoreOf = (st) => {
      const l = st.history[st.history.length - 1];
      return (l.cashBeforeRescue - l.startCash - l.loanIn) + (l.receivable - (before.history.length ? before.history[before.history.length - 1].receivable : 0)) + l.orders * 40 - (st.bankrupt ? 1e7 : 0);
    };
    const advScores = {};
    for (const k of Object.keys(s.advisors)) advScores[k] = scoreOf(simulateWeek(before, s.advisors[k].rec, ev, rng()));
    const bestAdvisor = Object.keys(advScores).sort((a, b) => advScores[b] - advScores[a])[0];
    s.advisorStats[bestAdvisor].right++;
    const matchCount = (rec) => CORE.filter((k) => rec[k] === chosen[k]).length;
    const trusted = Object.keys(s.advisors).sort((a, b) => matchCount(s.advisors[b].rec) - matchCount(s.advisors[a].rec))[0];
    s.advisorStats[trusted].trusted++;

    // crowd forecast
    const fv = Object.values(s.forecasts);
    const forecastSplit = Object.fromEntries(s.question.options.map((o) => [o.v, fv.filter((x) => x === o.v).length]));
    let majorityRight = null;
    if (fv.length) {
      const max = Math.max(...Object.values(forecastSplit));
      const tops = Object.keys(forecastSplit).filter((k) => forecastSplit[k] === max);
      const maj = tops.length === 1 ? tops[0] : null;
      majorityRight = maj === answer;
      s.crowd.total++;
      if (majorityRight) s.crowd.right++;
    }

    s.result = {
      week: w, line, answer, answerLabel: qr.answerLabel, why: qr.why, question: s.question, cashUp, chosen, bestAdvisor, trusted, advScores,
      forecastSplit,
      majorityRight,
      cfoPick: balanced(before, ev),
      prevOrders: before.history.length ? before.history[before.history.length - 1].orders : null,
    };
    s.prevKitchen = this.kitchenSummary(before); // shown until the reveal lands, so nothing is spoiled
    s.sim = after;
  }

  scorePlayers() {
    const s = this.s;
    const r = s.result;
    if (!r || r.scored) return;
    r.scored = true;
    const l = r.line;
    const ordersUp = r.prevOrders == null ? l.orders > B.START_AWARENESS : l.orders > r.prevOrders;
    const lowWaste = l.costs.wastage <= Math.max(3000, l.costs.ingredients * 0.06) && l.unserved <= l.demand * 0.03;
    const cashUp = r.cashUp;
    const roleWin = { growth: ordersUp, ops: lowWaste, finance: cashUp };
    r.roleWin = roleWin;
    for (const p of Object.values(s.players)) {
      let pts = 0;
      const parts = [];
      const f = s.forecasts[p.id];
      let fRight = null;
      if (f) {
        p.forecasts++;
        fRight = f === r.answer;
        if (fRight) {
          p.streak++;
          p.correct++;
          const bonus = 20 * Math.min(5, p.streak - 1);
          pts += 100 + bonus;
          parts.push(`Prediction right +100${bonus ? ` · streak +${bonus}` : ''}`);
        } else { p.streak = 0; parts.push('Prediction wrong +0'); }
      } else p.streak = 0;
      const v = s.votes[p.id] || {};
      if (Object.keys(v).length) { pts += 10; parts.push('Voted +10'); }
      const smart = CORE.filter((k) => v[k] && v[k] === r.cfoPick[k]).length;
      if (smart) { pts += smart * 15; parts.push(`Matched the CFO on ${smart} +${smart * 15}`); }
      if (roleWin[p.role] && Object.keys(v).length) { pts += 30; parts.push(`${ROLES[p.role].name} bonus +30`); }
      p.score += pts;
      // the one-line "you vs the room" message
      let vsRoom = null;
      const differ = CORE.find((k) => v[k] && v[k] !== r.chosen[k]);
      const label = (k, val) => DECISIONS[k].options.find((o) => o.v === val).label;
      if (differ) vsRoom = `You voted “${label(differ, v[differ])}” for ${DECISIONS[differ].title.toLowerCase()}. The room went “${label(differ, r.chosen[differ])}”.`;
      else if (Object.keys(v).length) vsRoom = 'You were with the room on every decision.';
      else vsRoom = 'You didn’t vote this week. The room decided without you!';
      const fOpt = f && r.question.options.find((o) => o.v === f);
      p.last = { week: r.week, pts, parts, forecast: f || null, forecastLabel: fOpt ? fOpt.label : null, answerLabel: r.answerLabel, why: r.why, fRight, vsRoom };
    }
  }

  finish() {
    const s = this.s;
    const ctx = { weeks: s.settings.weeks, goal: this.goal() };
    const id = classifyEnding(s.sim, ctx);
    let finalState = s.sim;
    if (id === 'scaled') finalState = require('./sim').applyInvestorFunding(s.sim);
    s.sim = finalState;
    const content = endingContent(id, finalState, ctx);
    const comp = runGame({ weeks: s.settings.weeks, seed: s.seed, strategy: balanced, schedule: s.schedule });
    const compContent = endingContent(comp.ending, comp.state, ctx);
    s.ending = {
      id, content, sheet: balanceSheet(finalState),
      comparison: { id: comp.ending, title: compContent.title, theme: compContent.theme, sheet: balanceSheet(comp.state), history: chartSeries(comp.state), lastOrders: comp.state.history.length ? comp.state.history[comp.state.history.length - 1].orders : 0 },
    };
    this.setPhase('ending');
  }

  // ── views ──
  leaderboard(n = 5) {
    return Object.values(this.s.players)
      .sort((a, b) => b.score - a.score || b.correct - a.correct || a.joinedAt - b.joinedAt)
      .slice(0, n)
      .map((p) => ({ nick: p.nick, score: p.score, role: p.role, correct: p.correct }));
  }

  ranks() {
    const list = Object.values(this.s.players).sort((a, b) => b.score - a.score || b.correct - a.correct || a.joinedAt - b.joinedAt);
    const m = {};
    list.forEach((p, i) => (m[p.id] = i + 1));
    return m;
  }

  counts() {
    const s = this.s;
    const players = Object.values(s.players);
    const total = players.filter((p) => p.connected || s.votes[p.id] || s.forecasts[p.id]).length;
    const voted = s.phase === 'forecast' || s.phase === 'brief' ? Object.keys(s.forecasts).length : Object.keys(s.votes).length;
    return { voted, total: Math.max(total, voted), players: players.length };
  }

  kitchenSummary(sim = this.s.sim) {
    if (!sim) return null;
    const last = sim.history[sim.history.length - 1];
    const runway = runwayWeeks(sim);
    return {
      cash: Math.round(sim.cash),
      receivable: Math.round(receivableTotal(sim)),
      orders: last ? last.orders : 0,
      rating: +sim.rating.toFixed(1),
      cooks: sim.cooks,
      capacity: sim.cooks * B.CAPACITY_PER_COOK,
      runway: Number.isFinite(runway) ? +runway.toFixed(1) : null,
      emergency: sim.emergencyUsed,
      bankrupt: sim.bankrupt,
    };
  }

  eventCard() {
    const s = this.s;
    if (!s.schedule || !s.week) return null;
    const ev = s.schedule[s.week - 1];
    const info = EVENT_INFO[ev.id];
    return {
      id: ev.id, headline: ev.headline, tone: info.tone, art: info.art, title: info.title || 'This week', effect: info.effect || null,
      bonus: ev.bonus ? { key: ev.bonus, ...BONUS_INFO[ev.bonus] } : null, demoDay: !!ev.demoDay,
    };
  }

  advisorView() {
    const a = this.s.advisors;
    if (!a) return null;
    return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, { name: v.name, role: v.role, emoji: v.emoji, line: v.line }]));
  }

  publicView() {
    const s = this.s;
    return {
      phase: s.phase,
      week: s.week,
      weeks: s.settings.weeks,
      kitchenName: s.settings.kitchenName,
      sound: s.settings.sound,
      timer: s.settings.timer,
      remainingMs: this.remainingMs(),
      paused: s.pausedRemaining != null,
      goal: this.goal(),
      event: this.eventCard(),
      advisors: this.advisorView(),
      question: s.question && s.week ? { id: s.question.id, tag: s.question.tag, text: s.question.text, options: s.question.options } : null,
      decisions: s.week && s.schedule ? this.decisionKeys() : CORE,
      endingTitle: s.ending ? s.ending.content.title : null,
      endingTheme: s.ending ? s.ending.content.theme : null,
      endingTagline: s.ending ? s.ending.content.tagline : null,
      cash: s.sim ? Math.round(s.sim.cash) : B.START_CASH,
    };
  }

  playerView(id) {
    const s = this.s;
    const p = s.players[id];
    if (!p) return null;
    const ranks = this.ranks();
    return {
      id: p.id, nick: p.nick, role: p.role, roleInfo: ROLES[p.role], score: p.score, streak: p.streak,
      rank: ranks[p.id], of: Object.keys(s.players).length,
      forecast: s.forecasts[p.id] || null,
      votes: s.votes[p.id] || {},
      last: (s.phase === 'leaderboard' || s.phase === 'ending') && p.last && p.last.week === s.week ? p.last : null,
      correct: p.correct, forecasts: p.forecasts,
    };
  }

  hostView() {
    const s = this.s;
    const pub = this.publicView();
    const notesCtx = { week: s.week, weeks: s.settings.weeks, line: s.result && s.result.line, event: s.schedule && s.week ? s.schedule[s.week - 1] : null, sim: s.sim };
    const view = {
      ...pub,
      seed: s.seed,
      autoplay: this.autoplay,
      counts: this.counts(),
      kitchen: ['split', 'reveal'].includes(s.phase) && s.prevKitchen ? s.prevKitchen : this.kitchenSummary(),
      kitchenAfter: this.kitchenSummary(),
      chart: s.sim ? chartSeries(s.sim) : [],
      note: s.phase === 'forecast' && s.question ? `Prediction: “${s.question.tag}”. ${questionNote(s.question.id)}` : presenterNote(s.phase === 'setup' && Object.keys(s.players).length ? 'lobby' : s.phase, notesCtx),
      leaderboard: this.leaderboard(5),
      podium: this.leaderboard(3),
      crowd: s.crowd,
      advisorStats: s.advisorStats,
      startCash: B.START_CASH,
      nicks: s.phase === 'setup' ? Object.values(s.players).slice(-36).map((p) => p.nick) : null,
    };
    if (['split', 'reveal', 'leaderboard', 'ending'].includes(s.phase) && s.split) view.split = s.split;
    if (['reveal', 'leaderboard', 'ending'].includes(s.phase) && s.result) {
      const r = s.result;
      view.result = { week: r.week, line: r.line, answer: r.answer, answerLabel: r.answerLabel, why: r.why, question: r.question, bestAdvisor: r.bestAdvisor, trusted: r.trusted, forecastSplit: r.forecastSplit, majorityRight: r.majorityRight, roleWin: r.roleWin || null };
    }
    if (s.phase === 'ending' && s.ending) view.ending = { ...s.ending, stats: this.endingStats() };
    return view;
  }

  endingStats() {
    const s = this.s;
    const ps = Object.values(s.players);
    const forecasts = ps.reduce((a, p) => a + p.forecasts, 0);
    const correct = ps.reduce((a, p) => a + p.correct, 0);
    const adv = s.advisorStats;
    const mostTrusted = Object.keys(adv).sort((a, b) => adv[b].trusted - adv[a].trusted)[0];
    const mostRight = Object.keys(adv).sort((a, b) => adv[b].right - adv[a].right)[0];
    return {
      roomAccuracy: forecasts ? correct / forecasts : null,
      majorityAccuracy: s.crowd.total ? s.crowd.right / s.crowd.total : null,
      mostTrusted, mostRight, advisorStats: adv,
      names: { growth: 'Rocket Rhea', ops: 'Steady Sam', finance: 'Penny Priya' },
    };
  }

  // ── saving ──
  changed(save, light = false) {
    this.s.updatedAt = Date.now();
    if (save) this.save();
    else this.saveSoon();
    this.onChange({ light });
  }

  // votes and joins are saved within 2 seconds, so a crash loses almost nothing
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
