const test = require('node:test');
const assert = require('node:assert/strict');
const { pickQuiz, STATIC, EVENT_Q } = require('../server/quiz');
const { buildSchedule } = require('../server/events');

test('every question has a valid correct answer and an explanation', () => {
  for (const q of [...STATIC, ...Object.values(EVENT_Q)]) {
    const [id, , text, options, correct, why] = q;
    assert.ok(text && why, id);
    assert.ok(options.length >= 2 && options.length <= 4, id);
    assert.ok(correct >= 0 && correct < options.length, id);
    assert.ok(!/NaN|undefined/.test(text + options.join() + why), id);
  }
});

test('no question repeats within a game, and categories vary', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const sched = buildSchedule(12, seed);
    const used = [];
    let lastCat = null, sameRun = 0;
    const room = { week: 1, kitchens: 10, discountCounts: { none: 2, d10: 5, d30: 3 }, topCash: [{ nick: 'A', cash: 9 }, { nick: 'B', cash: 8 }, { nick: 'C', cash: 7 }, { nick: 'D', cash: 6 }], cashDownShare: 0.8 };
    for (let w = 1; w <= 12; w++) {
      const q = pickQuiz({ week: w, seed, event: sched[w - 1], used, lastCat, room: w > 1 ? room : null });
      assert.ok(!used.includes(q.id), `seed ${seed}: ${q.id} repeated`);
      if (w === 1) assert.equal(q.id, 'payday');
      if (q.cat === lastCat) sameRun++;
      used.push(q.id);
      lastCat = q.cat;
      assert.ok(q.correct >= 0 && q.correct < q.options.length);
    }
    assert.ok(sameRun <= 4, `seed ${seed}: too many same-category runs`);
  }
});
