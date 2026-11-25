// ─────────────────────────────────────────────────────────────
// ALL TUNABLE NUMBERS LIVE HERE.
// Change a number, then run `npm run balance` to see the effect.
// Money is in rupees. "Week" = one round of the game.
// ─────────────────────────────────────────────────────────────

module.exports = {
  // ── Starting position ──
  START_CASH: 500000,
  START_EQUIPMENT: 150000,
  DEPRECIATION_PER_WEEK: 3000,
  START_INVENTORY_VALUE: 20000, // ingredients already on the shelf
  START_COOKS: 2,
  MAX_COOKS: 7,
  START_RATING: 4.3,
  START_AWARENESS: 520, // ≈ orders/week you'd get with no discount and no ads

  // ── Unit economics (per order) ──
  MENU_PRICE: 350,
  FOOD_COST_PCT: 0.36, // of menu price → ₹126 of ingredients per order
  PACKAGING: 14,
  COMMISSION_PCT: 0.25, // ZipEats commission on the DISCOUNTED price
  PLATFORM_FEE: 12, // ZipEats flat fee per order

  // ── Fixed weekly costs ──
  RENT: 22000,
  BASE_STAFF: 28000, // covers the starting 2 cooks
  UTILITIES: 8000,
  EXTRA_COOK: 5500,
  CAPACITY_PER_COOK: 450,

  // ── Decision options ──
  DISCOUNT: { none: 0, d10: 0.10, d30: 0.30 },
  DISCOUNT_DEMAND: { none: 1.0, d10: 1.3, d30: 1.9 },
  AD_SPEND: { none: 0, small: 15000, big: 45000 },
  // Stock: how many ingredient-sets to have on the shelf, as a multiple of
  // expected orders. Lean/right look at what the kitchen can actually cook;
  // heavy buys for every order customers *might* want.
  STOCK: { lean: 0.9, right: 1.05, heavy: 1.4 },

  // ── Demand model ──
  ORGANIC_DECAY: 0.06, // awareness lost per week to competition
  WORD_OF_MOUTH: 0.036, // awareness gained per order served (scaled by rating)
  AD_TO_AWARENESS: 1 / 450, // permanent awareness per rupee of ads
  AD_STOCK_DECAY: 0.15, // ad "buzz" fades 15% a week
  AD_MAX_LIFT: 0.55, // ads can lift demand by at most +55%
  AD_HALF_SCALE: 70000, // diminishing returns scale for ad buzz
  DEMAND_NOISE: 0.07, // ± random wobble on demand each week
  RATING_DEMAND_SLOPE: 0.25, // each rating star above/below 4.3 moves demand 25%
  PRICE_ELASTICITY: 1.5, // +5% price → about −7% orders

  // ── Stock ──
  PERISHABLE_SHARE: 0.6, // 60% of unsold stock is thrown away, 40% keeps

  // ── Rating ──
  RATING_TARGET: 4.7,
  RATING_RECOVERY: 0.12,
  RATING_STOCKOUT_PENALTY: 1.6,
  RATING_MIN: 2.5,
  RATING_MAX: 4.9,

  // ── Cash timing ──
  PAYOUT_DELAY_WEEKS: 1, // ZipEats pays a week's sales at the end of the NEXT week

  // ── Loans ──
  BRIDGE_LOAN_AMOUNT: 300000, // the optional boardroom loan
  BRIDGE_LOAN_RATE: 0.025, // per week
  EMERGENCY_CUSHION: 40000, // automatic one-time rescue: covers the hole + this much,
  // or enough to carry the kitchen to about the middle of the game at its current burn
  EARLIEST_CLOSURE_WEEK: 5, // the kitchen can never close before this week
  EMERGENCY_RATE: 0.06, // per week (harsh)

  // ── Bonus decisions ──
  SUPPLIER_DEAL_COST: 90000,
  SUPPLIER_DEAL_DISCOUNT: 0.2, // bulk pack is 20% cheaper per order
  PRICE_TEST_LIFT: 0.05,

  // ── Events ──
  EVENTS: {
    viral: { demand: 1.4, awarenessBoost: 0.06 },
    monsoon: { demand: 1.15, capacity: 0.85, ratingHit: 0.15 },
    rival: { awarenessCut: 0.08 },
    supplierHike: { foodCost: 1.1, weeks: 2 },
    rentHike: { rent: 1.15 },
    hygiene: { lowRating: 3.9, penalty: 25000, ratingHit: 0.2, highRating: 4.4, awarenessBoost: 0.05 },
    festival: { demand: 1.25 },
    refund: { share: 0.08 },
    settlement: { extraWeeks: 1 },
  },

  // ── Investor ending ──
  INVESTOR_FUNDING: 1000000,

  // ── Goal: orders per week to reach in the final week, by game length ──
  GOAL_BY_LENGTH: { 6: 850, 8: 1000, 12: 1150 },
};
