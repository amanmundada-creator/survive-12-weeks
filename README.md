# Survive 12 Weeks 🍛
### A live, Kahoot-style phone game about cloud kitchens where orders go up and cash goes down

You run the game on a projector. Everyone in the room scans a QR code and **runs their own cloud kitchen** on their phone, with ₹5,00,000 in the bank. No app, no sign-up. Every week there's a quick question: **right answers put cash into your kitchen (faster = more), wrong answers take cash out.** Then everyone makes their own decisions (discount, ads, stock, staff) and sees what happened to their cash. A **game clock (5 minutes by default)** runs at the top of the screen. When it hits zero, the **richest kitchen wins, and its real balance sheet is analysed on the big screen.**

Everyone gets the same news, the same events and the same luck. Only the answers and the decisions differ.

---

## 1. First-time setup (once, on your laptop)

1. Install **Node.js 18 or newer** from https://nodejs.org (the "LTS" button).
2. Open a terminal in this folder and run:

```bash
npm install
```

## 2. On the day

```bash
npm start
```

The terminal prints three things:

- **A QR code and the audience link** (e.g. `http://192.168.1.5:3000`). The same QR code appears on the host screen.
- **Your HOST link** (`http://localhost:3000/host?token=…`). Open it on the projector laptop and press **F** for fullscreen. Keep this link private, because anyone with it controls the game. It stays the same between restarts.
- **The ending rehearsal link** (`/ending-preview?token=…`).

Then:

1. Pick the game clock (3–15 minutes, default 5), kitchen name, answer time (default 20 seconds) and sound on the setup screen.
2. Let people scan and join. Their nicknames pop up on screen.
3. Press **Space** to start. After that, Space moves to the next step.

### If phones can't connect (venue Wi-Fi)

Many venue Wi-Fi networks block phones from reaching your laptop. This is called "client isolation". Test it before the audience arrives by scanning the QR code with your own phone. If the page doesn't load:

- **Option A (easiest): your phone's hotspot.** Turn on your phone's hotspot, connect the laptop to it, and run `npm start` again. The QR code updates automatically. Audience members who join your hotspot can play. This works for small rooms, since hotspots usually allow about 10 to 15 devices.
- **Option B: a public tunnel.** Install `cloudflared` once (Mac: `brew install cloudflared`, Windows: `winget install Cloudflare.cloudflared`), then run:

```bash
npm run tunnel
```

  It prints a public `https://….trycloudflare.com` link and puts it in the QR code. Phones can then join from mobile data, whatever the Wi-Fi does. This needs internet on the laptop.
- **Option C: your own URL.** If you already have a public address for the laptop, start with `BASE_URL=https://your-address npm start` and the QR code uses it.

### Host keys

| Key | What it does |
|---|---|
| **Space** / → | Next step (also skips a running timer) |
| **P** | Pause / resume the timer |
| **+** | Add 15 seconds to the current question/decision |
| **C** | Add 1 minute to the game clock |
| **N** | Show/hide presenter notes (only on your screen, a talking point for each step) |
| **M** | Mute sounds |
| **F** | Fullscreen |
| **R** | Restart (asks first). Players stay joined, scores reset |
| **A** | Auto-play: moves past the results screen by itself (good for rehearsing) |
| ← / → | On the ending: move between the 3 ending screens |

Click once or press any key after opening the host page so the browser allows sound.

### If something crashes

The game saves itself after every step. Just run `npm start` again. The game resumes where it was, and phones reconnect by themselves with the same nickname, role and score. To throw away a saved game and start fresh: `npm start -- --fresh` (or press R on the host screen).

---

## Put it online (a permanent link anyone can open)

This puts the game at a public address like `https://survive-12-weeks.onrender.com`. Phones join over mobile data, so venue Wi-Fi doesn't matter. It's free and takes about 10 minutes, once.

GitHub only stores the code. **Render** runs it. GitHub Pages can't run this game, because it needs a live server that every phone stays connected to.

1. **Put the code on GitHub.** Create an empty repository at https://github.com/new (for example `survive-12-weeks`, no README). Then, in this folder:

