// Words: nicknames, roles, advisors, presenter notes, decision labels.
const B = require('./balance');
const { expectedDemand } = require('./sim');

const NICK_A = ['Spicy', 'Turbo', 'Crispy', 'Masala', 'Golden', 'Tangy', 'Butter', 'Smoky', 'Zesty', 'Royal', 'Cheesy', 'Peppy', 'Saucy', 'Midnight', 'Desi', 'Sizzling', 'Mighty', 'Fluffy', 'Tandoori', 'Chatpata', 'Garlic', 'Minty', 'Rapid', 'Loaded'];
const NICK_B = ['Samosa', 'Tiffin', 'Paneer', 'Dosa', 'Biryani', 'Kulfi', 'Pakora', 'Naan', 'Momo', 'Vada', 'Jalebi', 'Chai', 'Idli', 'Paratha', 'Lassi', 'Kebab', 'Rasgulla', 'Pav', 'Thali', 'Chutney', 'Ladoo', 'Bhaji', 'Korma', 'Raita'];

function randomNick(rng = Math.random) {
  return `${NICK_A[Math.floor(rng() * NICK_A.length)]} ${NICK_B[Math.floor(rng() * NICK_B.length)]}`;
}

const ROLES = {
  growth: { name: 'Growth Head', emoji: '🚀', pride: 'Your pride: more orders', bonus: 'Bonus points every week orders go up.' },
  ops: { name: 'Operations Head', emoji: '🍳', pride: 'Your pride: low waste, happy customers', bonus: 'Bonus points every week with little waste and no turned-away orders.' },
  finance: { name: 'Finance Head', emoji: '💰', pride: 'Your pride: cash in the bank', bonus: 'Bonus points every week the bank balance goes up.' },
};

const DECISIONS = {
  discount: {
    title: 'Discount',
    options: [
      { v: 'none', label: 'No discount', hint: 'Full price. Fewer orders.' },
      { v: 'd10', label: '10% off', hint: 'More orders, a bit less per order.' },
      { v: 'd30', label: '30% off', hint: 'Lots of orders. You pay for the discount.' },
    ],
  },
  ads: {
    title: 'Ad spend',
    options: [
      { v: 'none', label: 'No ads', hint: 'Save ₹0. People slowly forget you.' },
      { v: 'small', label: 'Small · ₹15k', hint: 'A steady trickle of new eyes.' },
      { v: 'big', label: 'Big · ₹45k', hint: 'A splash. Paid today.' },
    ],
  },
  stock: {
    title: 'Ingredient stock',
    options: [
      { v: 'lean', label: 'Lean', hint: 'Little waste. Might run out.' },
      { v: 'right', label: 'Right-sized', hint: 'Buy for what you can cook.' },
      { v: 'heavy', label: 'Heavy', hint: 'Never run out. Paid upfront.' },
    ],
  },
  staff: {
    title: 'Staff',
    options: [
      { v: 'keep', label: 'Keep team', hint: 'Same kitchen size.' },
      { v: 'add', label: 'Add a cook', hint: '+450 orders capacity, ₹5,500/week forever.' },
    ],
  },
};

const DEFAULT_CHOICE = { discount: 'none', ads: 'none', stock: 'right', staff: 'keep', bonus: 'skip' };

// ── Advisors: biased on purpose ──
const ADVISORS = {
  growth: { name: 'Rocket Rhea', role: 'Growth', emoji: '🚀' },
  ops: { name: 'Steady Sam', role: 'Operations', emoji: '🍳' },
  finance: { name: 'Penny Priya', role: 'Finance', emoji: '💰' },
};

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

