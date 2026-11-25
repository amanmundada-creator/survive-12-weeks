// ─────────────────────────────────────────────────────────────
// The business simulation. Pure functions, no UI, no I/O.
//   initialState()                         → week-0 kitchen
//   simulateWeek(state, decisions, event, rng) → new state (input untouched)
//   balanceSheet(state)                    → assets / liabilities / equity
// ─────────────────────────────────────────────────────────────
const B = require('./balance');

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const r0 = (x) => Math.round(x);
const clone = (o) => JSON.parse(JSON.stringify(o));

const UNIT_FOOD = B.MENU_PRICE * B.FOOD_COST_PCT;

function initialState(opts = {}) {
  const weeks = opts.weeks || 12;
  const s = {
    week: 0,
    gameWeeks: weeks,
    // the one-time rescue loan is sized to carry the kitchen to this week
    rescueCarryTo: Math.max(B.EARLIEST_CLOSURE_WEEK, Math.min(7, Math.round(weeks * 0.55))),
    cash: B.START_CASH,
    receivables: [], // [{ amount, due }] money ZipEats owes us
    invUnits: B.START_INVENTORY_VALUE / UNIT_FOOD,
    invValue: B.START_INVENTORY_VALUE,
    equipment: B.START_EQUIPMENT,
    loans: [], // [{ kind: 'bridge'|'emergency', principal, rate, week }]
    interestOwed: 0,
    unpaidBills: 0,
    ownerCapital: B.START_CASH + B.START_EQUIPMENT + B.START_INVENTORY_VALUE,
    retained: 0,
    funding: 0,
    awareness: B.START_AWARENESS,
    adStock: 0,
    rating: B.START_RATING,
    cooks: B.START_COOKS,
    priceMult: 1,
    rentMult: 1,
    foodHikeWeeks: 0,
    emergencyUsed: false,
    bankrupt: false,
    bankruptWeek: null,
    totals: { sales: 0, ads: 0, discountCost: 0, waste: 0, fixed: 0, food: 0, packaging: 0, commission: 0, interest: 0, penalties: 0, cooks: 0, refunds: 0 },
    flags: { tookBridgeLoan: false, tookSupplierDeal: false, raisedPrice: false },
    history: [],
  };
  return s;
}

function receivableTotal(s) {
  return s.receivables.reduce((a, r) => a + r.amount, 0);
}

function capacity(s, event) {
  const ev = event && B.EVENTS[event.id];
  return s.cooks * B.CAPACITY_PER_COOK * (ev && ev.capacity ? ev.capacity : 1);
}

function adMultiplier(adStock) {
  return 1 + B.AD_MAX_LIFT * (1 - Math.exp(-adStock / B.AD_HALF_SCALE));
}

// Demand the kitchen should EXPECT this week (no random wobble).
// Used for stock buying, bots, advisors and the reveal.
function expectedDemand(s, decisions, event) {
  const ev = (event && B.EVENTS[event.id]) || {};
  let priceMult = s.priceMult;
  if (event && event.bonus === 'price' && decisions.bonus === 'take') priceMult *= 1 + B.PRICE_TEST_LIFT;
  const adStock = s.adStock * (1 - B.AD_STOCK_DECAY) + B.AD_SPEND[decisions.ads];
  const ratingMult = Math.max(0.4, 1 + (s.rating - B.START_RATING) * B.RATING_DEMAND_SLOPE);
  let awareness = s.awareness;
  if (event && event.id === 'rival') awareness *= 1 - B.EVENTS.rival.awarenessCut;
  return (
    awareness *
    B.DISCOUNT_DEMAND[decisions.discount] *
    adMultiplier(adStock) *
    ratingMult *
    (ev.demand || 1) *
    Math.pow(priceMult, -B.PRICE_ELASTICITY)
  );
}

