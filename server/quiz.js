// Kahoot-style ACCOUNTING questions, told through the kitchen's own story.
// Every answer is known the moment the timer ends. Each game uses each
// question at most once, and the answer order is shuffled per game.
//
// Format: [id, category, question, options (CORRECT ONE FIRST), why, noShuffle?]
const { makeRng } = require('./rng');

const STATIC = [
  // ── words accountants use ──
  ['payday', 'terms', 'ZipEats will pay you ₹2,40,000 next Tuesday for this week’s orders. Until it lands in your bank, that money is called…', ['Accounts receivable', 'Accounts payable', 'Revenue in the bank', 'Prepaid expense'], 'Money someone owes YOU is accounts receivable: it’s an asset, but it isn’t cash yet.'],
  ['payable', 'terms', 'You got ₹60,000 of vegetables today but will pay the supplier next Friday. That ₹60,000 is…', ['Accounts payable', 'Accounts receivable', 'Inventory', 'Revenue'], 'Money YOU owe a supplier is accounts payable, a liability.'],
  ['prepaid', 'terms', 'You pay 3 months’ rent (₹66,000) in advance today. The part you haven’t used yet is…', ['A prepaid expense (an asset)', 'A liability', 'Revenue', 'Depreciation'], 'Rent paid in advance is an asset until you use it up, month by month.'],
  ['unearned', 'terms', 'An office pays you ₹50,000 today for a lunch party you’ll cook next month. Until you cook it, that ₹50,000 is…', ['Unearned revenue (a liability)', 'Revenue', 'Accounts receivable', 'Profit'], 'You still owe them the food, so it’s a liability until you deliver.'],
  ['accrued', 'terms', 'Your cooks worked all week, but salaries are paid on the 1st of next month. The salary you owe right now is…', ['An accrued expense (liability)', 'A prepaid expense', 'Accounts receivable', 'Revenue'], 'Costs you’ve incurred but not yet paid are accrued expenses, a liability.'],
  ['cogs', 'terms', 'The ingredients and packaging used to make the food you sold are called…', ['Cost of goods sold (COGS)', 'Fixed costs', 'Overheads', 'Capital expenditure'], 'COGS are the direct costs of what you sold. Sales minus COGS is gross profit.'],
  ['variable', 'terms', 'Which cost goes UP when you sell more orders?', ['Packaging', 'Rent', 'The manager’s salary', 'Equipment depreciation'], 'Packaging, food and ZipEats’ cut are variable costs: they grow with every order.'],
  ['fixed', 'terms', 'Which of these is a FIXED cost for the kitchen?', ['Rent', 'Ingredients', 'Packaging', 'ZipEats commission'], 'Rent is the same whether you sell 10 orders or 1,000. That’s a fixed cost.'],
  ['commissionType', 'terms', 'ZipEats keeps 25% of every order. That commission is a…', ['Variable cost', 'Fixed cost', 'Asset', 'Liability'], 'It rises and falls with your sales, so it’s a variable cost.'],
  ['capex', 'terms', 'You buy a new ₹80,000 tandoor that will last 5 years. In accounting, that’s…', ['Capital expenditure (an asset)', 'An expense this week', 'Cost of goods sold', 'A liability'], 'Things that last years are capitalised as assets, then depreciated over time.'],
  ['workingCapital', 'terms', 'Current assets minus current liabilities is called…', ['Working capital', 'Net profit', 'Equity', 'Gross margin'], 'Working capital shows if you can cover short-term bills with short-term assets.'],
  ['liquidity', 'terms', 'Being able to pay the bills that are due THIS week is called…', ['Liquidity', 'Profitability', 'Depreciation', 'Solvency'], 'Liquidity is about cash available now. A profitable kitchen can still be illiquid.'],
  ['cashBasis', 'terms', 'Recording a sale only when the cash actually arrives is called…', ['Cash-basis accounting', 'Accrual accounting', 'Double-entry', 'Depreciation'], 'Cash basis follows the bank. Accrual records sales when they’re earned.'],
  ['doubleEntry', 'terms', 'In double-entry bookkeeping, every transaction changes at least…', ['Two accounts', 'One account', 'Three accounts', 'Only the bank account'], 'Every entry has two sides, a debit and a credit. That’s why the books balance.'],

  // ── the financial statements ──
  ['equation', 'statements', 'The accounting equation: Assets = …', ['Liabilities + Equity', 'Revenue − Expenses', 'Cash + Profit', 'Sales × Margin'], 'Everything you own was paid for by borrowing (liabilities) or by owners and profits (equity).'],
  ['plStatement', 'statements', 'Which statement tells you whether the kitchen made a PROFIT this week?', ['Profit & loss statement', 'Balance sheet', 'Cash flow statement', 'Bank statement'], 'The P&L (income statement) shows revenue minus expenses over a period.'],
  ['cfStatement', 'statements', 'Which statement shows how much CASH actually came in and went out?', ['Cash flow statement', 'Profit & loss statement', 'Balance sheet', 'Trial balance'], 'Profit and cash differ. The cash flow statement follows the actual money.'],
  ['bsSnapshot', 'statements', 'A balance sheet shows…', ['What you own and owe at one moment', 'Your sales over the week', 'Cash in and out this week', 'Your daily order count'], 'It’s a snapshot on one date. The P&L and cash flow cover a period.'],
  ['retained', 'statements', 'Profits the kitchen earned and kept show up on the balance sheet as…', ['Retained earnings (equity)', 'Accounts receivable', 'Revenue', 'A liability'], 'Kept profits build up on the owner’s side as retained earnings.'],
  ['ownerCapital', 'statements', 'The ₹5,00,000 the owner put in to start the kitchen is recorded as…', ['Owner’s capital (equity)', 'Revenue', 'A liability', 'Profit'], 'Money the owner invests is equity, not income.'],
  ['depreciation', 'statements', 'Your ₹1,50,000 equipment loses ₹3,000 of value every week. Recording that is called…', ['Depreciation', 'Amortisation of goodwill', 'Inflation', 'A write-up'], 'Depreciation spreads an asset’s cost over its life. It’s an expense, but no cash leaves.'],
  ['inventory', 'statements', 'Dry ingredients still on your shelf at the end of the week appear on the balance sheet as…', ['Inventory (a current asset)', 'An expense', 'A liability', 'Equity'], 'Unused stock is inventory, an asset, but it’s cash you’ve already spent.'],
  ['waste', 'statements', '₹12,000 of vegetables spoiled and were thrown away. In the books that’s…', ['An expense that reduces profit', 'An asset', 'Revenue', 'A liability'], 'Spoiled stock is written off as an expense. The cash is already gone.'],
  ['loanNotIncome', 'statements', 'You take a ₹3,00,000 bank loan. What happens to your PROFIT that week?', ['No change: a loan isn’t income', 'Up ₹3,00,000', 'Down ₹3,00,000', 'It doubles'], 'Cash and liabilities both rise by ₹3 lakh. Only the interest will be an expense.'],

  // ── quick maths (the competitive ones) ──
  ['grossProfit', 'calc', 'Sales this week ₹2,00,000. Food and packaging used ₹80,000. Your gross profit is…', ['₹1,20,000', '₹2,80,000', '₹80,000', '₹2,00,000'], 'Gross profit = sales − cost of goods sold = ₹2,00,000 − ₹80,000.'],
  ['grossMargin', 'calc', 'Sales ₹2,00,000, gross profit ₹1,20,000. Your gross margin is…', ['60%', '40%', '120%', '6%'], 'Gross margin = gross profit ÷ sales = ₹1,20,000 ÷ ₹2,00,000 = 60%.'],
  ['contribution', 'calc', 'A ₹350 order: food ₹126, packaging ₹14, ZipEats takes ₹99.50. What’s left from each order?', ['About ₹110', 'About ₹224', 'About ₹350', 'About ₹14'], 'That ₹110 is the contribution per order: what’s left to pay rent and salaries.'],
  ['breakeven', 'calc', 'Fixed costs are ₹58,000 a week and each order contributes ₹110. About how many orders a week to break even?', ['About 530', 'About 110', 'About 5,800', 'About 58'], 'Break-even = fixed costs ÷ contribution per order = ₹58,000 ÷ ₹110 ≈ 527.'],
  ['netProfit', 'calc', 'Gross profit ₹1,20,000. Rent, staff and utilities ₹58,000. Ads ₹15,000. Net profit?', ['₹47,000', '₹1,20,000', '₹62,000', '₹1,93,000'], 'Net profit = gross profit − operating expenses = ₹1,20,000 − ₹73,000.'],
  ['currentRatio', 'calc', 'Current assets ₹4,00,000, current liabilities ₹2,00,000. Your current ratio is…', ['2', '0.5', '₹2,00,000', '200'], 'Current ratio = current assets ÷ current liabilities. Above 1 means you can cover your short-term bills.'],
  ['runway', 'calc', 'You have ₹3,00,000 cash and lose ₹60,000 of cash every week. How many weeks of runway?', ['5', '3', '6', '18'], 'Runway = cash ÷ weekly cash burn = ₹3,00,000 ÷ ₹60,000.'],
  ['interest', 'calc', 'A ₹3,00,000 loan at 2.5% a WEEK. What’s the interest expense each week?', ['₹7,500', '₹2,500', '₹75,000', '₹30,000'], '2.5% × ₹3,00,000 = ₹7,500 every week, about 130% a year.'],
  ['discountRevenue', 'calc', 'A ₹350 dish sold at 30% off. How much revenue do you record per order (before ZipEats’ cut)?', ['₹245', '₹350', '₹105', '₹315'], '₹350 − 30% = ₹245. Discounts reduce revenue; ZipEats then takes 25% of that.'],
  ['cashVsProfit', 'calc', 'This week: profit ₹40,000, but ZipEats still owes you ₹1,00,000 more than last week. Roughly what happened to your cash?', ['It went DOWN about ₹60,000', 'It went UP ₹40,000', 'It went UP ₹1,40,000', 'No change'], 'Profit ₹40,000 − ₹1,00,000 more stuck in receivables ≈ ₹60,000 less cash.'],

  // ── profit vs cash ──
  ['accrual', 'cashflow', 'You sold ₹2,00,000 of food this week. ZipEats pays next week. Under accrual accounting, when is the sale recorded?', ['This week', 'Next week, when the cash arrives', 'At the end of the year', 'Never'], 'Revenue is recorded when it’s earned, not when cash arrives. That’s why profit ≠ cash.'],
  ['profitCash', 'cashflow', 'True or false: a business can show a PROFIT and still run out of CASH.', ['True', 'False'], 'True. Profit counts sales today; cash can arrive weeks later. Growing businesses die in that gap.', true],
  ['receivableGrows', 'cashflow', 'Your orders double, and ZipEats always pays a week late. What happens to your accounts receivable?', ['It grows', 'It shrinks', 'It stays the same', 'It becomes a liability'], 'More sales waiting to be paid means more money stuck as receivables, and less cash today.'],
  ['payableHelps', 'cashflow', 'Which helps your CASH this week the most?', ['Paying suppliers 2 weeks later', 'Paying suppliers early for a small discount', 'Buying extra stock now', 'Prepaying 3 months’ rent'], 'Delaying payables keeps cash in your bank longer (as long as suppliers agree).'],
];

