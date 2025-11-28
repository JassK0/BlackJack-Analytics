# BlackJack-Analytics

🃏 A Monte-Carlo simulation and analytics engine for evaluating blackjack betting strategies, bankroll performance, and long-term risk metrics under real casino rules.

---

## 📖 Overview

BlackJack-Analytics is a Python-based statistical tool that runs simulated blackjack sessions using multiple betting strategies, table rules, and bankroll configurations. Instead of guessing which betting system performs best, this project produces real, repeatable metrics backed by probability and data.

It evaluates strategies such as flat betting, Martingale, Paroli, 1-3-2-6, and Oscar’s Grind, then computes and compares results using metrics like net return, win rate, drawdown, risk of ruin, expected value per hand, and a composite weighted ranking score.

This makes the project valuable for gamblers, statisticians, and developers studying casino mathematics, bankroll theory, or betting systems performance.

---

## ✨ Features

- Simulates casino blackjack under customizable rule sets  
- Tests multiple strategies automatically in a single experiment  
- Produces session-level and hand-level datasets for further analysis  
- Calculates advanced financial statistics including:  
  - Mean and median net profit  
  - Win percentage  
  - Expected value per hand  
  - Standard deviation and volatility measures  
  - Maximum drawdown  
  - Risk of ruin (probability of going broke)  
- Generates visualizations for intuitive comparisons  
- Outputs a ranked leaderboard of strategies using weighted metrics  
- Supports reproducible experiments with a random seed  

---

## 🗂️ Repository Structure

BlackJack-Analytics/  
analyze.py – experiment runner, metrics computation, and visualization  
strat2.py – table rules, bankroll configuration, and strategy logic  
out/ – output directory for results, charts, and reports  
requirements.txt – Python dependencies  
README.md – project documentation  

---

## 🚀 How It Works

1. Choose one or more betting strategies  
2. Define casino rules (number of decks, dealer hits/stands on soft 17, payout ratio, table limit, etc.)  
3. Specify bankroll and session parameters  
4. Run simulations that execute thousands of blackjack rounds  
5. Inspect generated CSVs and plots to determine which strategy performs best

This replaces anecdotal opinions about betting systems with evidence.

---

## 📦 Technologies Used

Backend: Python  
Math and computing: NumPy, statistics module  
Data analysis: Pandas  
Visualization: Matplotlib  
Config support: JSON and optional YAML  

---

## 🔧 Configuration Options

You may customize:

- Strategy list (flat, martingale, paroli, 1326, oscars_grind, etc.)  
- Number of sessions per strategy  
- Number of rounds per session  
- Starting bankroll and betting unit  
- Casino rules:  
  - Number of decks in the shoe  
  - Dealer hits or stands on soft 17  
  - 3:2 or 6:5 blackjack payout  
  - European no-peek rules  
  - Table maximum betting limit  

These parameters allow simulation of realistic casino environments and hypothetical scenarios.

---

## 📊 Outputs

After every run, the project generates several artifacts inside the output directory:

- hands.csv – every hand dealt, with card totals and results  
- sessions.csv – per-session summary for each strategy  
- ev_per_hand.csv – expected value per hand for each strategy  
- strategy_ranking.csv – composite scoring and ranked leaderboard  
- net_distribution.png – histogram showing profit distribution across sessions  
- drawdown_box.png – comparison of maximum drawdowns by strategy  
- strategy_ranking.png – visual ranking based on composite score  

These files allow comparisons across strategies, rules, and bet sizing methods.

---

## 🤝 Contributing

Suggested improvements:

- Add simulation support for card counting or Hi-Lo deviations  
- Add bankroll trajectory graphs for each strategy over time  
- Introduce more alternative betting systems  
- Enable GPU acceleration for extremely large simulations  
- Add statistical significance tests comparing strategies  

Pull requests are welcome.

---

## 📝 Known Limitations

- Logging individual hands can create large datasets during long simulations  
- Some strategies will appear unbeatable unless realistic table limits are applied  
- YAML config support requires installing PyYAML separately  

---

## ❤️ Acknowledgements

Inspired by:

- Casino mathematics and probability theory  
- Classical gambling strategies and bankroll management research  
- Real-world blackjack rule variations  

Developed by **Jass Kahlon**.

---

## 🔧 Things to Improve

- Add parameter sweeps to automatically run multiple rulesets  
- Add time-series bankroll graphs for visual risk assessment  
- Provide prebuilt strategy presets and downloadable result sets  

---

### 🎯 Summary

BlackJack-Analytics removes the mythology from blackjack strategy and replaces it with data. It does not tell you what “feels smart” — it tells you what **is** smart over hundreds or thousands of sessions.

If you want real blackjack insights backed by math instead of gambling folklore, this project gives you the tools.