function normaliseDecisions(d) {
  return {
    discount: B.DISCOUNT[d && d.discount] !== undefined ? d.discount : 'none',
    ads: B.AD_SPEND[d && d.ads] !== undefined ? d.ads : 'none',
    stock: B.STOCK[d && d.stock] !== undefined ? d.stock : 'right',
    staff: d && d.staff === 'add' ? 'add' : 'keep',
    bonus: d && d.bonus === 'take' ? 'take' : 'skip',
  };
}

function simulateWeek(state, rawDecisions, event, rng) {
  const s = clone(state);
  if (s.bankrupt) return s;
  const dec = normaliseDecisions(rawDecisions);
  event = event || { id: 'flavour' };
  const ev = B.EVENTS[event.id] || {};
  const w = s.week + 1;
  const startCash = s.cash;
  const startRetained = s.retained;
  const line = { week: w, event: event.id, bonus: event.bonus || null, decisions: dec };

  // 1. Lasting event effects
  if (event.id === 'rival') s.awareness *= 1 - ev.awarenessCut;
  if (event.id === 'rentHike') s.rentMult *= ev.rent;
  if (event.id === 'supplierHike') s.foodHikeWeeks = ev.weeks;

  // 2. Bonus decision
  let loanIn = 0;
  let supplierSpend = 0;
  if (event.bonus === 'loan' && dec.bonus === 'take') {
    loanIn = B.BRIDGE_LOAN_AMOUNT;
    s.loans.push({ kind: 'bridge', principal: loanIn, rate: B.BRIDGE_LOAN_RATE, week: w });
    s.cash += loanIn;
    s.flags.tookBridgeLoan = true;
  }
  if (event.bonus === 'supplier' && dec.bonus === 'take') {
    supplierSpend = B.SUPPLIER_DEAL_COST;
    const units = supplierSpend / (UNIT_FOOD * (1 - B.SUPPLIER_DEAL_DISCOUNT));
    s.cash -= supplierSpend;
    s.invUnits += units;
    s.invValue += supplierSpend;
    s.flags.tookSupplierDeal = true;
  }
  if (event.bonus === 'price' && dec.bonus === 'take') {
    s.priceMult *= 1 + B.PRICE_TEST_LIFT;
    s.flags.raisedPrice = true;
  }

  // 3. Staff
  if (dec.staff === 'add' && s.cooks < B.MAX_COOKS) s.cooks += 1;

  // 4. Demand
  const adSpend = B.AD_SPEND[dec.ads];
  // computed from the untouched start-of-week state (it applies rival/price effects itself)
  const expected = expectedDemand(state, dec, event);
  s.adStock = s.adStock * (1 - B.AD_STOCK_DECAY) + adSpend;
  const demand = Math.max(0, r0(expected * (1 + (rng() * 2 - 1) * B.DEMAND_NOISE)));
  const cap = r0(capacity(s, event));

  // 5. Buy ingredients (paid now, in cash)
  const foodHike = s.foodHikeWeeks > 0 ? B.EVENTS.supplierHike.foodCost : 1;
  const unitCost = UNIT_FOOD * foodHike;
  const planFor = dec.stock === 'heavy' ? expected : Math.min(expected, cap);
  const targetUnits = planFor * B.STOCK[dec.stock];
  const buyUnits = Math.max(0, Math.ceil(targetUnits - s.invUnits));
  const purchase = buyUnits * unitCost;
  s.cash -= purchase;
  s.invUnits += buyUnits;
  s.invValue += purchase;

  // 6. Orders served
  const served = Math.max(0, Math.min(demand, cap, Math.floor(s.invUnits)));
  const avgCost = s.invUnits > 0 ? s.invValue / s.invUnits : unitCost;
  const foodUsed = served * avgCost;
  s.invUnits -= served;
  s.invValue -= foodUsed;
  // unsold perishables are thrown away
  const wastedUnits = s.invUnits * B.PERISHABLE_SHARE;
  const wasteCost = wastedUnits * avgCost;
  s.invUnits -= wastedUnits;
  s.invValue -= wasteCost;
  if (s.invUnits < 1e-6) { s.invUnits = 0; s.invValue = 0; }

  // 7. Sales and the ZipEats payout (arrives later)
  const price = B.MENU_PRICE * s.priceMult;
  const disc = B.DISCOUNT[dec.discount];
  const discPrice = price * (1 - disc);
  const refundShare = event.id === 'refund' ? ev.share : 0;
  const refunded = r0(served * refundShare);
  const paidOrders = served - refunded;
  const sales = served * discPrice;
  const refunds = refunded * discPrice;
  const commission = paidOrders * discPrice * B.COMMISSION_PCT;
  const platformFees = paidOrders * B.PLATFORM_FEE;
  const netPayout = paidOrders * discPrice - commission - platformFees;
  const discountCost = served * price * disc;

  // 8. Costs paid this week in cash
  const packaging = served * B.PACKAGING;
  const rent = B.RENT * s.rentMult;
  const extraCooks = Math.max(0, s.cooks - B.START_COOKS);
  const cookCost = extraCooks * B.EXTRA_COOK;
  const fixed = rent + B.BASE_STAFF + B.UTILITIES;
  const interest = s.loans.reduce((a, l) => a + l.principal * l.rate, 0);
  let penalty = 0;
  if (event.id === 'hygiene' && s.rating < ev.lowRating) penalty = ev.penalty;
  s.cash -= packaging + adSpend + fixed + cookCost + interest + penalty;

  // 9. ZipEats pays out what is due (a settlement delay holds this week's payout)
  if (event.id === 'settlement') {
    s.receivables.forEach((r) => { if (r.due <= w) r.due = w + ev.extraWeeks; });
  }
  s.receivables.push({ amount: netPayout, due: w + B.PAYOUT_DELAY_WEEKS });
  let collected = 0;
  s.receivables = s.receivables.filter((r) => {
    if (r.due <= w) { collected += r.amount; return false; }
    return true;
  });
  s.cash += collected;

  // 10. Wear and tear
  s.equipment -= B.DEPRECIATION_PER_WEEK;

  // 11. Profit & loss (accrual basis: sales count now, cash later)
  const profit = netPayout - foodUsed - wasteCost - packaging - adSpend - fixed - cookCost - interest - penalty - B.DEPRECIATION_PER_WEEK;
  s.retained += profit;

  // 12. Rating and awareness for next week
  const serviceRatio = demand > 0 ? served / demand : 1;
  if (serviceRatio < 0.97) s.rating -= Math.min(0.5, (1 - serviceRatio) * B.RATING_STOCKOUT_PENALTY);
  else s.rating += (B.RATING_TARGET - s.rating) * B.RATING_RECOVERY;
  if (event.id === 'monsoon' && serviceRatio < 1) s.rating -= ev.ratingHit;
  if (event.id === 'hygiene' && state.rating < ev.lowRating) s.rating -= ev.ratingHit;
  s.rating = clamp(s.rating, B.RATING_MIN, B.RATING_MAX);

  const womFactor = clamp((s.rating - 3.2) / 1.3, 0, 1.2);
  s.awareness = s.awareness * (1 - B.ORGANIC_DECAY) + B.WORD_OF_MOUTH * served * womFactor + adSpend * B.AD_TO_AWARENESS;
  if (event.id === 'viral') s.awareness *= 1 + ev.awarenessBoost;
  if (event.id === 'hygiene' && state.rating >= ev.highRating) s.awareness *= 1 + ev.awarenessBoost;
  if (s.foodHikeWeeks > 0) s.foodHikeWeeks -= 1;

  // 13. Running out of cash
  const cashBeforeRescue = s.cash;
  let rescue = 0;
  if (s.cash < 0) {
    if (!s.emergencyUsed) {
      // The lender sizes the rescue to carry the kitchen to at least week
      // EMERGENCY_MIN_WEEK, so no room can crash the game early.
      const weeklyBurn = Math.max(0, startCash + loanIn - cashBeforeRescue);
      const weeksToCover = Math.max(0, (s.rescueCarryTo || B.EARLIEST_CLOSURE_WEEK) - w);
      rescue = -s.cash + Math.max(B.EMERGENCY_CUSHION, weeklyBurn * weeksToCover);
      s.loans.push({ kind: 'emergency', principal: rescue, rate: B.EMERGENCY_RATE, week: w });
      s.cash += rescue;
      s.emergencyUsed = true;
    } else if (w < B.EARLIEST_CLOSURE_WEEK) {
      // Too early to close: the lender tops up the same rescue loan.
      rescue = -s.cash + B.EMERGENCY_CUSHION;
      const loan = s.loans.find((l) => l.kind === 'emergency');
      loan.principal += rescue;
      s.cash += rescue;
    } else {
      s.bankrupt = true;
      s.bankruptWeek = w;
      s.unpaidBills = -s.cash;
      s.cash = 0;
    }
  }

  // 14. Totals and history
  const T = s.totals;
  T.sales += sales; T.ads += adSpend; T.discountCost += discountCost; T.waste += wasteCost;
  T.fixed += fixed; T.food += foodUsed; T.packaging += packaging; T.commission += commission + platformFees;
  T.interest += interest; T.penalties += penalty; T.cooks += cookCost; T.refunds += refunds;

  s.week = w;
  Object.assign(line, {
    demand, expected: r0(expected), capacity: cap, orders: served, unserved: Math.max(0, demand - served),
    sales: r0(sales), refunds: r0(refunds), netPayout: r0(netPayout), discountCost: r0(discountCost),
    costs: {
      ingredients: r0(purchase), packaging: r0(packaging), commission: r0(commission + platformFees),
      discount: r0(discountCost), ads: adSpend, staff: r0(B.BASE_STAFF + cookCost), rent: r0(rent),
      utilities: B.UTILITIES, wastage: r0(wasteCost), interest: r0(interest), penalty,
      supplierDeal: supplierSpend,
    },
    collected: r0(collected), loanIn, rescue: r0(rescue),
    startCash: r0(startCash), cashBeforeRescue: r0(cashBeforeRescue), cash: r0(s.cash),
    receivable: r0(receivableTotal(s)), inventory: r0(s.invValue),
    profit: r0(s.retained - startRetained), rating: +s.rating.toFixed(2), cooks: s.cooks,
    bankrupt: s.bankrupt,
  });
  s.history.push(line);
  return s;
}

