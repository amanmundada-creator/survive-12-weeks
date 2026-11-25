const test = require('node:test');
const assert = require('node:assert/strict');
const { pickQuiz, STATIC, EVENT_Q, build } = require('../server/quiz');
const { buildSchedule } = require('../server/events');
const { makeRng } = require('../server/rng');

test('every accounting question is well-formed', () => {
  const all = [...STATIC, ...Object.values(EVENT_Q)];
  assert.ok(STATIC.length >= 30, `big enough bank (${STATIC.length})`);
  const ids = new Set();
  for (const [id, , text, options, why] of all) {
    assert.ok(!ids.has(id), `duplicate id ${id}`);
    ids.add(id);
    assert.ok(text && why, id);
    assert.ok(options.length >= 2 && options.length <= 4, id);
    assert.equal(new Set(options).size, options.length, `${id}: duplicate options`);
    assert.ok(!/NaN|undefined/.test(text + options.join() + why), id);
  }
});

test('shuffling keeps the right answer marked correctly', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const rng = makeRng(seed);
    for (const q of [...STATIC, ...Object.values(EVENT_Q)]) {
      const b = build(q, rng);
      assert.equal(b.options[b.correct], q[3][0], `${q[0]} seed ${seed}`);
    }
  }
  // the right answer isn't always in the same spot
  const spots = new Set();
  for (let seed = 1; seed <= 50; seed++) spots.add(build(STATIC[1], makeRng(seed)).correct);
  assert.ok(spots.size >= 3);
});

test('no question repeats within a game; week 1 is the receivable question', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const sched = buildSchedule(12, seed);
    const used = [];
    let lastCat = null;
    for (let w = 1; w <= 12; w++) {
      const q = pickQuiz({ week: w, seed, event: sched[w - 1], used, lastCat });
      assert.ok(!used.includes(q.id), `seed ${seed}: ${q.id} repeated`);
      if (w === 1) assert.equal(q.id, 'payday');
      used.push(q.id);
      lastCat = q.cat;
    }
  }
});
