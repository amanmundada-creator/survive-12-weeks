// Sample end states for every ending, for the /ending-preview rehearsal page.
const { runGame, goalFor } = require('./runner');
const { CRAFTED, balanced } = require('./strategies');
const { endingContent, ENDING_ORDER } = require('./endings');
const { balanceSheet } = require('./sim');
const { buildSchedule } = require('./events');
const { chartSeries } = require('./game');

const cache = {};

function previewEndings(weeks = 12) {
  if (cache[weeks]) return cache[weeks];
  const goal = goalFor(weeks);
  const out = [];
  for (const id of ENDING_ORDER) {
    let found = null;
    for (let seed = 1; seed <= 600 && !found; seed++) {
      const r = runGame({ weeks, seed, strategy: CRAFTED[id] });
      if (r.ending === id) found = { ...r, seed };
    }
    if (!found && weeks !== 12) { out.push(...previewEndings(12).filter((e) => e.id === id)); continue; }
    if (!found) continue;
    const ctx = { weeks, goal };
    const comp = runGame({ weeks, seed: found.seed, strategy: balanced, schedule: buildSchedule(weeks, found.seed) });
    const compContent = endingContent(comp.ending, comp.state, ctx);
    out.push({
      id, seed: found.seed, weeks, goal,
      content: endingContent(id, found.state, ctx),
      sheet: balanceSheet(found.state),
      chart: chartSeries(found.state),
      comparison: { id: comp.ending, title: compContent.title, theme: compContent.theme, sheet: balanceSheet(comp.state), history: chartSeries(comp.state), lastOrders: comp.state.history[comp.state.history.length - 1].orders },
      stats: {
        roomAccuracy: 0.58, majorityAccuracy: 0.5, mostTrusted: 'growth', mostRight: 'finance',
        advisorStats: { growth: { right: 2, trusted: 6 }, ops: { right: 4, trusted: 3 }, finance: { right: 6, trusted: 3 } },
        names: { growth: 'Rocket Rhea', ops: 'Steady Sam', finance: 'Penny Priya' },
      },
      podium: [{ nick: 'Spicy Samosa', score: 1240 }, { nick: 'Turbo Tiffin', score: 1105 }, { nick: 'Masala Momo', score: 980 }],
    });
  }
  cache[weeks] = out;
  return out;
}

module.exports = { previewEndings };
