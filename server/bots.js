// Rehearsal crowd: simulated players, each running their own kitchen with a
// personality. They answer quiz questions (not always right, not always fast)
// and lock in decisions, so the "ends early when everyone is done" rule works.
const { DECISIONS, randomNick } = require('./content');

const PERSONALITIES = {
  greedy: { discount: { d30: 5, d10: 3, none: 1 }, ads: { big: 5, small: 3, none: 1 }, stock: { heavy: 5, right: 3, lean: 1 }, staff: { add: 4, keep: 2 }, bonus: { take: 4, skip: 1 }, smart: 0.45 },
  cautious: { discount: { none: 5, d10: 3, d30: 1 }, ads: { none: 5, small: 3, big: 1 }, stock: { lean: 5, right: 3, heavy: 1 }, staff: { keep: 5, add: 1 }, bonus: { skip: 4, take: 1 }, smart: 0.6 },
  sensible: { discount: { d10: 5, none: 2, d30: 1 }, ads: { small: 5, none: 2, big: 1 }, stock: { right: 5, lean: 2, heavy: 1 }, staff: { keep: 3, add: 2 }, bonus: { skip: 3, take: 1 }, smart: 0.75 },
  random: { smart: 0.3 },
};
const TYPES = Object.keys(PERSONALITIES);

function weighted(weights, rng) {
  const entries = Object.entries(weights);
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let x = rng() * total;
  for (const [k, w] of entries) { x -= w; if (x <= 0) return k; }
  return entries[0][0];
}
const optionsFor = (key) => (key === 'bonus' ? ['take', 'skip'] : DECISIONS[key].options.map((o) => o.v));

class BotCrowd {
  constructor(game, n = 60) {
    this.game = game;
    this.bots = [];
    this.timers = [];
    for (let i = 0; i < n; i++) {
      const id = 'bot-' + i;
      const p = game.join(id, randomNick());
      p.bot = true;
      p.connected = true;
      this.bots.push({ id, type: TYPES[i % TYPES.length] });
    }
    this.lastKey = null;
  }

  tick() {
    const g = this.game;
    const key = g.s.phase + g.s.week;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    const rem = g.remainingMs() || 10000;
    if (g.s.phase === 'question') {
      for (const b of this.bots) {
        const pers = PERSONALITIES[b.type];
        this.timers.push(setTimeout(() => {
          const q = g.s.quiz;
          if (!q) return;
          const pick = Math.random() < pers.smart ? q.correct : Math.floor(Math.random() * q.options.length);
          g.answer(b.id, pick);
        }, 700 + Math.random() * rem * 0.55));
      }
    }
    if (g.s.phase === 'decide') {
      for (const b of this.bots) {
        const pers = PERSONALITIES[b.type];
        this.timers.push(setTimeout(() => {
          const p = g.s.players[b.id];
          if (!p || !p.sim || p.sim.bankrupt) return;
          if (p.lastChoice && Math.random() < 0.3) return g.repeatLast(b.id);
          for (const k of g.decisionKeys()) {
            const v = pers[k] ? weighted(pers[k], Math.random) : optionsFor(k)[Math.floor(Math.random() * optionsFor(k).length)];
            g.choose(b.id, k, v);
          }
        }, 900 + Math.random() * rem * 0.55));
      }
    }
  }
}

module.exports = { BotCrowd };