```bash
git remote add origin https://github.com/YOUR-USERNAME/survive-12-weeks.git
```

```bash
git push -u origin main
```

2. **Deploy on Render.** Sign in at https://render.com with your GitHub account → **New** → **Blueprint** → pick the repository → **Apply**. Render reads `render.yaml` and builds the game. That takes 2–3 minutes.
3. **Get your host link.** In Render, open the service → **Environment** and copy the `HOST_TOKEN` value. Your host link is:
   `https://YOUR-APP.onrender.com/host?token=THAT-VALUE`
   Keep it private. Everyone else just scans the QR code, which points to the public address automatically.
4. **Updating later:** `git push` again and Render redeploys on its own.

**Good to know about Render's free plan:**
- The game **falls asleep after 15 minutes with no visitors**. The first visit wakes it, which takes about a minute. **Open your host link a few minutes before you present.**
- If it falls asleep or redeploys **in the middle of a game**, that game is lost, because the free plan doesn't keep files. A game in progress keeps it awake, so this only matters for long pauses. A paid plan ($7/month) never sleeps.
- `npm run demo` bots don't run online. Rehearse with bots on your laptop.

## 3. Pre-show checklist

- [ ] `npm install` done, `npm start` works
- [ ] Host link open on the projector, fullscreen (F), sound enabled (click once), volume up
- [ ] Your own phone scanned the QR code **on the venue network** and reached the "You're in!" screen
- [ ] Fallback ready: phone hotspot, or `npm run tunnel` tested
- [ ] Game length chosen: Quick 6 weeks ≈ 10 min · Standard 8 ≈ 15 min · Full 12 ≈ 22 min
- [ ] `PRESENTER_NOTES.md` read once, notes toggle (N) tried
- [ ] Laptop power plugged in, screen sleep off, notifications off

## 4. Rehearse alone with a fake crowd

```bash
npm run demo
```

This adds 60 simulated voters with different personalities: greedy, cautious, sensible, random and contrarian. Add more with `npm run demo -- --bots=200`. Press **A** on the host screen to let the game play itself, or step through with Space.

To flip through all ten ending screens without playing, open the **ending-preview** link from the terminal. It builds a real sample game for each ending.

---

## 5. How a week works

1. **Headline + advisors (10 seconds, Space skips).** A news card, which is sometimes an event that changes the numbers for everyone. Three advisors give biased advice: 🚀 Rocket Rhea (growth), 🍳 Steady Sam (operations), 💰 Penny Priya (finance).
2. **Quick question (20 seconds).** Two to four coloured answers, Kahoot-style. One tap, no changing. **It ends the moment everyone has answered.**
3. **The answer (7 seconds).** How the room answered, the right answer, and a one-line 💡 *why*. That line is the teaching moment. Phones show "✓ Correct! +₹16,500" or "✗ Wrong · −₹10,000".
4. **Run your own kitchen (20 seconds).** Each phone picks discount, ads, stock and staff for its own kitchen. Boardroom weeks add a fifth choice: a bridge loan, a bulk supplier deal or a price rise. "↺ Same as last week" locks in with one tap. **It ends the moment everyone has locked in.** If someone doesn't decide, their kitchen repeats last week's choices.
5. **Results (Space to continue).** The projector shows how many kitchens have **less cash than last week, even though they sold more**, the room's average orders vs cash chart, and the top 5 richest kitchens. Each phone shows its own week: orders, sales, cash paid out, cash that arrived from ZipEats, quiz money, cash in the bank, and money still on the way.

When the game clock hits zero, the week in progress finishes, and then the winner is revealed. The game also ends after 12 weeks, or if every kitchen has closed.

### The questions
There are 18 rule questions (when ZipEats pays, fixed vs variable costs, margin at 30% off, receivables, what a balance sheet is, loan interest, and more). There are 5 event questions, asked in the week that event happens: payout delay, rival opens, rent hike, viral reel, supplier price hike. And there are 3 questions about the room itself, from week 2: "What did most kitchens choose for discount last week?", "Which kitchen had the most cash?", "How many kitchens saw their cash go down?". **No question is ever asked twice in a game**, and questions rotate between topics. Week 1 is always "When does ZipEats pay you?", because that's the key idea.