// Accounting questions tied to this week's event (asked when it happens)
const EVENT_Q = {
  settlement: ['payoutHold', 'cashflow', 'ZipEats is holding this week’s payout. On your balance sheet, that money stays as…', ['Accounts receivable', 'Cash', 'Lost revenue', 'Accounts payable'], 'It’s still owed to you. Your sales count, but your bank doesn’t see the cash yet.'],
  rival: ['rivalFixed', 'calc', 'A rival opens and your orders fall, but rent stays the same. Your fixed cost PER ORDER…', ['Goes up', 'Goes down', 'Stays the same', 'Disappears'], 'The same rent spread over fewer orders means a higher fixed cost per order.'],
  rentHike: ['rentLine', 'statements', 'Rent goes up 15%. Which part of the profit & loss statement rises?', ['Operating expenses (overheads)', 'Cost of goods sold', 'Revenue', 'Retained earnings'], 'Rent is an operating expense, not part of the cost of the food itself.'],
  viral: ['viralCosts', 'terms', 'Your reel goes viral and orders jump 40%. Which costs jump with them?', ['Variable costs: food, packaging, commission', 'Fixed costs: rent and salaries', 'Equipment', 'Owner’s capital'], 'Variable costs move with orders. Rent and salaries don’t.'],
  supplierHike: ['hikeMargin', 'calc', 'Ingredient prices rise 10% and your menu price stays the same. Your gross margin…', ['Falls', 'Rises', 'Stays the same', 'Doubles'], 'Higher COGS on the same price leaves less gross profit per order.'],
  refund: ['refundRevenue', 'statements', 'ZipEats refunds 8% of orders for cold food. Refunds reduce your…', ['Revenue', 'Equipment', 'Owner’s capital', 'Liabilities'], 'Refunds come straight off revenue. And you’ve still paid for the food.'],
  hygiene: ['fineExpense', 'statements', 'A ₹25,000 hygiene fine is recorded as…', ['An expense that reduces profit', 'An asset', 'Revenue', 'Owner’s capital'], 'Fines are expenses. They lower profit and cash at the same time.'],
  monsoon: ['lostSales', 'terms', 'Riders are scarce and you turn customers away. Those lost sales are recorded as…', ['Nothing: they never happened', 'Accounts receivable', 'Revenue', 'A liability'], 'The books only record what happened. Missed sales never show up, which is why capacity matters.'],
};

// Turn a stored question into a playable one, shuffling the answers per game.
function build(q, rng) {
  const [id, cat, text, options, why, noShuffle] = q;
  const order = options.map((_, i) => i);
  if (!noShuffle) for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return { id, cat, text, options: order.map((i) => options[i]), correct: order.indexOf(0), why };
}

// Week 1 is always the receivable question; an event week asks about that
// event; otherwise rotate topics, never repeating a question or a topic twice
// in a row.
function pickQuiz({ week, seed, event, used, lastCat }) {
  const rng = makeRng(seed * 131 + week * 977);
  if (week === 1 && !used.includes('payday')) return build(STATIC[0], rng);
  const ev = event && EVENT_Q[event.id];
  if (ev && !used.includes(ev[0])) return build(ev, rng);
  const pool = STATIC.filter((q) => !used.includes(q[0]));
  let fresh = pool.filter((q) => q[1] !== lastCat);
  if (!fresh.length) fresh = pool.length ? pool : STATIC;
  return build(fresh[Math.floor(rng() * fresh.length)], rng);
}

module.exports = { pickQuiz, STATIC, EVENT_Q, build };
