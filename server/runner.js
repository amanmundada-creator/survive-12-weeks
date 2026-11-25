// Run a whole game with a fixed strategy (no audience). Used by the
// balance script, tests, and the "smarter path" comparison.
const { initialState, simulateWeek, applyInvestorFunding } = require('./sim');
const { buildSchedule } = require('./events');
const { weekRng, makeRng } = require('./rng');
const { classifyEnding } = require('./endings');
const B = require('./balance');

function goalFor(weeks) {
  return B.GOAL_BY_LENGTH[weeks] || Math.round(1000 + (weeks - 6) * 85);
}

function runGame({ weeks = 12, seed = 1, strategy, schedule }) {
  schedule = schedule || buildSchedule(weeks, seed);
  const choiceRng = makeRng(seed * 13 + 7);
  let s = initialState({ weeks });
  for (let w = 1; w <= weeks; w++) {
    const ev = schedule[w - 1];
    const d = strategy(s, ev, choiceRng);
    s = simulateWeek(s, d, ev, weekRng(seed, w));
    if (s.bankrupt) break;
  }
  return finishGame(s, { weeks, goal: goalFor(weeks) });
}

function finishGame(state, ctx) {
  const ending = classifyEnding(state, ctx);
  const s = ending === 'scaled' ? applyInvestorFunding(state) : state;
  return { state: s, ending };
}

module.exports = { runGame, finishGame, goalFor };
