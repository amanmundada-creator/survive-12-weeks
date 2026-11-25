// Rehearsal crowd: simulated voters with different personalities.
const { DECISIONS } = require('./content');
const { randomNick } = require('./content');

const PERSONALITIES = {
  greedy: { discount: { d30: 5, d10: 3, none: 1 }, ads: { big: 5, small: 3, none: 1 }, stock: { heavy: 5, right: 3, lean: 1 }, staff: { add: 4, keep: 2 }, bonus: { take: 4, skip: 1 }, higher: 0.75 },
  cautious: { discount: { none: 5, d10: 3, d30: 1 }, ads: { none: 5, small: 3, big: 1 }, stock: { lean: 5, right: 3, heavy: 1 }, staff: { keep: 5, add: 1 }, bonus: { skip: 4, take: 1 }, higher: 0.4 },
  sensible: { discount: { d10: 5, none: 2, d30: 1 }, ads: { small: 5, none: 2, big: 1 }, stock: { right: 5, lean: 2, heavy: 1 }, staff: { keep: 3, add: 2 }, bonus: { skip: 2, take: 2 }, higher: 0.45 },
  random: null,
  contrarian: 'contrarian',
};
const TYPES = Object.keys(PERSONALITIES);

function weighted(weights, rng) {
  const entries = Object.entries(weights);
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let x = rng() * total;
  for (const [k, w] of entries) { x -= w; if (x <= 0) return k; }
  return entries[0][0];
}

function optionsFor(key) {
  return key === 'bonus' ? ['take', 'skip'] : DECISIONS[key].options.map((o) => o.v);
}

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
    this.lastPhase = null;
  }

  tick() {
    const g = this.game;
    const phase = g.s.phase;
    if (phase === this.lastPhase) return;
    this.lastPhase = phase;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    const rem = g.remainingMs() || 10000;
    if (phase === 'forecast') {
      for (const b of this.bots) {
        if (Math.random() < 0.06) continue; // a few always forget
        const t = setTimeout(() => {
          const q = g.s.question;
          if (!q) return;
          const pers = PERSONALITIES[b.type];
          if (q.id === 'cash') {
            const pHigher = pers && pers.higher != null ? pers.higher : 0.5;
            g.forecast(b.id, Math.random() < pHigher ? 'higher' : 'lower');
          } else g.forecast(b.id, q.options[Math.floor(Math.random() * q.options.length)].v);
        }, 500 + Math.random() * rem * 0.8);
        this.timers.push(t);
      }
    }
    if (phase === 'vote') {
      const keys = g.decisionKeys();
      for (const b of this.bots) {
        if (Math.random() < 0.05) continue;
        const t = setTimeout(() => {
          for (const k of keys) {
            const pers = PERSONALITIES[b.type];
            let v;
            if (pers === 'contrarian') {
              // picks whatever is least popular so far
              const counts = Object.fromEntries(optionsFor(k).map((o) => [o, 0]));
              Object.values(g.s.votes).forEach((x) => { if (x[k]) counts[x[k]]++; });
              v = Object.keys(counts).sort((a, c) => counts[a] - counts[c])[0];
            } else if (pers) v = weighted(pers[k], Math.random);
            else v = optionsFor(k)[Math.floor(Math.random() * optionsFor(k).length)];
            g.vote(b.id, k, v);
          }
          // some bots change their mind
          if (Math.random() < 0.15) {
            const k = keys[Math.floor(Math.random() * keys.length)];
            const opts = optionsFor(k);
            setTimeout(() => g.vote(b.id, k, opts[Math.floor(Math.random() * opts.length)]), 2000);
          }
        }, 800 + Math.random() * rem * 0.75);
        this.timers.push(t);
      }
    }
  }
}

module.exports = { BotCrowd };
