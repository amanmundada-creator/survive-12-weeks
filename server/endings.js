// The ten endings: an ordered rulebook (classifyEnding) plus the words
// and callouts for each ending (endingContent). Numbers always come from
// the real simulation state.
const B = require('./balance');
const { balanceSheet, receivableTotal } = require('./sim');

const ENDING_ORDER = ['growthTrap', 'discountSpiral', 'adBurn', 'debtSpiral', 'slowBleed', 'fumes', 'fridge', 'stuck', 'grower', 'scaled'];

function endingStats(s) {
  const h = s.history;
  const n = h.length || 1;
  const first = h[0] ? h[0].orders : 0;
  const last = h.length ? h[h.length - 1].orders : 0;
  const peak = h.reduce((m, l) => Math.max(m, l.orders), 0);
  const d30Weeks = h.filter((l) => l.decisions.discount === 'd30').length;
  const T = s.totals;
  const cashCosts = T.food + T.waste + T.packaging + T.ads + T.fixed + T.cooks + T.interest + T.penalties;
  const fixedWeek = B.RENT * s.rentMult + B.BASE_STAFF + B.UTILITIES + Math.max(0, s.cooks - B.START_COOKS) * B.EXTRA_COOK;
  return {
    weeksPlayed: h.length, first, last, peak, d30Share: d30Weeks / n,
    adsShare: cashCosts ? T.ads / cashCosts : 0,
    receivable: receivableTotal(s), cash: s.cash, inventory: s.invValue, waste: T.waste,
    fixedWeek, ordersGrew: last >= first * 1.15,
  };
}

// Ordered rules. The first rule that matches wins.
// Documented word-for-word in README.md ("How the endings are decided").
function classifyEnding(s, ctx) {
  const st = endingStats(s);
  const goal = ctx.goal;
  if (s.bankrupt) {
    if (st.d30Share >= 0.5) return 'discountSpiral';
    if (s.flags.tookBridgeLoan) return 'debtSpiral';
    if (st.ordersGrew && st.receivable >= st.fixedWeek * 1.5) return 'growthTrap';
    if (st.adsShare >= 0.15) return 'adBurn';
    return 'slowBleed';
  }
  const wasteHeavy = st.waste >= 15000 * st.weeksPlayed || st.inventory >= 80000;
  if (s.emergencyUsed) return wasteHeavy ? 'fridge' : 'fumes'; // alive only thanks to the rescue loan
  // The investor backs growth that was paid for: no bridge loan, and no more
  // than a small start-up loss still on the books.
  if (st.last >= goal && !s.flags.tookBridgeLoan && s.retained > -100000) return 'scaled';
  if (st.cash < st.fixedWeek * 2 && st.receivable > st.cash) return 'fumes';
  if (wasteHeavy && st.cash < 350000) return 'fridge';
  if (!st.ordersGrew) return 'stuck';
  return 'grower';
}

const inr = (x) => {
  const neg = x < 0;
  const n = Math.round(Math.abs(x)).toString();
  let out;
  if (n.length <= 3) out = n;
  else {
    const last3 = n.slice(-3);
    const rest = n.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    out = rest + ',' + last3;
  }
  return (neg ? '−₹' : '₹') + out;
};

const META = {
  growthTrap: { n: 1, title: 'The Growth Trap', theme: 'red', bankrupt: true, art: 'truck', tagline: 'You were rich on paper and broke in the bank.' },
  discountSpiral: { n: 2, title: 'The Discount Death Spiral', theme: 'red', bankrupt: true, art: 'tag', tagline: 'You paid customers to eat.' },
  adBurn: { n: 3, title: 'The Ad Burn', theme: 'red', bankrupt: true, art: 'megaphone', tagline: 'Rented attention, kept nothing.' },
  debtSpiral: { n: 4, title: 'The Debt Spiral', theme: 'red', bankrupt: true, art: 'chain', tagline: 'Borrowed to survive, survived to repay.' },
  slowBleed: { n: 5, title: 'The Slow Bleed', theme: 'red', bankrupt: true, art: 'drip', tagline: 'Doing nothing is also a decision.' },
  fumes: { n: 6, title: 'Running on Fumes', theme: 'amber', bankrupt: false, art: 'gauge', tagline: 'One late payout away from collapse.' },
  fridge: { n: 7, title: 'Cash Locked in the Fridge', theme: 'amber', bankrupt: false, art: 'fridge', tagline: 'Cash you can’t spend is not cash.' },
  stuck: { n: 8, title: 'Safe but Stuck', theme: 'amber', bankrupt: false, art: 'snail', tagline: 'Safe, but the business is shrinking.' },
  grower: { n: 9, title: 'The Balanced Grower', theme: 'green', bankrupt: false, art: 'sprout', tagline: 'Growth you could actually pay for.' },
  scaled: { n: 10, title: 'Scaled Up', theme: 'green', bankrupt: false, art: 'rocket', tagline: 'Growth and cash, together.' },
};

