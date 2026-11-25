const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../server/balance');
const { initialState, simulateWeek, balanceSheet, receivableTotal } = require('../server/sim');
const { makeRng, weekRng } = require('../server/rng');
const { buildSchedule, NEGATIVE } = require('../server/events');
const { runGame } = require('../server/runner');
const { STRATEGIES } = require('../server/strategies');
const { classifyEnding, endingContent, ENDING_ORDER } = require('../server/endings');

const calm = { id: 'flavour' };
const base = { discount: 'none', ads: 'none', stock: 'right', staff: 'keep' };
const fixedRng = () => { const r = () => 0.5; r.int = () => 0; r.pick = (a) => a[0]; return r; }; // zero noise

function contribution(discount) {
  const price = B.MENU_PRICE * (1 - B.DISCOUNT[discount]);
  return price * (1 - B.COMMISSION_PCT) - B.PLATFORM_FEE - B.MENU_PRICE * B.FOOD_COST_PCT - B.PACKAGING;
}

test('unit economics: contribution per order at each discount level', () => {
  assert.ok(Math.abs(contribution('none') - 110.5) < 1);
  assert.ok(Math.abs(contribution('d10') - 84.25) < 1);
  assert.ok(Math.abs(contribution('d30') - 31.75) < 1);
});

test('simulateWeek does not change its input', () => {
  const s0 = initialState();
  const copy = JSON.stringify(s0);
  simulateWeek(s0, base, calm, fixedRng());
  assert.equal(JSON.stringify(s0), copy);
});

test('payout delay: this week’s sales arrive at the end of next week', () => {
  const s0 = initialState();
  const s1 = simulateWeek(s0, base, calm, fixedRng());
  const l1 = s1.history[0];
  assert.equal(l1.collected, 0, 'nothing collected in week 1');
  assert.ok(Math.abs(receivableTotal(s1) - l1.netPayout) < 1, 'week 1 payout is a receivable');
  assert.ok(s1.cash < s0.cash, 'cash falls in week 1 even though sales happened');
  const s2 = simulateWeek(s1, base, calm, fixedRng());
  assert.equal(s2.history[1].collected, l1.netPayout, 'week 1 payout collected in week 2');
});

test('settlement delay holds the payout one extra week', () => {
  const s1 = simulateWeek(initialState(), base, calm, fixedRng());
  const s2 = simulateWeek(s1, base, { id: 'settlement' }, fixedRng());
  assert.equal(s2.history[1].collected, 0, 'nothing arrives during the delay');
  const s3 = simulateWeek(s2, base, calm, fixedRng());
  const expected = s1.history[0].netPayout + s2.history[1].netPayout;
  assert.ok(Math.abs(s3.history[2].collected - expected) < 2, 'both payouts arrive the week after');
});

test('wastage: 60% of unsold stock is thrown away, 40% carries over', () => {
  const s0 = initialState();
  s0.invUnits = 0; s0.invValue = 0; s0.ownerCapital -= B.START_INVENTORY_VALUE; // empty shelf
  const s1 = simulateWeek(s0, { ...base, stock: 'heavy' }, calm, fixedRng());
  const l = s1.history[0];
  const bought = l.costs.ingredients / (B.MENU_PRICE * B.FOOD_COST_PCT);
  const unsold = bought - l.orders;
  assert.ok(unsold > 0);
  assert.ok(Math.abs(l.costs.wastage - unsold * 0.6 * B.MENU_PRICE * B.FOOD_COST_PCT) < 5);
  assert.ok(Math.abs(s1.invUnits - unsold * 0.4) < 0.01);
});

test('orders served never exceed kitchen capacity', () => {
  const s0 = initialState();
  const s1 = simulateWeek(s0, { discount: 'd30', ads: 'big', stock: 'heavy', staff: 'keep' }, { id: 'viral' }, fixedRng());
  assert.ok(s1.history[0].orders <= B.START_COOKS * B.CAPACITY_PER_COOK);
  assert.ok(s1.history[0].unserved > 0);
  assert.ok(s1.rating < s0.rating, 'turning customers away hurts the rating');
});

test('emergency loan the first time cash goes negative, bankruptcy the second', () => {
  let s = initialState();
  s.week = 6; s.cash = 10000;
  s = simulateWeek(s, { ...base, ads: 'big' }, calm, fixedRng());
  assert.equal(s.emergencyUsed, true);
  assert.equal(s.bankrupt, false);
  assert.ok(s.cash > 0);
  assert.ok(s.loans.some((l) => l.kind === 'emergency'));
  s.cash = 5000;
  s = simulateWeek(s, { ...base, ads: 'big' }, calm, fixedRng());
  assert.equal(s.bankrupt, true);
  assert.equal(s.cash, 0);
  assert.ok(s.unpaidBills > 0);
  // (this test edits cash by hand, so it doesn't check the balance sheet;
  //  the random-games test below does that for real games)
});

test('the kitchen can never close before week 5', () => {
  let s = initialState();
  s.cash = 1000;
  for (let w = 1; w < B.EARLIEST_CLOSURE_WEEK; w++) {
    s.cash = Math.min(s.cash, 1000);
    s = simulateWeek(s, { discount: 'd30', ads: 'big', stock: 'heavy', staff: 'add' }, calm, fixedRng());
    assert.equal(s.bankrupt, false, `alive in week ${w}`);
  }
});

