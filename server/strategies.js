// Fixed playing strategies, used by the balance script, the
// "same kitchen, different choices" comparison and the bots.
const B = require('./balance');
const { expectedDemand, capacity } = require('./sim');

const OPTIONS = {
  discount: ['none', 'd10', 'd30'],
  ads: ['none', 'small', 'big'],
  stock: ['lean', 'right', 'heavy'],
  staff: ['keep', 'add'],
  bonus: ['take', 'skip'],
};

// The "smart CFO" path: modest discount, steady small ads, right-sized
// stock, hire only when the kitchen is actually full, avoid debt.
function balanced(state, event) {
  const d = { discount: 'd10', ads: 'small', stock: 'right', staff: 'keep', bonus: 'skip' };
  const fixedWeek = B.RENT * state.rentMult + B.BASE_STAFF + B.UTILITIES + Math.max(0, state.cooks - B.START_COOKS) * B.EXTRA_COOK;
  if (state.cash < fixedWeek * 1.5) { d.ads = 'none'; }
  // A payout delay was announced: protect cash this week.
  if (event && event.id === 'settlement') { d.ads = 'none'; d.stock = 'lean'; }
  // hire for lasting demand, not for a one-off festival or viral spike
  const want = expectedDemand(state, d, { id: 'flavour' });
  const cap = (state.cooks) * B.CAPACITY_PER_COOK;
  if (want > cap * 0.95 && state.cash > fixedWeek * 3 && !(event && event.id === 'settlement') && state.cooks < B.MAX_COOKS) d.staff = 'add';
  if (event && event.bonus === 'supplier' && state.cash > 300000) d.bonus = 'take';
  if (event && event.bonus === 'price') d.bonus = 'take';
  return d;
}

function aggressive(state, event) {
  return { discount: 'd30', ads: 'big', stock: 'heavy', staff: 'add', bonus: 'take' };
}

function safe(state, event) {
  return { discount: 'none', ads: 'none', stock: 'lean', staff: 'keep', bonus: 'skip' };
}

function random(state, event, rng) {
  const d = {};
  for (const k of Object.keys(OPTIONS)) d[k] = rng.pick(OPTIONS[k]);
  return d;
}

// "Growth-pushing but not insane": a common room behaviour.
function growthy(state, event, rng) {
  return { discount: rng() < 0.6 ? 'd30' : 'd10', ads: rng() < 0.5 ? 'big' : 'small', stock: rng() < 0.5 ? 'heavy' : 'right', staff: rng() < 0.5 ? 'add' : 'keep', bonus: rng() < 0.6 ? 'take' : 'skip' };
}

const STRATEGIES = { balanced, aggressive, safe, random, growthy };

module.exports = { STRATEGIES, OPTIONS, balanced, aggressive, safe, random };

// Crafted decision sequences that reach each of the ten endings (used by the
// tests and the /ending-preview page). Some need a particular seed's luck.
const fixed = (d) => () => d;
const CRAFTED = {
  discountSpiral: aggressive,
  debtSpiral: fixed({ discount: 'd10', ads: 'big', stock: 'heavy', staff: 'add', bonus: 'take' }),
  growthTrap: fixed({ discount: 'd10', ads: 'small', stock: 'heavy', staff: 'add', bonus: 'skip' }),
  adBurn: fixed({ discount: 'd10', ads: 'big', stock: 'right', staff: 'keep', bonus: 'skip' }),
  slowBleed: fixed({ discount: 'none', ads: 'none', stock: 'lean', staff: 'add', bonus: 'skip' }),
  fumes: fixed({ discount: 'none', ads: 'big', stock: 'lean', staff: 'add', bonus: 'skip' }),
  fridge: fixed({ discount: 'd10', ads: 'small', stock: 'heavy', staff: 'keep', bonus: 'skip' }),
  stuck: safe,
  grower: balanced,
  scaled: balanced,
};
module.exports.CRAFTED = CRAFTED;