### Scoring = cash
- Right answer: **+₹10,000 to +₹20,000** depending on speed, plus **+₹2,000 for each answer in a row** you've got right (up to +₹10,000).
- Wrong answer: **−₹10,000**. No answer: ₹0.
- Quiz money goes straight into your kitchen's cash, and shows on your balance sheet as profit or loss.
- **Leaderboard = cash score:** cash in the bank, **minus** any loans and unpaid bills. Taking the ₹3 lakh bridge loan doesn't buy you a place on the leaderboard. Investor funding at the end doesn't count either.
- A kitchen that runs out of cash twice **closes**. Its owner can still answer questions, and winnings pay off its unpaid bills first.

---

## 6. How the endings are decided

At the end, **every kitchen** gets one of these ten endings (shown on its phone with its own balance sheet), and the **winner's** ending and balance sheet are walked through on the projector in 3 screens: the balance sheet with callouts, the chart with "what a CFO would say", and the same week played the careful way, next to how the whole room ended.

The rules are checked in this order, and the first match wins.

**If the kitchen ran out of cash** (cash below zero a second time, after the one automatic emergency loan):

1. **The Discount Death Spiral**: 30% discount in at least half the weeks played.
2. **The Debt Spiral**: the room took the boardroom bridge loan.
3. **The Growth Trap**: orders grew at least 15% from week 1, and ZipEats still owed at least 1.5 weeks of fixed costs.
4. **The Ad Burn**: ads were at least 15% of all spending.
5. **The Slow Bleed**: anything else (orders shrank and fixed costs ate the cash).

**If the kitchen survived**, the rules are checked in this order:

- **Needed the emergency loan to stay alive?** Then it's **Cash Locked in the Fridge** if waste or stock was heavy, otherwise **Running on Fumes**. An investor won't back a rescued kitchen.
- **Scaled Up** (best): final-week orders reached the goal **and** the growth was paid for: the room didn't take the bridge loan, and the overall loss is no more than ₹1 lakh (a small loss from the start-up weeks is allowed). The investor puts in ₹10 lakh, which shows as "Investor funding" on the owner's side. A room that hits the goal on borrowed money gets **The Balanced Grower** with the line "Real growth, but on borrowed money."
- **Running on Fumes**: cash below 2 weeks of fixed costs, with more money owed by ZipEats than in the bank.
- **Cash Locked in the Fridge**: heavy waste or stock (waste over ₹15,000 a week on average, or over ₹80,000 of stock) and cash under ₹3.5 lakh.
- **Safe but Stuck**: orders didn't grow at least 15% since week 1.
- **The Balanced Grower**: everything else (orders grew, cash is fine, the goal was missed).

The ending numbers (1 to 10) on screen are just labels. The order above is what decides.

Every ending shows three screens:
1. The title, three callouts and the **real balance sheet**. Assets always equal liabilities plus equity, and a ✓ shows it. If the kitchen went bankrupt, cash is ₹0 and the unpaid bills are shown in red.
2. The Orders-vs-Cash chart plus "What a CFO would say".
3. **"Same kitchen, different choices"**: the careful strategy played with the same weeks, events and luck, side by side. Plus room stats: how often predictions were right, which advisor the room followed, which advisor was right most often, and the podium.

---

## 7. The business model (in plain English)

- Menu price ₹350. Food costs ₹126 an order, packaging ₹14. ZipEats takes 25% of the discounted price plus ₹12 a order.
- The kitchen pays for discounts. Per order it keeps about **₹110 at full price, ₹84 at 10% off and ₹32 at 30% off.**
- Rent, base staff and utilities cost ₹58,000 a week no matter what. Each extra cook costs ₹5,500 a week and adds 450 orders of capacity.
- **ZipEats pays a week's sales at the end of the next week.** Until then the money is "owed by ZipEats" (a receivable). Ingredients, ads, staff and rent are paid straight away. That gap is the whole game.
- Unsold food: 60% is thrown away, 40% keeps.
- Turning customers away (kitchen full or out of stock) lowers the rating. The rating affects demand.
- With no discounts or ads, competitors slowly take customers away.
- **Emergency loan:** the first time cash goes below zero, a lender steps in automatically at 6% a week. The second time, the kitchen closes. It can never close before week 5.

