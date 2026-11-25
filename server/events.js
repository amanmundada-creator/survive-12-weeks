// Event catalogue and the seeded, fair weekly schedule.
const { makeRng } = require('./rng');

const EVENT_INFO = {
  flavour: { tone: 'neutral', art: 'kitchen' },
  viral: { tone: 'good', art: 'phone', title: 'Viral reel!', headline: 'A food blogger’s reel of our biryani hits 2 million views', effect: 'Demand +40% this week. Can the kitchen keep up?' },
  festival: { tone: 'good', art: 'lantern', title: 'Festival weekend', headline: 'Festival weekend: the whole city is ordering in', effect: 'Demand +25% this week.' },
  monsoon: { tone: 'bad', art: 'rain', title: 'Monsoon week', headline: 'Monsoon forecast: everyone orders in, but riders are scarce', effect: 'Demand +15%, but delivery capacity −15%. Ratings at risk.' },
  rival: { tone: 'bad', art: 'rival', title: 'Rival opens next door', headline: '“Biryani Bros” cloud kitchen opens 400 metres away', effect: 'Organic demand permanently −8%.' },
  supplierHike: { tone: 'bad', art: 'onion', title: 'Supplier price hike', headline: 'Onion and oil prices jump at the mandi', effect: 'Ingredient cost +10% for the next 2 weeks.' },
  rentHike: { tone: 'bad', art: 'building', title: 'Rent hike notice', headline: 'Landlord letter: “Rent goes up 15%, effective now.”', effect: 'Rent +15% from this week, forever.' },
  hygiene: { tone: 'mixed', art: 'clipboard', title: 'Hygiene inspection', headline: 'Food-safety inspector spotted in the lane', effect: 'Low rating → ₹25,000 fine. High rating → a shiny badge and a demand boost.' },
  refund: { tone: 'bad', art: 'refund', title: 'Refund spike', headline: 'Cold-food complaints: ZipEats auto-refunds customers', effect: '8% of this week’s orders are refunded. You still paid for the food.' },
  settlement: { tone: 'bad', art: 'truck', title: 'Payout delayed!', headline: 'ZipEats: “Payouts held one extra week for a system upgrade.”', effect: 'The money you were expecting this week arrives NEXT week instead.' },
};

const NEGATIVE = new Set(['monsoon', 'rival', 'supplierHike', 'rentHike', 'refund', 'settlement']);
const RANDOM_POOL = ['viral', 'festival', 'monsoon', 'rival', 'supplierHike', 'rentHike', 'hygiene', 'refund'];

const FLAVOUR_HEADLINES = [
  'Office lunch rush is back after the long weekend',
  'Cricket final on Sunday: the city plans to stay home',
  'Food delivery app ratings now shown in bigger stars',
  'Local influencer asks: “Best butter chicken under ₹400?”',
  'College exams week: late-night maggi demand expected',
  'Weather: clear skies, nothing unusual',
  'Your head cook asks for a new tandoor (you say “later”)',
  'A regular customer leaves a 5-star review with 3 heart emojis',
  'ZipEats sends a newsletter: “Grow faster with discounts!”',
  'Wedding season begins; party orders are in the air',
];

const BONUS_INFO = {
  loan: {
    title: 'Boardroom: Bridge Loan offer',
    question: 'A lender offers ₹3,00,000 today. Take it?',
    options: { take: 'Take the loan', skip: 'No thanks' },
    hints: { take: '2.5% interest every week. Stays on your books.', skip: 'No new debt.' },
    art: 'bank',
  },
  supplier: {
    title: 'Boardroom: Supplier Deal',
    question: 'Buy a bulk pack of ingredients for ₹90,000 at 20% off?',
    options: { take: 'Buy the bulk pack', skip: 'Skip it' },
    hints: { take: 'Cheaper food later, cash leaves today.', skip: 'Keep the cash.' },
    art: 'sack',
  },
  price: {
    title: 'Boardroom: Menu Price Test',
    question: 'Raise menu prices by 5% from now on?',
    options: { take: 'Raise prices 5%', skip: 'Keep prices' },
    hints: { take: 'Better margin, a few fewer orders.', skip: 'Same price, same margin.' },
    art: 'menu',
  },
};

// Build the week-by-week schedule for a game.
// Rules: week 1 is calm; never two negative events in a row; at least one
// settlement delay ("cash trap") in the middle third; boardroom bonus
// decisions at about 1/3 and 2/3 of the game.
function buildSchedule(weeks, seed) {
  const rng = makeRng(Number(seed) * 31 + weeks);
  const third = weeks / 3;
  const midStart = Math.max(2, Math.floor(third) + 1);
  const midEnd = Math.max(midStart, Math.ceil(2 * third));
  const trapWeek = midStart + rng.int(midEnd - midStart + 1);
  const board1 = Math.max(2, Math.round(third));
  let board2 = Math.round(2 * third);
  if (board2 === board1) board2 += 1;
  const bonusPool = ['supplier', 'price'];
  const secondBonus = rng.pick(bonusPool);
  const flavours = FLAVOUR_HEADLINES.slice();
  const schedule = [];
  for (let w = 1; w <= weeks; w++) {
    let id = 'flavour';
    if (w === trapWeek) id = 'settlement';
    else if (w > 1 && w !== weeks && w + 1 !== trapWeek && rng() < 0.62) {
      const prevNeg = schedule[w - 2] && NEGATIVE.has(schedule[w - 2].id);
      const nextIsTrap = w + 1 === trapWeek;
      const used = new Set(schedule.map((e) => e.id));
      let pool = RANDOM_POOL.filter((e) => !used.has(e) || e === 'festival');
      if (prevNeg || nextIsTrap) pool = pool.filter((e) => !NEGATIVE.has(e));
      if (pool.length) id = rng.pick(pool);
    }
    const ev = { week: w, id, bonus: null };
    if (w === board1) ev.bonus = 'loan';
    else if (w === board2 && weeks >= 6) ev.bonus = secondBonus;
    if (id === 'flavour') {
      const i = rng.int(flavours.length);
      ev.headline = flavours.splice(i, 1)[0] || 'Another week in the kitchen';
    } else {
      ev.headline = EVENT_INFO[id].headline;
    }
    schedule.push(ev);
  }
  // The final week is Investor Demo Day.
  schedule[weeks - 1].demoDay = true;
  return schedule;
}

module.exports = { EVENT_INFO, BONUS_INFO, NEGATIVE, buildSchedule, FLAVOUR_HEADLINES };
