# Survive 12 Weeks 🍛
### A live, phone-voting audience game about a cloud kitchen where orders go up and cash goes down

You run the game on a projector. The audience scans a QR code and plays on their phones: no app, no sign-up. Together they run **Spice Route Kitchen** with ₹5,00,000 in the bank. Every week they make a prediction, vote on four decisions, and watch the result. Sales go up while the bank balance goes down. At the end there is a real balance sheet, and one of ten endings depending on what the room chose.

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

1. Pick the game length, kitchen name, voting timer and sound on the setup screen.
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
| **+** | Add 15 seconds |
| **N** | Show/hide presenter notes (only on your screen, a talking point for each step) |
| **M** | Mute sounds |
| **F** | Fullscreen |
| **R** | Restart (asks first). Players stay joined, scores reset |
| **A** | Auto-play (moves on by itself, good for rehearsing) |
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

1. **Headline + advisors (10s).** A news card. Sometimes it's flavour, sometimes it's an event that changes the numbers. Three advisors each give biased advice: 🚀 Rocket Rhea (growth), 🍳 Steady Sam (operations), 💰 Penny Priya (finance).
2. **Prediction (15s).** A different question each week, with 2 to 4 answers:
   - *Cash check*: will the bank balance end higher or lower? (Always week 1 and the payout-delay week)
   - *The money truck*: how much will ZipEats owe us at the end of the week?
   - *Where the money goes*: which will be the biggest cost?
   - *Profit vs cash*: will we make a profit on paper?
   - *Every ₹100*: how much of every ₹100 will we keep? (Depends on the room's discount vote)
   - *Can we keep up?*: will we turn customers away? (Asked in festival, viral and monsoon weeks)
   - *Order count*, *In the bin* (food waste), *Danger zone* (cash below ₹1 lakh)

   Questions don't repeat back to back. After the reveal, the answer comes with a one-line explanation of *why*. That explanation is the teaching moment.
3. **Decisions (timer, default 40s).** Discount (none / 10% / 30%), ads (none / ₹15k / ₹45k), ingredient stock (lean / right-sized / heavy), staff (keep / add a cook). Boardroom weeks add a fifth: a bridge loan, a bulk supplier deal, or a menu price rise. Votes are secret until the timer ends. The projector only shows "142 / 187 voted". Ties are settled by a coin flip.
4. **The split.** How the room voted.
5. **The reveal.** Orders and sales count up. Costs land one by one. The ZipEats truck shows the money still on its way. Then the bank balance moves, usually down. The Orders-vs-Cash chart grows every week.
6. **Results.** The answer to the prediction and why, the crowd-wisdom gauge, which advisor would have done best, and the top 5. Phones show each person's points, rank and "You voted X, the room went Y."

### Scoring (per phone, per week)

- Right prediction: **+100**, plus **+20 for each week in a row** you've been right (up to +100)
- Voted at all: **+10**
- Each decision that matches what a careful CFO would pick: **+15**
- Your secret role's bonus: **+30** (Growth: orders went up · Operations: little waste and nobody turned away · Finance: cash went up)

---

## 6. How the endings are decided

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

Every number lives in **`server/balance.js`**, with a comment on each. Game settings live in **`config.json`**: kitchen name, default length, timer, sound, seed, **order goals per game length** and demo bot count.

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
- The weekly forecast question became a rotating set of nine questions (see section 5), after feedback that asking the same question every week got boring.
- Illustrations are emoji in styled tiles, plus a hand-made SVG for the ZipEats truck. Everything works offline with no image files.

---

## 9. Commands

```bash
npm start            # the game
npm run demo         # the game + 60 simulated voters
npm run tunnel       # the game + public link via cloudflared
npm test             # all tests: simulation, balance sheet, endings, questions, 200-phone end-to-end
npm run balance      # difficulty report
```

## 10. Files

```
server/balance.js     all the tunable numbers
server/sim.js         the business simulation (pure functions)
server/events.js      events and the fair weekly schedule
server/forecasts.js   the rotating prediction questions + explanations
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