### Events
Payout delay (the cash trap, always in the middle third of the game) · viral reel (+40% demand) · festival (+25%) · monsoon (+15% demand, −15% delivery capacity) · rival opens (−8% demand for good) · supplier price hike (+10% food for 2 weeks) · rent hike (+15% for good) · hygiene inspection (fine if the rating is low, boost if high) · refund spike (8% of orders refunded). There are never two bad events in a row. The same seed always gives the same game.

---

## 8. Tuning difficulty

Every number lives in **`server/balance.js`**, with a comment on each. Game settings live in **`config.json`**: kitchen name, `gameMinutes` (default 5), `questionSeconds` and `decisionSeconds` (default 20), sound, seed, order goals and demo bot count.

After changing anything, run:

```bash
npm run balance
```

It plays thousands of games per strategy and checks the design targets.

- **Easier:** raise `START_CASH`, lower the goals in `config.json`, or raise `WORD_OF_MOUTH`.
- **Harder:** raise the goals, raise `ORGANIC_DECAY`, or lower `EMERGENCY_CUSHION`.

### Current balance results (1,000 seeded games per strategy)

| | Quick (6w) | Standard (8w) | Full (12w) |
|---|---|---|---|
| **Careful play** survives / hits goal | 100% / 92% | 100% / 82% | 100% / 75% |
| **Max growth** (30% off, big ads, heavy stock, hire every week) | never closes before week 5; ends on the emergency loan* | 100% bankrupt, weeks 5–8 | 100% bankrupt, mostly weeks 6–9 |
| **Play safe** (no discount, no ads, lean) | survives, misses goal → *Safe but Stuck* 100% | same | same |
| **Random votes** bankrupt | ~0% | 9% | 32% |
| **Random votes** reach Scaled Up | 2% | 1% | 0% |

Order goals: 850 (6 weeks), 1,000 (8 weeks), 1,150 (12 weeks).

\* In a 6-week game, maximum growth usually survives *only because of* the emergency loan, and ends as *Cash Locked in the Fridge* or *Running on Fumes*, never *Scaled Up*.

**Assumptions and deviations from the original brief, stated plainly:**
- The brief's example goal for a 12-week game was 1,500 orders a week. With the brief's unit economics, careful play reached 1,500 in only about half of games, so the goals are set lower to make "careful play hits the goal ≥70% of the time" true. You can change them in `config.json`.
- Random voting goes bankrupt in about 32% of 12-week games, slightly under the brief's 35–45%. Real rooms don't vote uniformly at random, and making it harsher also made careful play fail too often.
- The game changed from one shared kitchen voted on by the room to **Kahoot-style: everyone runs their own kitchen**, with cash as the score, a 5-minute game clock, and the winner's balance sheet analysed at the end. The balance numbers below come from the simulation itself, which still applies to every kitchen.
- Illustrations are emoji in styled tiles, plus a hand-made SVG for the ZipEats truck. Everything works offline with no image files.

---

## 9. Commands

```bash
npm start            # the game
npm run demo         # the game + 60 simulated voters
npm run tunnel       # the game + public link via cloudflared
npm test             # all tests: simulation, balance sheets, endings, questions, 200-phone end-to-end
npm run balance      # difficulty report
```

## 10. Files

```
server/balance.js     all the tunable numbers
server/sim.js         the business simulation (pure functions)
server/events.js      events and the fair weekly schedule
server/quiz.js        the Kahoot-style question bank + explanations
server/endings.js     the ten endings: rules and words
server/game.js        live game: phases, timers, votes, scores, saving
server/index.js       web server, WebSockets, QR code, tunnel
server/bots.js        simulated crowd for rehearsal
public/host.*         projector screen
public/vote.*         phone screen
public/ending-preview.html   rehearse every ending
data/                 saved game + host token (safe to delete)
```

No real brands are used. "ZipEats" and "Biryani Bros" are made up.
