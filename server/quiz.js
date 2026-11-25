// Kahoot-style questions. Every answer is known the moment the timer ends, so
// the room sees the right answer, the split and the cash won or lost at once.
// Each game uses each question at most once.
const B = require('./balance');
const { makeRng } = require('./rng');

const inr = (x) => {
  const n = Math.round(Math.abs(x)).toString();
  const out = n.length <= 3 ? n : n.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + n.slice(-3);
  return (x < 0 ? '−₹' : '₹') + out;
};
const keep = (disc) => Math.round(B.MENU_PRICE * (1 - disc) * (1 - B.COMMISSION_PCT) - B.PLATFORM_FEE - B.MENU_PRICE * B.FOOD_COST_PCT - B.PACKAGING);
const FIXED = B.RENT + B.BASE_STAFF + B.UTILITIES;

// Static questions: [id, category, text, options, correct index, why]
const STATIC = [
  ['payday', 'cash', 'A customer orders today. When does ZipEats pay you for it?', ['Instantly', 'At the end of next week', 'Next month', 'When the food is delivered'], 1, 'ZipEats pays each week’s sales at the end of the following week. Until then it’s money owed, not money in the bank.'],
  ['receivable', 'words', 'Money ZipEats owes you but hasn’t paid yet is called…', ['Revenue', 'A receivable', 'Profit', 'Equity'], 1, 'A receivable is yours on paper, but you can’t pay rent with it until it arrives.'],
  ['fixed', 'words', 'Which of these is a FIXED cost?', ['Ingredients', 'Packaging', 'Rent', 'ZipEats commission'], 2, `Rent, salaries and utilities (about ${inr(FIXED)} a week) stay the same whether you sell 10 orders or 1,000.`],
  ['keep30', 'margin', `At 30% off a ₹350 dish, how much do you keep per order after food, packaging and ZipEats?`, ['₹110', '₹84', `₹${keep(0.3)}`, '₹245'], 2, `At 30% off you keep about ₹${keep(0.3)}. At full price it’s ₹${keep(0)}. Big discounts leave almost nothing for rent.`],
  ['keepFull', 'margin', 'At FULL price (₹350), how much do you keep per order after food, packaging and ZipEats?', ['₹32', `₹${keep(0)}`, '₹200', '₹350'], 1, `₹350 − ₹126 food − ₹14 packaging − ZipEats’ 25% + ₹12 fee ≈ ₹${keep(0)}.`],
  ['commission', 'margin', 'How much does ZipEats take from every order?', ['10%', '18%', '25% + ₹12 fee', '40%'], 2, 'ZipEats keeps 25% of the price the customer pays, plus a ₹12 platform fee per order.'],
  ['profitCash', 'cash', 'True or false: a kitchen can make a PROFIT and still run out of CASH.', ['True', 'False'], 0, 'True. Profit counts sales today; cash arrives later. Growing kitchens die in that gap.'],
  ['waste', 'ops', 'What happens to food you bought but didn’t sell this week?', ['It’s all kept for next week', 'Most of it is thrown away', 'ZipEats refunds it', 'The supplier takes it back'], 1, 'About 60% of unsold stock spoils and is thrown away. Only dry goods keep.'],
  ['cook', 'ops', 'An extra cook costs ₹5,500 a week. How many more orders a week can the kitchen cook?', ['100', '250', '450', '1,000'], 2, 'Each cook adds about 450 orders of capacity. Hire only when the kitchen is actually full.'],
  ['fixedTotal', 'cash', 'Roughly how much are rent + base staff + utilities every week?', ['₹18,000', `₹${Math.round(FIXED / 1000)},000`, '₹1,20,000', '₹2,50,000'], 1, `About ${inr(FIXED)} a week, whatever happens. That’s what drains a quiet kitchen.`],
  ['rescue', 'cash', 'What happens the FIRST time your cash goes below zero?', ['Game over', 'An emergency loan at 6% a week', 'ZipEats pays you early', 'Nothing'], 1, 'A lender rescues you once, at a harsh 6% a week. The second time, the kitchen closes.'],
  ['payRent', 'cash', 'Which of these can pay the rent TODAY?', ['Money owed by ZipEats', 'Ingredients in stock', 'Cash in the bank', 'Kitchen equipment'], 2, 'Only cash pays bills. Receivables, stock and equipment are assets, but not spendable today.'],
  ['equation', 'words', 'On a balance sheet, Assets always equal…', ['Revenue − Costs', 'Liabilities + Equity', 'Cash + Profit', 'Sales × Margin'], 1, 'Everything the kitchen has (assets) was paid for either by borrowing (liabilities) or by the owner and profits (equity).'],
  ['interest', 'cash', 'A ₹3,00,000 loan at 2.5% a WEEK costs how much interest each week?', ['₹2,500', '₹7,500', '₹25,000', '₹75,000'], 1, '2.5% of ₹3 lakh is ₹7,500 every week. That’s about 130% a year.'],
  ['discountPrice', 'margin', 'With 10% off a ₹350 dish, what does the customer pay?', ['₹340', '₹315', '₹280', '₹245'], 1, 'They pay ₹315, and ZipEats’ 25% is taken from that lower price. You fund the discount.'],
  ['adsWhen', 'cash', 'When do you pay for ads?', ['When customers order', 'Up front, this week', 'After ZipEats pays you', 'Only if they work'], 1, 'Ads are paid today; the customers (and their money) come later.'],
  ['inventoryAsset', 'words', 'True or false: ingredients sitting in your fridge count as an asset.', ['True', 'False'], 0, 'True. Stock is an asset, but it’s cash you’ve already spent and can’t use for rent.'],
  ['equity', 'words', 'On the balance sheet, where do your profits (or losses) so far appear?', ['Under assets', 'Under liabilities', 'On the owner’s side (equity)', 'They don’t'], 2, 'Profit or loss builds up on the owner’s side as “retained earnings”.'],
];

