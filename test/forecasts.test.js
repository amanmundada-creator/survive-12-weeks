const test = require('node:test');
const assert = require('node:assert/strict');
const { initialState, simulateWeek } = require('../server/sim');
const { buildSchedule } = require('../server/events');
const { weekRng, makeRng } = require('../server/rng');
const { STRATEGIES } = require('../server/strategies');
const { pickQuestion, resolveQuestion } = require('../server/forecasts');

test('prediction questions change week to week and always resolve to a real option', () => {
  const strategies = Object.values(STRATEGIES);
  const seen = new Set();
  for (let seed = 1; seed <= 300; seed++) {
    for (const weeks of [6, 8, 12]) {
      const sched = buildSchedule(weeks, seed);
      const rng = makeRng(seed);
      const strat = strategies[seed % strategies.length];
      let s = initialState({ weeks });
      const hist = [];
      for (let w = 1; w <= weeks && !s.bankrupt; w++) {
        const ev = sched[w - 1];
        const q = pickQuestion(s, ev, w, seed, hist);
        hist.push(q.id);
        seen.add(q.id);
        assert.ok(q.text && q.options.length >= 2 && q.options.length <= 4, `question ${q.id}`);
        assert.ok(!/NaN|undefined/.test(q.text + JSON.stringify(q.options)), `clean labels: ${q.id}`);
        s = simulateWeek(s, strat(s, ev, rng), ev, weekRng(seed, w));
        const r = resolveQuestion(q, s.history[s.history.length - 1]);
        assert.ok(q.options.some((o) => o.v === r.answer), `${q.id} answer ${r.answer} is an option`);
        assert.ok(r.why && !/NaN|undefined/.test(r.why), `${q.id} has an explanation`);
        if (w === 1) assert.equal(q.id, 'cash', 'week 1 asks the cash question');
        if (ev.id === 'settlement') assert.equal(q.id, 'cash', 'payout-delay week asks the cash question');
      }
      for (let i = 1; i < hist.length; i++) if (hist[i] !== 'cash') assert.notEqual(hist[i], hist[i - 1], `no repeat in a row (seed ${seed})`);
      if (weeks === 12 && hist.length === 12) assert.ok(new Set(hist).size >= 5, `variety in a 12-week game: ${hist.join(',')}`);
    }
  }
  assert.ok(seen.size >= 8, 'most question types get used: ' + [...seen].join(','));
});
