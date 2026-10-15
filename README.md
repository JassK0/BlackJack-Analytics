# BlackJack Analytics

🃏 A blackjack lab and arcade that runs entirely in your browser. It has a Monte Carlo simulator that shows how betting systems really perform, plus three blackjack games built on the same engine.

**▶ Try it live: [black-jack-analytics.vercel.app](https://black-jack-analytics.vercel.app/)**. Nothing to install.

> **TL;DR: the house always wins.** Betting systems only change *how* you lose. Card counting is the one strategy that actually tilts the odds, which is why one of the games is all about it.

---

## What's inside

| Tab | What it is |
|---|---|
| **Results** | Run a Monte Carlo experiment and rank betting strategies, either as a quick *No BS* verdict or a full *In-depth* breakdown |
| **Live table** | Watch simulated hands play out on an animated felt, one decision at a time |
| **History** | Your recent runs, ready to reopen |
| **Daily Shoe** | A once-a-day puzzle: the same shoe for everyone, 10 hands, and a perfect-hindsight score to chase |
| **Count & Conquer** | A card-counting roguelite across three cities |
| **Twenty-One Stakes** | A Balatro-style deck-building roguelite where blackjack hands score chips × mult |

There is no server, account or database. The app does every calculation in your browser, and results, saves and high scores stay in your browser's `localStorage`.

---

## 🚀 Quick start

To just use it, open the [live site](https://black-jack-analytics.vercel.app/). To run it yourself, you need [Node.js](https://nodejs.org) 20 or newer.

```
npm install
npm run dev
```

Vite opens the app at http://localhost:5173.

| Command | What it does |
|---|---|
| `npm run build` | Typechecks, then builds a static site into `dist/` |
| `npm run preview` | Serves the built site |
| `npm run typecheck` | Runs TypeScript only |

> **Windows PowerShell:** if `npm` isn't recognized, install Node.js and open a new terminal. If PowerShell says `npm.ps1 cannot be loaded because running scripts is disabled`, either:
> - type `npm.cmd` instead of `npm` (for example `npm.cmd run dev`), or
> - allow scripts for your account once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

---

## 📊 The strategy simulator

The simulator is a TypeScript port of the original Python engine (`strat2.py`). It runs in a Web Worker at about a million hands per second, so the page stays responsive.

- **Compare strategies.** Pick up to 8 at once from the eight built-in systems and your own. The built-ins are flat betting, Martingale, Paroli, 1-3-2-6, Oscar's Grind, D'Alembert, Fibonacci and Labouchère, each with its own options.
- **Set the table.** Choose the number of decks, whether the dealer hits or stands on soft 17, a 3:2, 6:5 or 1:1 blackjack payout, US peek or European no-hole-card rules, and a table maximum. Presets cover common casinos. You also set the bankroll, betting unit, sessions, hands per session and seed.
- **Build your own strategy.** Raise or lower the bet by multiplying, adding or removing units, or follow a sequence like Fibonacci. Wins, losses and pushes get separate rules, with bet limits, streak resets and stop-win / stop-loss walk-aways. A quick test against flat betting updates as you edit.
- **No BS ⟷ In-depth.**
  - *No BS* gives the ranking with four numbers per strategy (average session, chance to finish ahead, chance to go broke, a bad day) and a plain-English bottom line.
  - *In-depth* adds KPIs, a sortable leaderboard with adjustable weights and comparison charts: results, risk vs return, survival, edge per $1 with confidence intervals, drawdowns and outcomes.
  - It also gives each strategy its own breakdown: betting pattern, bet sizes, bankroll fan chart, edge by dealer upcard, and a starting hand × upcard heatmap.
- **Results change only when you press Run.** Edit settings freely; the page flags when the results on screen are from older settings.
- **Live run.** On bigger experiments you watch each strategy's average settle inside its confidence band while bankroll paths are drawn.
- **Live table.** An animated felt deals real simulated hands. It shows each decision, why the strategy picks its next bet, the shoe and a Hi-Lo count, and the other strategies' bankrolls on the same cards. You can play, pause, step, scrub or turbo through it.
- **Strategy explainers.** Click any strategy's name for a pop-out that explains it, with a mini table that plays the strategy and narrates each step. A learning mode lets you advance one step at a time.
- **History.** The last six runs are saved in the browser. Any session can be replayed, because it's re-simulated from the run's seed.
- **Light and dark themes.**

---

## 🎮 The games

### Daily Shoe

A Wordle-style game you can play once a day.
- **Setup:** everyone gets the same 104-card shoe (seeded from the date), 10 hands and $1,000. You choose each bet ($10–$100) and play each hand.
- **Scoring:** afterwards you see the *perfect-hindsight* run, the best result anyone could get knowing every card, and how much of it you captured, next to a basic-strategy bot.
- **Sharing:** share your result as an emoji line and keep a streak. Refreshing can't re-deal the day.

### Count & Conquer

A card-counting roguelite. Cross three cities (Downtown, The Strip and The Riviera) on a branching map of casinos, high-limit rooms, events, shops and a motel. A boss casino waits at the end of each city.

- **The job.** Every casino asks you to get a set amount of **hot money** on the table, meaning bets placed while the Hi-Lo true count is +2 or better. Big bets into a cold shoe set the job back, so you have to actually count.
- **You keep the count.** Every card counts, including the regulars' and the dealer's. You start each casino watching from the rail and sit down when the shoe looks good.
- **Heat.** Jumping your bet, betting big into a hot shoe, taking insurance and hovering too long all raise Heat. Small flat bets and tips lower it. At 100 you're backed off and earn a notoriety star; three stars and you're blacklisted.
- **Small talk.** Every few hands the pit boss chats you up, then you have 12 seconds to name the running count. Getting it right earns Focus, which you can spend to see the exact true count.
- **Count-sensitive bets.** The Lucky 20 side bet and insurance only pay off when the count is high, just like in real advantage play.
- **19 relics, 9 events and 3 bosses:**
  - The Eye in the Sky: Heat builds faster.
  - Varga: shuffles when your bet jumps.
  - The Syndicate: 6:5 blackjack and the dealer hits soft 17.
- **Assisted mode** shows the count, for learning, at half score.

The rules were balance-tested with simulated players. A good counter clears about 60% of jobs, while someone flat-betting big clears under 20% and usually goes broke.

### Twenty-One Stakes

A deck-building roguelite in the spirit of Balatro, played with blackjack hands.

- **The run.** Eight antes of three tables each: the Pit, the High Roller and a Boss with a twist. Each table sets a chip target, and you get **5 hands** and **3 redraws** to reach it. A redraw swaps a card in your hand for the top card of your deck.
- **Scoring is chips × mult.** Your hand type sets the base, every card adds its own chips (faces 10, aces 11), then your charms fire left to right:

  | Hand | Base |
  |---|---|
  | Win | 10 × 2 |
  | Dealer Bust | 15 × 2 |
  | Twenty | 25 × 3 |
  | Twenty-One (3+ cards) | 35 × 4 |
  | Blackjack | 50 × 5 |
  | Charlie (5 cards, no bust) | 60 × 6 |

  - Won doubles score ×2.
  - Lost hands score half.
  - Busts and lost doubles score nothing.
  - A push gives you the hand back.
- **Your deck.** You play your own 52 cards, while the dealer uses a fresh house deck. Reshape yours by destroying low cards, forging aces, and adding Gold, Glass, Lucky, Wild and Stone cards.
- **The shop** appears after every table:
  - 47 charms (the jokers of this game)
  - 7 cocktails that level up hand types
  - 14 fortunes that rewrite your cards
  - 8 vouchers that are permanent upgrades
  - 4 kinds of booster pack

  You can also reroll the shop and sell what you don't need, and you earn interest on money you hold.
- **12 bosses.** Examples include The Cooler (blackjacks count as plain wins), The Mechanic (your first card is dealt face down) and The Mirror (the dealer draws from your deck). The final boss is The House.
- **Skipping.** Skip the Pit or High Roller for a free tag. **Endless mode** opens after ante 8.

The targets were tuned with simulated runs: a bot that builds sensibly wins about 14% of runs, a greedy shopper about 4%, and a bot that never shops doesn't get past ante 3.

### Shared by all three games

- Seeded runs you can share, plus a daily seed
- Local high scores
- A save after every move
- Keyboard shortcuts
- Optional sound, generated in the browser and off by default

---

## 🔒 Your data

Everything is stored in your browser's `localStorage` under keys that start with `bja.`. Nothing is sent anywhere. Clearing this site's data resets the app.

| Key | Holds |
|---|---|
| `bja.settings`, `bja.custom`, `bja.history` | Simulator settings, custom strategies and recent runs |
| `bja.daily.v1` | Daily Shoe progress and stats |
| `bja.conquer.*` | Count & Conquer run, high scores and settings |
| `bja.stakes.*` | Twenty-One Stakes run, high scores and settings |

The game fonts (Monoton, Bebas Neue and Jersey 15) load from Google Fonts the first time you open a game. Without a connection the games fall back to system fonts.

---

## 🛠️ How it's built

- **React 19, TypeScript and Vite.** The only runtime dependencies are `react` and `react-dom`.
- **Simulation engine.** Plain TypeScript with a seeded random-number generator (mulberry32) and streaming statistics, running in a Web Worker.
- **Charts.** Hand-written SVG, styled with CSS variables for both themes. Every chart has a table view.
- **Game engines.** Pure functions: state goes in, new state comes out. Each kind of randomness (shoes, shops, events) draws from its own seeded stream, so a seed always produces the same run. The screens animate from event logs the engines record, such as the deal order and each scoring step.
- **Art and sound.** No image or audio files:
  - Count & Conquer uses SVG and CSS.
  - Twenty-One Stakes draws its swirling background with a small WebGL shader.
  - All sound and music is synthesized with the Web Audio API.
- **Code splitting.** Each game loads only when you open its tab, so the analytics pages stay light.
- **Balance testing.** Both roguelites were tuned with headless bots that played thousands of seeded runs, plus fuzz tests that play random legal moves to make sure no card is ever lost or duplicated.

---

## 🗂️ Project structure

```
BlackJack-Analytics/
├── index.html, package.json, vite.config.ts, tsconfig.json
├── src/
│   ├── App.tsx              the tabs and the simulator page
│   ├── styles.css           simulator styles (light and dark)
│   ├── engine/              cards, rules, strategies, sessions, statistics
│   ├── worker/              Web Worker that runs experiments
│   ├── charts/              SVG charts
│   ├── lib/                 storage, formatting, insights, strategy guides
│   ├── game/                Daily Shoe rules, solver and scoring
│   ├── conquer/             Count & Conquer engine, run, events, sound, styles
│   ├── stakes/              Twenty-One Stakes engine, run, content, sound, styles
│   └── components/          simulator UI, plus conquer/ and stakes/ game screens
├── analyze.py               Python experiment runner, metrics and plots
├── strat2.py                Python table rules, bankroll and strategies
├── strat1.py                the original prototype script
├── requirements.txt         Python dependencies
└── out/                     where the Python CLI writes its results
```

---

## 🐍 The Python CLI

The project started as a Python tool, and it's still here for batch experiments and CSV output.

```
pip install -r requirements.txt
python analyze.py --sessions 1000
```

**Options:**

| Option | Sets |
|---|---|
| `--strategies` | Comma-separated list; default `flat,martingale,paroli,1326,oscars_grind` |
| `--sessions`, `--rounds` | Sessions per strategy and hands per session |
| `--starting`, `--unit` | Starting bankroll and betting unit |
| `--decks`, `--cut` | Shoe size and cut-card position |
| `--h17`, `--enhc`, `--no_double` | Dealer hits soft 17, European no-peek, no doubling |
| `--table_max`, `--no_table_max` | Table limit |
| `--seed` | Random seed |
| `--outdir` | Output folder |
| `--no-log-hands` | Skip the hand-by-hand log |
| `--config` | A YAML or JSON file of defaults; command-line flags override it |

**Outputs** (in `out/`):

| File | Contents |
|---|---|
| `hands.csv` | Every hand dealt, with totals and results |
| `sessions.csv` | Per-session summary for each strategy |
| `ev_per_hand.csv` | Expected value per hand for each strategy |
| `kelly.csv` | Edge per unit staked with a 95% confidence interval, Kelly fraction and Kelly-optimal bet |
| `strategy_ranking.csv` | Composite score and ranked leaderboard |
| `net_distribution.png`, `drawdown_box.png`, `strategy_ranking.png` | Charts |

**Metrics:**
- Mean and median net profit
- Win percentage
- Expected value per hand
- Volatility
- Maximum drawdown
- Risk of ruin
- A weighted composite score

### 📐 Kelly criterion

For every strategy, the simulator measures each hand's return per unit staked (profit divided by stake), then estimates the edge (mean return) and the variance. The Kelly fraction is approximated as edge divided by variance, the standard small-edge form of the Kelly criterion. The Kelly-optimal bet is that fraction of the starting bankroll, floored at zero.

Example run: 1,000 sessions per strategy, 5,000 in total, with 6 decks and a 3:2 payout (`python analyze.py --sessions 1000`).
- Every strategy showed a negative edge of about 0.5% per unit staked, so the Kelly-optimal bet is $0.
- The 95% confidence interval was roughly −2.2% to +1.1% at that sample size.
- A 600,000-hand flat-betting run puts the edge near −1.1% under these rules.

Progressive systems like Martingale reshape the distribution of outcomes and raise the risk of ruin. They don't change the expected value of the game. Kelly results are reported alongside the composite ranking and aren't part of the composite score.

---

## 📝 Known limitations

- In both simulators the player follows basic strategy without splits, surrender or insurance. In the games, splitting is available only through a Twenty-One Stakes charm.
- The browser engine and the Python engine use different random-number generators, so the same seed deals different cards in each. Both converge to the same edges.
- In `strat2.py`, European no-hole-card rules don't treat naturals specially: a player blackjack pays 1:1, and a dealer blackjack only pushes against a player's multi-card 21. The web app handles both correctly.
- `analyze.py` always pays blackjack 3:2. Use the web app for 6:5 or 1:1.
- Logging every hand in the CLI creates large files on long runs. Use `--no-log-hands` to skip it.
- High scores are per browser. A global leaderboard would need a server.

---

## 💡 Ideas for later

- Global leaderboards, which would need a small backend
- Parameter sweeps across rule sets in the simulator
- Significance tests between strategies
- More Twenty-One Stakes content, such as charm editions and more bosses

---

## ❤️ Credits

Developed by **Jass Kahlon**.

Inspired by casino mathematics and bankroll research, real-world blackjack rule variations, and the roguelites that shaped the games: Balatro for Twenty-One Stakes, and Slay the Spire's maps for Count & Conquer.
