// npm run balance  →  plays thousands of seeded games with fixed strategies
// and prints how they end. Use it after changing server/balance.js.
//   node scripts/balance.js [games-per-strategy] [weeks]
const { runGame } = require('../server/runner');
const { STRATEGIES } = require('../server/strategies');
const { META, ENDING_ORDER } = require('../server/endings');
const { balanceSheet } = require('../server/sim');

const GAMES = Number(process.argv[2]) || 2000;
const LENGTHS = process.argv[3] ? [Number(process.argv[3])] : [6, 8, 12];
const pct = (a, b) => (b ? ((100 * a) / b).toFixed(0).padStart(3) + '%' : '  - ');

function report(weeks) {
  console.log(`\n══════════ ${weeks}-week game · ${GAMES} seeded games per strategy ══════════`);
  const summary = {};
  for (const [name, strat] of Object.entries(STRATEGIES)) {
    const endings = {};
    const bankruptWeeks = {};
    let goal = 0, survived = 0, unbalanced = 0, minBankrupt = Infinity, rescued = 0;
    for (let seed = 1; seed <= GAMES; seed++) {
      const { state, ending } = runGame({ weeks, seed, strategy: strat });
      endings[ending] = (endings[ending] || 0) + 1;
      if (state.bankrupt) {
        bankruptWeeks[state.bankruptWeek] = (bankruptWeeks[state.bankruptWeek] || 0) + 1;
        minBankrupt = Math.min(minBankrupt, state.bankruptWeek);
      } else survived++;
      if (state.emergencyUsed) rescued++;
      if (ending === 'scaled') goal++;
      if (!balanceSheet(state).balanced) unbalanced++;
    }
    summary[name] = { survived, goal, minBankrupt };
    console.log(`\n▸ ${name.toUpperCase()}   survived ${pct(survived, GAMES)} · hit goal ${pct(goal, GAMES)} · needed emergency loan ${pct(rescued, GAMES)} · earliest bankruptcy ${minBankrupt === Infinity ? 'never' : 'week ' + minBankrupt}${unbalanced ? ` · ⚠ ${unbalanced} UNBALANCED` : ''}`);
    const parts = ENDING_ORDER.filter((e) => endings[e]).map((e) => `${META[e].title} ${pct(endings[e], GAMES).trim()}`);
    console.log('  endings: ' + parts.join(' · '));
    const bw = Object.keys(bankruptWeeks).map(Number).sort((a, b) => a - b);
    if (bw.length) console.log('  bankrupt in week: ' + bw.map((w) => `w${w}:${bankruptWeeks[w]}`).join('  '));
  }
  return summary;
}

const all = {};
for (const w of LENGTHS) all[w] = report(w);

// Check the design targets (README section "Balance targets")
console.log('\n══════════ Design targets ══════════');
let ok = true;
const check = (label, pass) => { console.log(`${pass ? '✓' : '✗'} ${label}`); ok = ok && pass; };
for (const w of LENGTHS) {
  const s = all[w];
  check(`${w}w balanced: survives ≥95% (${pct(s.balanced.survived, GAMES).trim()})`, s.balanced.survived / GAMES >= 0.95);
  check(`${w}w balanced: hits goal ≥70% (${pct(s.balanced.goal, GAMES).trim()})`, s.balanced.goal / GAMES >= 0.7);
  check(`${w}w safe: survives, misses goal`, s.safe.survived / GAMES >= 0.9 && s.safe.goal / GAMES < 0.1);
  if (w >= 8) check(`${w}w aggressive: goes bankrupt in ≥90% (${pct(GAMES - s.aggressive.survived, GAMES).trim()})`, (GAMES - s.aggressive.survived) / GAMES >= 0.9);
  if (w === 12) {
    const rb = (GAMES - s.random.survived) / GAMES;
    console.log(`${rb >= 0.35 && rb <= 0.45 ? '✓' : '~'} ${w}w random: bankrupt ${pct(GAMES - s.random.survived, GAMES).trim()} (aim 35–45%, informational)`);
  }
  for (const n of Object.keys(s)) check(`${w}w ${n}: no bankruptcy before week 5 (earliest ${s[n].minBankrupt})`, s[n].minBankrupt >= 5);
}
console.log(ok ? '\nAll targets met.' : '\nSome targets missed. Tune server/balance.js.');