function advisorAdvice(state, event, rng, goal) {
  const fixedWeek = B.RENT * state.rentMult + B.BASE_STAFF + B.UTILITIES + Math.max(0, state.cooks - B.START_COOKS) * B.EXTRA_COOK;
  const cap = state.cooks * B.CAPACITY_PER_COOK;
  const last = state.history.length ? state.history[state.history.length - 1] : null;
  const lastOrders = last ? last.orders : Math.round(B.START_AWARENESS);
  const cashRich = state.cash > 400000;
  const cashTight = state.cash < fixedWeek * 2.5;
  const bonus = event && event.bonus;

  // Growth: always more.
  const g = { discount: cashTight ? 'd10' : 'd30', ads: 'big', stock: 'heavy', staff: lastOrders > cap * 0.7 ? 'add' : 'keep', bonus: bonus === 'supplier' ? 'take' : bonus === 'price' ? 'skip' : 'take' };
  const gLines = [
    `Orders are oxygen! ${g.discount === 'd30' ? '30% off' : '10% off'} and a BIG ad push. Let's own this city.`,
    `The goal is ${goal.toLocaleString('en-IN')} orders. We won't get there by being shy. Go big on ads.`,
    `Competitors are discounting. If we don't, we disappear. ${g.discount === 'd30' ? '30%' : '10%'} off, now!`,
    `Look at the order screen! Growth fixes everything. Stock up heavy so we never say no.`,
  ];
  if (event && event.id === 'viral') gLines.push(`We're VIRAL! Pour fuel on it: big ads, heavy stock, extra cook!`);
  if (bonus === 'loan') gLines.push(`Free money on the table! Take the loan and grow faster.`);

  // Operations: smooth kitchen, careful stock and staff.
  const o = { discount: 'd10', ads: 'small', stock: 'right', staff: lastOrders > cap * 0.9 ? 'add' : 'keep', bonus: bonus === 'supplier' ? 'take' : 'skip' };
  if (last && last.costs.wastage > 15000) o.stock = 'lean';
  const oLines = [
    o.staff === 'add' ? `The kitchen is nearly full, ${lastOrders} orders for ${cap} slots. One more cook or we start saying no.` : `We have room for ${cap} orders. Don't hire yet; fill the slots we have.`,
    o.stock === 'lean' ? `We threw away ${'₹' + Math.round(last.costs.wastage).toLocaleString('en-IN')} of food last week. Buy lean.` : `Buy for what we can actually cook. Rotting onions are not an asset.`,
    `A small discount keeps the tickets flowing without burning out the team.`,
  ];
  if (event && event.id === 'monsoon') oLines.push(`Monsoon means fewer riders. Don't promise what we can't deliver.`);

  // Finance: protect the cash.
  const f = { discount: 'none', ads: cashRich ? 'small' : 'none', stock: 'lean', staff: 'keep', bonus: bonus === 'price' ? 'take' : bonus === 'supplier' && cashRich ? 'take' : 'skip' };
  const fLines = [
    `Every order we take today is paid for today, but ZipEats pays us next week. Slow down.`,
    `At 30% off we keep ₹32 an order. That doesn't even cover the rent. No discounts.`,
    `Cash is ₹${Math.round(state.cash / 1000)}k. Fixed costs are ₹${Math.round(fixedWeek / 1000)}k a week whatever happens. Protect it.`,
    `Ads are paid today, results are maybe. Keep the money in the bank.`,
  ];
  if (event && event.id === 'settlement') fLines.push(`ZipEats is holding our money this week. Spend NOTHING we don't have to.`);
  if (bonus === 'loan') fLines.push(`A 2.5% a week loan is 130% a year. Only if we're desperate.`);

  return {
    growth: { ...ADVISORS.growth, rec: g, line: pick(rng, gLines) },
    ops: { ...ADVISORS.ops, rec: o, line: pick(rng, oLines) },
    finance: { ...ADVISORS.finance, rec: f, line: pick(rng, fLines) },
  };
}

// ── Presenter notes: one talking point per step ──
function presenterNote(phase, ctx) {
  const { week, quiz, room } = ctx || {};
  switch (phase) {
    case 'setup':
      return 'Welcome everyone. "Today every one of you runs your own cloud kitchen with ₹5 lakh. Scan the code. The richest kitchen when the clock hits zero wins."';
    case 'lobby':
      return 'While people join: "Right answers put cash in your kitchen. Wrong answers take it out. Answer fast for more."';
    case 'brief':
      return week === 1 ? 'Week 1: "Same news, same luck for everyone. Only your decisions differ. The advisors each have a bias."' : 'Read the headline out loud. Ask: "Who changes their plan because of this?"';
    case 'question':
      return quiz ? `Question: “${quiz.text}” Read it out loud. It closes as soon as everyone has answered.` : '';
    case 'answer':
      return quiz ? `Explain the answer: ${quiz.why}` : '';
    case 'decide':
      return 'Everyone decides for their OWN kitchen now. It closes as soon as everyone has locked in. Tip for them: "Same as last week" is one tap.';
    case 'results':
      return room && room.cashDownShare != null ? `${Math.round(room.cashDownShare * 100)}% of kitchens have LESS cash than last week. Ask a top-5 player what they did differently.` : 'Shout out the leader.';
    case 'ending':
      return 'Walk through the winner\'s balance sheet: what they have, what they owe, and why they ended where they did. Close with: "Growth is not cash."';
    default:
      return '';
  }
}

function formatInr(x) {
  const neg = x < 0;
  const n = Math.round(Math.abs(x)).toString();
  let out;
  if (n.length <= 3) out = n;
  else out = n.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + n.slice(-3);
  return (neg ? '−₹' : '₹') + out;
}

module.exports = { randomNick, ROLES, DECISIONS, DEFAULT_CHOICE, ADVISORS, advisorAdvice, presenterNote, formatInr };