test('events change the numbers', () => {
  const s0 = initialState();
  const rival = simulateWeek(s0, base, { id: 'rival' }, fixedRng());
  const plain = simulateWeek(s0, base, calm, fixedRng());
  assert.ok(rival.history[0].demand < plain.history[0].demand);
  const fest = simulateWeek(s0, base, { id: 'festival' }, fixedRng());
  assert.ok(fest.history[0].demand > plain.history[0].demand * 1.2);
  const rent = simulateWeek(s0, base, { id: 'rentHike' }, fixedRng());
  assert.equal(rent.history[0].costs.rent, Math.round(B.RENT * 1.15));
  const refund = simulateWeek(s0, base, { id: 'refund' }, fixedRng());
  assert.ok(refund.history[0].netPayout < plain.history[0].netPayout);
  const hike = simulateWeek(s0, base, { id: 'supplierHike' }, fixedRng());
  assert.equal(hike.foodHikeWeeks, 1);
  const loan = simulateWeek(s0, { ...base, bonus: 'take' }, { id: 'flavour', bonus: 'loan' }, fixedRng());
  assert.equal(loan.loans[0].principal, B.BRIDGE_LOAN_AMOUNT);
  assert.equal(balanceSheet(loan).liabilities.bridgeLoan, B.BRIDGE_LOAN_AMOUNT);
});

test('balance sheet balances at week 0 and across thousands of random games', () => {
  assert.ok(balanceSheet(initialState()).balanced);
  const strategies = Object.values(STRATEGIES);
  let n = 0;
  for (let seed = 1; seed <= 600; seed++) {
    for (const weeks of [6, 8, 12]) {
      const strat = strategies[seed % strategies.length];
      const sched = buildSchedule(weeks, seed);
      const rng = makeRng(seed);
      let s = initialState({ weeks });
      for (let w = 1; w <= weeks && !s.bankrupt; w++) {
        s = simulateWeek(s, strat(s, sched[w - 1], rng), sched[w - 1], weekRng(seed, w));
        const bs = balanceSheet(s);
        assert.ok(bs.balanced, `seed ${seed} week ${w}: ${bs.totalAssets} vs ${bs.totalLiabilities + bs.totalEquity}`);
        n++;
      }
    }
  }
  assert.ok(n > 5000);
});

test('same seed, same game', () => {
  const a = runGame({ weeks: 12, seed: 42, strategy: STRATEGIES.random });
  const b = runGame({ weeks: 12, seed: 42, strategy: STRATEGIES.random });
  assert.deepEqual(a.state.history, b.state.history);
});

test('event schedule is fair', () => {
  for (let seed = 1; seed <= 500; seed++) {
    for (const weeks of [6, 8, 12]) {
      const sch = buildSchedule(weeks, seed);
      assert.equal(sch.length, weeks);
      for (let i = 1; i < sch.length; i++) {
        assert.ok(!(NEGATIVE.has(sch[i].id) && NEGATIVE.has(sch[i - 1].id)), `two bad weeks in a row, seed ${seed}`);
      }
      const third = weeks / 3;
      const trap = sch.findIndex((e) => e.id === 'settlement') + 1;
      assert.ok(trap > third - 1 && trap <= Math.ceil(2 * third), `cash trap in the middle third (week ${trap} of ${weeks})`);
      assert.ok(sch.some((e) => e.bonus === 'loan'));
      assert.equal(sch[0].id, 'flavour');
    }
  }
});

// ── Ending coverage: a crafted decision sequence for each of the ten endings ──
const { CRAFTED } = require('../server/strategies');

for (const id of ENDING_ORDER) {
  test(`ending reachable and balanced: ${id}`, () => {
    let found = null;
    for (let seed = 1; seed <= 400 && !found; seed++) {
      const r = runGame({ weeks: 12, seed, strategy: CRAFTED[id] });
      if (r.ending === id) found = r;
    }
    assert.ok(found, `no seed produced ${id}`);
    assert.ok(balanceSheet(found.state).balanced, 'balance sheet balances');
    const c = endingContent(id, found.state, { goal: 1150 });
    assert.ok(c.title && c.callouts.length === 3 && c.cfo.length === 2);
    assert.ok(!c.callouts.some((x) => /NaN|undefined/.test(x.text)), 'callouts have real numbers');
  });
}

test('ending rules are ordered as documented', () => {
  const s = initialState();
  s.history = [{ orders: 500, decisions: { discount: 'd30' } }, { orders: 900, decisions: { discount: 'd30' } }];
  s.bankrupt = true; s.flags.tookBridgeLoan = true;
  assert.equal(classifyEnding(s, { goal: 1000 }), 'discountSpiral', '30% discount rule comes before the loan rule');
  s.history.forEach((h) => (h.decisions.discount = 'd10'));
  assert.equal(classifyEnding(s, { goal: 1000 }), 'debtSpiral');
  s.bankrupt = false; s.flags.tookBridgeLoan = false; s.history[1].orders = 1200;
  assert.equal(classifyEnding(s, { goal: 1000 }), 'scaled');
  s.flags.tookBridgeLoan = true;
  assert.notEqual(classifyEnding(s, { goal: 1000 }), 'scaled', 'no investor ending on borrowed money');
  s.flags.tookBridgeLoan = false; s.retained = -150000;
  assert.notEqual(classifyEnding(s, { goal: 1000 }), 'scaled', 'no investor ending with a big loss');
  s.retained = 0;
  s.emergencyUsed = true;
  assert.equal(classifyEnding(s, { goal: 1000 }), 'fumes', 'no investor ending if you needed a rescue loan');
});