// Questions tied to this week's event (asked when that event happens)
const EVENT_Q = {
  settlement: ['payoutHold', 'cash', 'ZipEats is holding payouts this week. How much will you receive from them?', ['Everything they owe', 'About half', 'Nothing until next week', 'Double, to catch up'], 2, 'Nothing arrives this week. Sales are fine, but cash in is zero while every bill is still due.'],
  rival: ['rivalCut', 'ops', 'A rival kitchen opened next door. By how much does your organic demand drop, for good?', ['2%', '8%', '25%', '50%'], 1, 'Organic demand drops 8% permanently. Doing nothing means slowly shrinking.'],
  rentHike: ['rentType', 'words', 'Your rent goes up 15%. What kind of cost just went up?', ['A variable cost', 'A fixed cost', 'A one-off cost', 'An asset'], 1, 'Rent is a fixed cost: it rises whether you sell more or not.'],
  viral: ['viralLimit', 'ops', 'Your reel went viral: demand +40%. What limits how many orders you can actually serve?', ['Nothing', 'Kitchen capacity and stock', 'ZipEats', 'Your rating'], 1, 'You can only serve as many orders as your cooks and your ingredients allow. The rest are turned away.'],
  supplierHike: ['hikeEffect', 'margin', 'Ingredient prices rose 10% for 2 weeks. What happens to your margin per order?', ['Goes up', 'Goes down', 'Stays the same', 'ZipEats covers it'], 1, 'Food is your biggest cost per order, so your margin shrinks unless you raise prices.'],
};

// Questions about what the room did last week (from week 2)
function liveQuestions(room) {
  const out = [];
  if (!room) return out;
  if (room.discountCounts) {
    const labels = { none: 'No discount', d10: '10% off', d30: '30% off' };
    const keys = ['none', 'd10', 'd30'];
    const top = keys.slice().sort((a, b) => room.discountCounts[b] - room.discountCounts[a])[0];
    out.push(['roomDiscount', 'room', 'Last week, what did MOST kitchens choose for discount?', keys.map((k) => labels[k]), keys.indexOf(top),
      `${Math.round((room.discountCounts[top] / Math.max(1, room.kitchens)) * 100)}% chose “${labels[top]}”.`]);
  }
  if (room.topCash && room.topCash.length >= 3) {
    const opts = room.topCash.slice(0, 4);
    const order = opts.map((o, i) => i).sort((a, b) => (a * 7 + room.week) % 5 - (b * 7 + room.week) % 5);
    const shuffled = order.map((i) => opts[i]);
    out.push(['roomLeader', 'room', 'Which kitchen had the MOST cash at the end of last week?', shuffled.map((o) => o.nick), shuffled.findIndex((o) => o === opts[0]),
      `${opts[0].nick} led with ${inr(opts[0].cash)} in the bank.`]);
  }
  if (room.cashDownShare != null) {
    const p = room.cashDownShare;
    const idx = p >= 0.75 ? 0 : p >= 0.4 ? 1 : 2;
    out.push(['roomCashDown', 'room', 'Last week, how many kitchens saw their cash go DOWN?', ['Most of them', 'About half', 'Only a few'], idx,
      `${Math.round(p * 100)}% of kitchens had less cash at the end of the week, even though most sold more.`]);
  }
  return out;
}

// Pick this week's question: week 1 is always "when does ZipEats pay?";
// an event week asks about that event; otherwise a mix of rule questions and
// questions about last week's room, never repeating and never the same
// category twice in a row.
function pickQuiz({ week, seed, event, used, lastCat, room }) {
  const rng = makeRng(seed * 131 + week * 977);
  const make = (q) => ({ id: q[0], cat: q[1], text: q[2], options: q[3], correct: q[4], why: q[5] });
  if (week === 1 && !used.includes('payday')) return make(STATIC[0]);
  const ev = event && EVENT_Q[event.id];
  if (ev && !used.includes(ev[0])) return make(ev);
  const live = liveQuestions(room).filter((q) => !used.includes(q[0]));
  const stat = STATIC.filter((q) => !used.includes(q[0]));
  // about every other week, ask about the room (it's the most fun)
  const preferLive = live.length && (week % 2 === 0 || rng() < 0.3);
  let pool = preferLive ? live : stat;
  let fresh = pool.filter((q) => q[1] !== lastCat);
  if (!fresh.length) fresh = pool.length ? pool : stat.length ? stat : STATIC;
  return make(fresh[Math.floor(rng() * fresh.length)]);
}

module.exports = { pickQuiz, STATIC, EVENT_Q, liveQuestions };
