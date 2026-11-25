// Small seeded random number generator (mulberry32).
// Same seed → same sequence, so games and tests are repeatable.

function makeRng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.int = (n) => Math.floor(rng() * n);
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.range = (lo, hi) => lo + rng() * (hi - lo);
  return rng;
}

// The random stream for a given week of a given game. The live game, the
// "smarter path" comparison and the advisor check all use this, so they see
// the exact same luck.
function weekRng(seed, week) {
  return makeRng((Number(seed) * 7919 + week * 104729) >>> 0);
}

module.exports = { makeRng, weekRng };