// Callouts: each points at a balance-sheet line (key) with a sentence.
function endingContent(id, s, ctx) {
  const st = endingStats(s);
  const T = s.totals;
  const bs = balanceSheet(s);
  const m = META[id];
  const loss = -s.retained;
  const wk = st.weeksPlayed;
  const pl = s.retained >= 0 ? `Profit so far: ${inr(s.retained)}` : `Loss so far: ${inr(-s.retained)}`;
  const loaned = s.flags.tookBridgeLoan;
  const hitGoal = st.last >= ctx.goal;
  const C = {
    growthTrap: {
      callouts: [
        { key: 'receivable', text: `ZipEats still owes you ${inr(st.receivable)}, more than you had in the bank when you closed.` },
        { key: 'cash', text: `Cash hit zero in week ${s.bankruptWeek}, while orders were at ${st.last.toLocaleString('en-IN')} a week.` },
        { key: 'unpaidBills', text: `${inr(s.unpaidBills)} of rent, staff and supplier bills left unpaid.` },
      ],
      cfo: [`Your sales went up every week, but each new order cost cash today and paid you back a week later.`, `Growth needs a cash buffer that grows with it, or the bank runs dry while the order screen looks great.`],
    },
    discountSpiral: {
      callouts: [
        { key: 'retained', text: `Lifetime loss: ${inr(loss)}. Discounts alone cost you ${inr(T.discountCost)}.` },
        { key: 'cash', text: `At 30% off you kept about ₹32 per order, before rent and staff.` },
        { key: 'unpaidBills', text: `${inr(s.unpaidBills)} of bills left unpaid when the cash ran out.` },
      ],
      cfo: [`A 30% discount nearly doubles orders but leaves almost nothing per order to pay rent and salaries.`, `More orders at a loss just means losing money faster.`],
    },
    adBurn: {
      callouts: [
        { key: 'retained', text: `You spent ${inr(T.ads)} on ads. That is ${Math.round(st.adsShare * 100)}% of everything you spent.` },
        { key: 'cash', text: `Orders peaked at ${st.peak.toLocaleString('en-IN')} but ended at ${st.last.toLocaleString('en-IN')} a week.` },
        { key: 'unpaidBills', text: `${inr(s.unpaidBills)} unpaid when the music stopped.` },
      ],
      cfo: [`Ads bring customers in for a week. Unless the food and the margin bring them back, you pay for them again next week.`, `Spend on ads only what this week's margin can afford.`],
    },
    debtSpiral: {
      callouts: [
        { key: 'bridgeLoan', text: `Loans on the books: ${inr(bs.totalLiabilities - s.unpaidBills)}. They are the biggest item on the "owes" side.` },
        { key: 'retained', text: `Interest paid: ${inr(T.interest)}. That money bought no food and no customers.` },
        { key: 'unpaidBills', text: `${inr(s.unpaidBills)} still unpaid on top of the loans.` },
      ],
      cfo: [`The loan bought you time, but the business was still losing money each week, so you used up the time and kept the debt.`, `Borrow to fund something that makes money, not to cover a weekly loss.`],
    },
    slowBleed: {
      callouts: [
        { key: 'retained', text: `Rent, staff and utilities cost ${inr(T.fixed + T.cooks)} whether or not anyone ordered.` },
        { key: 'cash', text: `Orders slid from ${st.first.toLocaleString('en-IN')} to ${st.last.toLocaleString('en-IN')} a week.` },
        { key: 'unpaidBills', text: `${inr(s.unpaidBills)} unpaid at closing.` },
      ],
      cfo: [`Fixed costs don't wait for customers. A kitchen that stops trying to grow slowly shrinks while those costs keep running.`, `Playing it safe isn't free: doing nothing is also a decision.`],
    },
    fumes: {
      callouts: [
        { key: 'cash', text: `Only ${inr(s.cash)} in the bank. That is less than ${Math.max(1, Math.round(s.cash / st.fixedWeek * 10) / 10)} weeks of rent and salaries.` },
        { key: 'receivable', text: `${inr(st.receivable)} is "on the way" from ZipEats. One more delay and it's over.` },
        { key: 'retained', text: s.retained >= 0 ? `${pl}. A profit on paper doesn't pay rent.` : `${pl}, and very little cash to absorb more.` },
      ],
      cfo: [`You survived, but most of your money is sitting with ZipEats, not in your account.`, `Before the next growth push, build a buffer of at least a month of fixed costs.`],
    },
    fridge: {
      callouts: [
        { key: 'inventory', text: `${inr(s.invValue)} of ingredients on the shelf. You can't pay salaries with onions.` },
        { key: 'retained', text: `You threw away ${inr(T.waste)} of food that went off.` },
        { key: 'cash', text: `Cash in bank: ${inr(s.cash)}. Your money is in the fridge.` },
      ],
      cfo: [`Buying heavy "just in case" turns cash into food, and unsold food turns into waste.`, `Buy for what the kitchen can actually cook this week.`],
    },
    stuck: {
      callouts: [
        { key: 'cash', text: `A comfortable ${inr(s.cash)} in the bank.` },
        { key: 'equipment', text: st.last > st.first
          ? `But orders only crept from ${st.first.toLocaleString('en-IN')} to ${st.last.toLocaleString('en-IN')} a week, far from the ${ctx.goal.toLocaleString('en-IN')} goal.`
          : `But orders went from ${st.first.toLocaleString('en-IN')} to ${st.last.toLocaleString('en-IN')} a week. The goal was ${ctx.goal.toLocaleString('en-IN')}.` },
        { key: 'retained', text: st.last > st.first ? `${pl}. Safe, but growing too slowly to matter.` : `${pl}. Fixed costs keep coming while demand slips away.` },
      ],
      cfo: st.last > st.first
        ? [`You protected the cash, which is why you finished on top. But the kitchen barely grew.`, `With this much cash in the bank, you could afford a modest discount or small ads to grow faster.`]
        : [`You protected the cash, but competitors took your customers while you waited.`, `Cash in the bank should be used to grow carefully, not just kept safe.`],
      ...(st.last > st.first ? { tagline: 'Safe, but barely growing.' } : {}),
    },
    grower: {
      callouts: [
        { key: 'cash', text: `${inr(s.cash)} in the bank and ${inr(st.receivable)} on the way.` },
        loaned
          ? { key: 'bridgeLoan', text: `The ${inr(B.BRIDGE_LOAN_AMOUNT)} bridge loan is still on the books. ${pl}.` }
          : { key: 'retained', text: s.retained >= 0 ? `${pl}. You paid for your own growth.` : `${pl}. Growth is still costing more than it earns.` },
        { key: 'equipment', text: hitGoal
          ? `You hit ${st.last.toLocaleString('en-IN')} orders a week (goal ${ctx.goal.toLocaleString('en-IN')}), but the investor passed.`
          : `Orders grew from ${st.first.toLocaleString('en-IN')} to ${st.last.toLocaleString('en-IN')}, short of the ${ctx.goal.toLocaleString('en-IN')} goal.` },
      ],
      cfo: loaned
        ? [`You reached real growth, but partly on borrowed money, and the loan is still there.`, `Investors back growth that pays for itself. Grow a little slower, without the loan, and they come to you.`]
        : s.retained < 0
          ? [`Orders grew and the cash held, but each week still lost a little money.`, `Next step: protect the margin per order (smaller discounts, less waste) so growth starts paying for itself.`]
          : [`Steady discounts, small ads and right-sized stock: you grew as fast as your cash allowed.`, `A few more weeks at this pace and the investors will come to you.`],
      ...(loaned ? { tagline: 'Real growth, but on borrowed money.' } : s.retained < 0 ? { tagline: 'Growing, but not yet paying for itself.' } : {}),
    },
    scaled: {
      callouts: [
        { key: 'funding', text: `The investor put in ${inr(s.funding || B.INVESTOR_FUNDING)} on Demo Day.` },
        { key: 'cash', text: `You hit ${st.last.toLocaleString('en-IN')} orders a week (goal ${ctx.goal.toLocaleString('en-IN')}) without running out of cash.` },
        { key: 'retained', text: s.retained >= 0 ? `${pl}, and every rupee of growth was paid for.` : `Still ${inr(-s.retained)} down from the start-up weeks: small enough that the investor sees a kitchen about to earn it back.` },
      ],
      cfo: [`You grew orders and protected the cash. That's why an investor would back you.`, `Margins, payout timing and fixed costs were all under control. That is what scaling looks like.`],
    },
  }[id];
  return { id, ...m, ...C, stats: st };
}

module.exports = { classifyEnding, endingContent, endingStats, ENDING_ORDER, META, inr };
