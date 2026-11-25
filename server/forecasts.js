// The weekly prediction question. It changes every week, each one tests a
// different part of the cash story, and each comes with a one-line "why"
// shown after the reveal. Answers are always computed from the real week.
const B = require('./balance');
const { expectedDemand, capacity, receivableTotal } = require('./sim');
const { makeRng } = require('./rng');

const inr = (x) => {
  const neg = x < 0;
  const n = Math.round(Math.abs(x)).toString();
  const out = n.length <= 3 ? n : n.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + n.slice(-3);
  return (neg ? '−₹' : '₹') + out;
};
const short = (x) => (x >= 100000 ? `₹${(x / 100000).toFixed(x % 100000 ? 1 : 0)}L` : `₹${Math.round(x / 1000)}k`);
const roundTo = (x, step) => Math.max(step, Math.round(x / step) * step);
const yesNo = [{ v: 'yes', label: 'Yes' }, { v: 'no', label: 'No' }];
const DISC_NAME = { none: 'full price', d10: '10% off', d30: '30% off' };

// What the kitchen would roughly sell this week if it plays it "normal".
function baseline(state, event) {
  const d = { discount: 'd10', ads: 'small', stock: 'right', staff: 'keep' };
  const orders = Math.min(expectedDemand(state, d, event), capacity(state, event));
  const netPerOrder = B.MENU_PRICE * 0.9 * (1 - B.COMMISSION_PCT) - B.PLATFORM_FEE;
  return { orders, netPerOrder };
}

const Q = {
  cash: {
    tag: 'Cash check',
    make: (st) => ({ text: `Will cash in the bank at the end of this week be higher or lower than ${inr(st.cash)}?`, options: [{ v: 'higher', label: '⬆ Higher' }, { v: 'lower', label: '⬇ Lower' }] }),
    answer: (l) => (l.cashBeforeRescue >= l.startCash ? 'higher' : 'lower'),
    why: (l) => (l.cashBeforeRescue >= l.startCash
      ? `Earlier sales finally arrived from ZipEats (${inr(l.collected)}), more than this week’s bills.`
      : `Sales were ${inr(l.sales)}, but ingredients, staff and rent are paid now and ZipEats pays later.`),
    note: 'Ask: "Hands up if you said HIGHER because sales are going up." That is the trap.',
  },
  truck: {
    tag: 'The money truck',
    make: (st, ev) => {
      const b = baseline(st, ev);
      const held = receivableTotal(st) * (ev.id === 'settlement' ? 1 : 0);
      const e = b.orders * b.netPerOrder + held;
      const lo = roundTo(e * 0.8, 10000), hi = roundTo(e * 1.2, 10000);
      return { text: 'At the end of this week, how much money will ZipEats owe us (sales made, cash not yet paid)?', options: [{ v: 'low', label: `Under ${short(lo)}` }, { v: 'mid', label: `${short(lo)} to ${short(hi)}` }, { v: 'high', label: `Over ${short(hi)}` }], meta: { lo, hi } };
    },
    answer: (l, m) => (l.receivable < m.lo ? 'low' : l.receivable > m.hi ? 'high' : 'mid'),
    why: (l) => `${inr(l.receivable)} is on the truck. It’s your money, but you can’t pay rent with it yet.`,
    note: 'Point at the truck: "This money is ours. Why can\'t we spend it?"',
  },
  biggest: {
    tag: 'Where the money goes',
    make: () => ({ text: 'Which will be our BIGGEST cost this week?', options: [{ v: 'food', label: '🧅 Ingredients' }, { v: 'people', label: '👩‍🍳 Staff + rent' }, { v: 'zip', label: '📱 ZipEats’ cut' }, { v: 'ads', label: '📣 Ads' }] }),
    answer: (l) => {
      const c = l.costs;
      const m = { food: c.ingredients + c.supplierDeal, people: c.staff + c.rent + c.utilities, zip: c.commission, ads: c.ads };
      return Object.keys(m).sort((a, b) => m[b] - m[a])[0];
    },
    why: (l) => {
      const c = l.costs;
      return `Ingredients ${inr(c.ingredients + c.supplierDeal)} · staff + rent ${inr(c.staff + c.rent + c.utilities)} · ZipEats ${inr(c.commission)} · ads ${inr(c.ads)}.`;
    },
    note: 'Most people guess ads. Ingredients and ZipEats grow with every order, rent and staff never go away.',
  },
  profit: {
    tag: 'Profit vs cash',
    make: () => ({ text: 'Will the kitchen make a PROFIT this week, on paper (sales minus all costs)?', options: yesNo }),
    answer: (l) => (l.profit > 0 ? 'yes' : 'no'),
    why: (l) => {
      const dc = l.cashBeforeRescue - l.startCash;
      return `On paper: ${l.profit >= 0 ? 'a profit of ' + inr(l.profit) : 'a loss of ' + inr(-l.profit)}. In the bank: cash went ${dc >= 0 ? 'up ' + inr(dc) : 'down ' + inr(-dc)}. Profit is not cash.`;
    },
    note: 'The key line: a kitchen can be profitable and still run out of cash.',
  },
  keep100: {
    tag: 'Every ₹100',
    make: () => ({ text: 'Out of every ₹100 on our menu, how much will we keep after the discount, ZipEats’ cut and the food?', options: [{ v: 'hi', label: '₹30 or more' }, { v: 'mid', label: '₹15 to ₹30' }, { v: 'lo', label: 'Less than ₹15' }] }),
    answer: (l) => { const k = keepPer100(l); return k >= 30 ? 'hi' : k >= 15 ? 'mid' : 'lo'; },
    why: (l) => `At ${DISC_NAME[l.decisions.discount]} we kept about ₹${Math.round(keepPer100(l))} of every ₹100, before paying rent and staff.`,
    note: 'Your discount vote decides this answer. At 30% off the kitchen keeps under ₹10 of every ₹100.',
  },
  turnaway: {
    tag: 'Can we keep up?',
    make: () => ({ text: 'Will we have to turn away any customers this week (kitchen full or ingredients run out)?', options: yesNo }),
    answer: (l) => (l.unserved > 0 ? 'yes' : 'no'),
    why: (l) => (l.unserved > 0 ? `${l.unserved.toLocaleString('en-IN')} customers turned away. The kitchen could cook ${l.capacity.toLocaleString('en-IN')}. Unhappy customers hurt the rating.` : `Every customer served. The kitchen could cook up to ${l.capacity.toLocaleString('en-IN')}.`),
    note: 'Demand spikes only help if the kitchen and the stock can handle them.',
  },
  orders: {
    tag: 'Order count',
    make: (st, ev) => {
      const e = baseline(st, ev).orders;
      const lo = roundTo(e * 0.85, 50), hi = roundTo(e * 1.15, 50);
      return { text: 'How many orders will we serve this week?', options: [{ v: 'low', label: `Under ${lo.toLocaleString('en-IN')}` }, { v: 'mid', label: `${lo.toLocaleString('en-IN')} to ${hi.toLocaleString('en-IN')}` }, { v: 'high', label: `Over ${hi.toLocaleString('en-IN')}` }], meta: { lo, hi } };
    },
    answer: (l, m) => (l.orders < m.lo ? 'low' : l.orders > m.hi ? 'high' : 'mid'),
    why: (l) => `${l.orders.toLocaleString('en-IN')} orders served. More orders also means more cash paid out today.`,
    note: 'After the reveal, point at both lines: orders up does not mean cash up.',
  },
  waste: {
    tag: 'In the bin',
    make: () => ({ text: 'Will we throw away more than ₹10,000 of food this week?', options: yesNo }),
    answer: (l) => (l.costs.wastage > 10000 ? 'yes' : 'no'),
    why: (l) => `${inr(l.costs.wastage)} of food went in the bin. Food is cash you paid upfront.`,
    note: 'Heavy stock feels safe. Unsold food is cash thrown away.',
  },
  danger: {
    tag: 'Danger zone',
    make: () => ({ text: 'Will cash drop below ₹1,00,000 (the danger zone) this week?', options: yesNo }),
    answer: (l) => (l.cashBeforeRescue < 100000 ? 'yes' : 'no'),
    why: (l) => `Cash ended the week at ${inr(Math.max(0, l.cashBeforeRescue))}.`,
    note: 'Ask what the room would cut first if cash drops below ₹1 lakh.',
  },
};