// Funding from the investor (only in the best ending). Cash in, equity up.
function applyInvestorFunding(state) {
  const s = clone(state);
  s.cash += B.INVESTOR_FUNDING;
  s.funding += B.INVESTOR_FUNDING;
  return s;
}

function balanceSheet(s) {
  const bridge = s.loans.filter((l) => l.kind === 'bridge').reduce((a, l) => a + l.principal, 0);
  const emergency = s.loans.filter((l) => l.kind === 'emergency').reduce((a, l) => a + l.principal, 0);
  const assets = {
    cash: s.cash,
    receivable: receivableTotal(s),
    inventory: s.invValue,
    equipment: s.equipment,
  };
  const liabilities = {
    bridgeLoan: bridge,
    emergencyLoan: emergency,
    interestOwed: s.interestOwed,
    unpaidBills: s.unpaidBills,
  };
  const equity = {
    ownerCapital: s.ownerCapital,
    retained: s.retained,
    funding: s.funding,
  };
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const totalAssets = sum(assets);
  const totalLiabilities = sum(liabilities);
  const totalEquity = sum(equity);
  return {
    assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity,
    balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1,
  };
}

// Weeks of cash left at the recent burn rate (Infinity if cash is growing).
function runwayWeeks(s) {
  const h = s.history;
  if (h.length === 0) return Infinity;
  const recent = h.slice(-2);
  const burn = recent.reduce((a, l) => a + (l.cashBeforeRescue - l.startCash - l.loanIn), 0) / recent.length;
  if (burn >= 0) return Infinity;
  return Math.max(0, s.cash / -burn);
}

module.exports = {
  initialState, simulateWeek, expectedDemand, balanceSheet, applyInvestorFunding,
  receivableTotal, capacity, runwayWeeks, normaliseDecisions, UNIT_FOOD,
};