function keepPer100(l) {
  const disc = B.DISCOUNT[l.decisions.discount];
  const p = B.MENU_PRICE * (1 - disc);
  const keep = p * (1 - B.COMMISSION_PCT) - B.PLATFORM_FEE - B.MENU_PRICE * B.FOOD_COST_PCT - B.PACKAGING;
  return (keep / B.MENU_PRICE) * 100;
}

const POOL = ['truck', 'biggest', 'profit', 'keep100', 'orders', 'waste'];

// Pick this week's question. Week 1 and the payout-delay week always ask the
// cash question (the core lesson); demand spikes ask "can we keep up?";
// otherwise rotate without repeating recent questions.
function pickQuestion(state, event, week, seed, history) {
  let id;
  const recent = history.slice(-3);
  const sinceCash = history.length - history.lastIndexOf('cash');
  if (week === 1 || event.id === 'settlement') id = 'cash';
  else if (['viral', 'festival', 'monsoon'].includes(event.id) && !recent.includes('turnaway')) id = 'turnaway';
  else if (state.cash < 300000 && !recent.includes('danger')) id = 'danger';
  else if (sinceCash >= 4) id = 'cash';
  else {
    const rng = makeRng(seed * 977 + week * 31);
    const pool = POOL.filter((q) => !recent.includes(q) && !history.includes(q));
    const fallback = POOL.filter((q) => !recent.includes(q));
    const from = pool.length ? pool : fallback;
    id = from[Math.floor(rng() * from.length)];
  }
  const made = Q[id].make(state, event || {});
  return { id, tag: Q[id].tag, text: made.text, options: made.options, meta: made.meta || null };
}

function resolveQuestion(q, line) {
  const def = Q[q.id];
  const answer = def.answer(line, q.meta || {});
  const opt = q.options.find((o) => o.v === answer);
  return { answer, answerLabel: opt ? opt.label : answer, why: def.why(line) };
}

const questionNote = (id) => (Q[id] ? Q[id].note : '');

module.exports = { pickQuestion, resolveQuestion, questionNote, QUESTION_IDS: Object.keys(Q) };
