# analyze.py
import argparse
import os
import csv
import math
import json
from collections import defaultdict
from statistics import mean, pstdev
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import json as _json
import sys
try:
    import yaml
except Exception:
    yaml = None

from strat2 import TableRules, BankrollConfig, StrategyConfig, run_session

def ci95(x):
    if len(x) == 0: return (np.nan, np.nan)
    m = np.mean(x); s = np.std(x, ddof=1) if len(x) > 1 else 0.0
    half = 1.96 * s / math.sqrt(len(x)) if len(x) > 1 else 0.0
    return (m - half, m + half)

def risk_of_ruin(finals, starting):
    return float(np.mean(np.array(finals) <= 0.0))

def kelly_unit_est(ev_per_unit, var_per_unit):
    """Crude guide (not exact for BJ)."""
    if var_per_unit <= 0: return np.nan
    return ev_per_unit / var_per_unit

def run_experiment(args):
    outdir = args.outdir
    os.makedirs(outdir, exist_ok=True)

    rules = TableRules(
        num_decks=args.decks, cut_card=args.cut,
        dealer_hits_soft_17=args.h17,
        hole_card=not args.enhc,
        pay_bj=1.5 if args.pay32 else 1.2,
        allow_double=not args.no_double,
        table_max=None if args.no_table_max else args.table_max
    )
    # Only pass rounds/sessions through if user explicitly provided one; otherwise BankrollConfig will use its default
    bank_kwargs = dict(starting_bankroll=args.starting, bet_base=args.unit)
    if args.rounds is not None:
        bank_kwargs['rounds'] = args.rounds
    if args.sessions is not None:
        bank_kwargs['sessions'] = args.sessions
    bank = BankrollConfig(**bank_kwargs)

    strategies = args.strategies.split(',')
    session_rows = []
    all_hand_rows = []

    for strat in strategies:
        sc = StrategyConfig(kind=strat)
        # bind the unit for summary text
        sc.bet_base = args.unit

        finals = []
        nets = []
        dds = []

        for s in range(bank.sessions):
            seed = args.seed + s if args.seed is not None else None
            handlogs, summary = run_session(sc, rules, bank, seed=seed, log_hands=args.log_hands)

            # write hand rows
            for h in handlogs:
                p_cards = ",".join(h.player_cards) if getattr(h, 'player_cards', None) else ""
                d_cards = ",".join(h.dealer_cards) if getattr(h, 'dealer_cards', None) else ""
                all_hand_rows.append({
                    "session_id": h.session_id, "strategy": summary.strategy, "hand_idx": h.hand_idx,
                    "stake": h.stake, "before": h.bankroll_before, "after": h.bankroll_after,
                    "profit": h.profit, "outcome": h.outcome,
                    "player_total": h.player_total, "dealer_total": h.dealer_total,
                    "player_bj": h.player_bj, "dealer_bj": h.dealer_bj,
                    "dealer_up": h.dealer_up, "player_len": h.player_len, "dealer_len": h.dealer_len,
                    "player_cards": p_cards, "dealer_cards": d_cards
                })

            session_rows.append({
                "session_id": summary.session_id,
                "strategy": summary.strategy,
                "rounds": summary.rounds_played,
                "final_bankroll": summary.final_bankroll,
                "net": summary.net,
                "win": summary.win, "lose": summary.lose, "push": summary.push,
                "win_rate": summary.win_rate,
                "avg_stake": summary.avg_stake,
                "max_drawdown": summary.max_drawdown,
                "table_max_hits": summary.table_max_hits,
                "bust": summary.bust,
                "rules": json.dumps(summary.rules)
            })
            finals.append(summary.final_bankroll)
            nets.append(summary.net)
            dds.append(summary.max_drawdown)

        # per-strategy aggregate printout
        lo, hi = ci95(nets)
        # show the effective rounds/sessions from the BankrollConfig (may be strat2 default if user omitted args)
        effective_rounds = getattr(bank, 'rounds', args.rounds)
        effective_sessions = getattr(bank, 'sessions', args.sessions)
        print(f"[{strat}] sessions={effective_sessions} rounds={effective_rounds} unit={args.unit}")
        print(f"  Net mean={np.mean(nets):.2f}  (95% CI: {lo:.2f} .. {hi:.2f})")
        print(f"  Final bankroll mean={np.mean(finals):.2f}")
        print(f"  Max drawdown mean={np.mean(dds):.2f}")
        print(f"  Risk of ruin={risk_of_ruin(finals, args.starting):.3f}\n")

    # Save CSVs (force headers so empty runs still produce parsable files)
    hands_csv = os.path.join(outdir, "hands.csv")
    sessions_csv = os.path.join(outdir, "sessions.csv")
    hands_cols = [
        "session_id", "strategy", "hand_idx", "stake", "before", "after",
        "profit", "outcome", "player_total", "dealer_total",
        "player_bj", "dealer_bj", "dealer_up", "player_len", "dealer_len",
        "player_cards", "dealer_cards"
    ]
    session_cols = [
        "session_id", "strategy", "rounds", "final_bankroll", "net",
        "win", "lose", "push", "win_rate", "avg_stake",
        "max_drawdown", "table_max_hits", "bust", "rules"
    ]
    pd.DataFrame(all_hand_rows, columns=hands_cols).to_csv(hands_csv, index=False)
    pd.DataFrame(session_rows, columns=session_cols).to_csv(sessions_csv, index=False)
    print(f"Saved: {hands_csv}")
    print(f"Saved: {sessions_csv}")

    # Visuals
    df_sess = pd.read_csv(sessions_csv)
    plt.figure()
    for strat in strategies:
        vals = df_sess[df_sess["strategy"]==strat]["net"]
        plt.hist(vals, bins=40, alpha=0.5, label=strat, density=True)
    plt.title("Distribution of Session Net by Strategy")
    plt.xlabel("Net (final - starting)"); plt.ylabel("Density"); plt.legend(); plt.grid(True, alpha=0.3)
    plt.savefig(os.path.join(outdir,"net_distribution.png"), dpi=150, bbox_inches="tight")

    plt.figure()
    box = [df_sess[df_sess["strategy"]==s]["max_drawdown"] for s in strategies]
    # use xticks to set labels (avoids matplotlib deprecation of 'labels' kwarg)
    plt.boxplot(box)
    plt.xticks(range(1, len(strategies) + 1), strategies)
    plt.title("Max Drawdown by Strategy"); plt.ylabel("Drawdown"); plt.grid(True, alpha=0.3)
    plt.savefig(os.path.join(outdir,"drawdown_box.png"), dpi=150, bbox_inches="tight")

    # EV per hand (approx): sum of profits / total hands
    # EV per hand (approx): sum of profits / total hands
    try:
        df_h = pd.read_csv(hands_csv)
        if df_h.empty:
            print("No hand data available to compute EV per hand.")
        else:
            ev_table = (df_h.groupby("strategy")["profit"].sum() /
                        df_h.groupby("strategy")["profit"].count()).rename("ev_per_hand").to_frame()
            ev_table.to_csv(os.path.join(outdir, "ev_per_hand.csv"))
            print("\nEV per hand:")
            print(ev_table.round(4))
    except pd.errors.EmptyDataError:
        print("Hands CSV is empty or malformed; skipping EV per hand computation.")

    # --- Strategy ranking (quick heuristic) ---------------------------------
    try:
        df = pd.read_csv(sessions_csv)
    except Exception as e:
        print(f"Could not read sessions CSV for ranking: {e}")
        return

    # group metrics
    g = df.groupby('strategy')
    stats = pd.DataFrame({
        'strategy': g.size().index,
        'n_sessions': g.size().values,
        'mean_net': g['net'].mean().values,
        'std_net': g['net'].std(ddof=1).fillna(0).values,
        'median_net': g['net'].median().values,
        'win_rate': g['win_rate'].mean().values,
        'mean_drawdown': g['max_drawdown'].mean().values,
        'risk_of_ruin': (g.apply(lambda x: (x['final_bankroll'] <= 0).mean())).values
    })

    # EV per hand if available
    ev_path = os.path.join(outdir, 'ev_per_hand.csv')
    if os.path.exists(ev_path):
        try:
            ev_df = pd.read_csv(ev_path)
            ev_map = ev_df['ev_per_hand'].to_dict()
            # align by strategy
            stats['ev_per_hand'] = stats['strategy'].map(ev_df['ev_per_hand'].to_dict()).fillna(np.nan)
        except Exception:
            stats['ev_per_hand'] = np.nan
    else:
        stats['ev_per_hand'] = np.nan

    # Normalization helpers
    def minmax_norm(s):
        if s.max() == s.min():
            return pd.Series([0.5]*len(s), index=s.index)
        return (s - s.min()) / (s.max() - s.min())

    # Metrics: higher is better list and lower-is-better list
    higher_better = ['mean_net', 'ev_per_hand', 'win_rate', 'median_net']
    lower_better = ['std_net', 'risk_of_ruin', 'mean_drawdown']

    norm = pd.DataFrame({'strategy': stats['strategy']})
    # normalize each metric; where NaN present keep NaN
    for col in higher_better + lower_better:
        series = stats[col]
        norm_col = None
        if series.isna().all():
            norm[col+'_norm'] = np.nan
            continue
        # for lower is better, invert after min-max
        if col in higher_better:
            norm[col+'_norm'] = minmax_norm(series.fillna(series.min()))
        else:
            # invert: lower -> higher score
            norm[col+'_norm'] = 1.0 - minmax_norm(series.fillna(series.max()))

    # Default weights (adjustable)
    weights = {
        'mean_net': 0.35,
        'ev_per_hand': 0.10,
        'std_net': 0.15,
        'risk_of_ruin': 0.15,
        'mean_drawdown': 0.10,
        'win_rate': 0.15
    }

    # If ev_per_hand all-NaN, remove it and renormalize weights
    if norm['ev_per_hand_norm'].isna().all():
        ev_w = weights.pop('ev_per_hand')
        # distribute ev weight proportionally to remaining weights
        total = sum(weights.values())
        for k in weights:
            weights[k] = weights[k] + weights[k] * (ev_w / total)

    # Build composite score
    score = pd.Series(0.0, index=stats.index)
    for metric, w in weights.items():
        col = metric + '_norm'
        if col in norm.columns:
            score = score + w * norm[col].fillna(0.0).values

    stats = stats.set_index('strategy')
    norm = norm.set_index('strategy')
    stats['composite_score'] = score.values
    stats['rank'] = stats['composite_score'].rank(ascending=False, method='min').astype(int)

    ranking_cols = [
        'n_sessions','mean_net','std_net','median_net','win_rate','risk_of_ruin','mean_drawdown','ev_per_hand','composite_score','rank'
    ]
    ranking = stats.reset_index()[['strategy'] + ranking_cols]
    ranking = ranking.sort_values('composite_score', ascending=False)
    ranking.to_csv(os.path.join(outdir, 'strategy_ranking.csv'), index=False)

    # Print top recommendation
    top = ranking.iloc[0]
    print(f"\nRecommended strategy: {top['strategy']}  (score={top['composite_score']:.3f})")
    print(top[['mean_net','std_net','win_rate','risk_of_ruin','ev_per_hand']].to_string())

    # Bar plot of scores
    try:
        plt.figure(figsize=(8,4))
        plt.bar(ranking['strategy'], ranking['composite_score'], color='C0')
        plt.ylabel('Composite score')
        plt.title('Strategy ranking (higher=better)')
        plt.xticks(rotation=45)
        plt.tight_layout()
        plt.savefig(os.path.join(outdir, 'strategy_ranking.png'), dpi=150)
    except Exception:
        pass


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Blackjack Analytics Experiment Runner")
    p.add_argument("--strategies", type=str, default="flat,martingale,paroli,1326,oscars_grind")
    # If rounds is not provided, let strat2.BankrollConfig use its own default
    p.add_argument("--rounds", type=int, default=None,
                   help="Number of rounds per session (if omitted, uses strat2.BankrollConfig default)")
    p.add_argument("--sessions", type=int, default=None,
                   help="Number of sessions per strategy (if omitted, uses strat2.BankrollConfig default)")
    p.add_argument("--unit", type=int, default=25)
    p.add_argument("--starting", type=int, default=1000)
    p.add_argument("--decks", type=int, default=6)
    p.add_argument("--cut", type=int, default=52)
    p.add_argument("--h17", action="store_true", help="Dealer hits soft 17 (default off -> S17).")
    p.add_argument("--enhc", action="store_true", help="European no-peek (default off -> US peek).")
    p.add_argument("--pay32", action="store_true", help="Use 3:2; default is 6:5 off if not set.")
    p.add_argument("--no_double", action="store_true")
    p.add_argument("--no_table_max", action="store_true")
    p.add_argument("--table_max", type=int, default=500)
    p.add_argument("--seed", type=int, default=42)
    # log_hands should default to True; provide an opt-out flag --no-log-hands
    p.add_argument("--no-log-hands", dest="log_hands", action="store_false",
                   help="Disable hand-level logging (by default hand logs are recorded)")
    p.set_defaults(log_hands=True)
    p.add_argument("--outdir", type=str, default="out")
    p.add_argument("--config", type=str, default=None,
                   help="Path to YAML or JSON config file with default experiment settings")
    args = p.parse_args()

    # Load config file if provided and apply defaults (CLI overrides config)
    if args.config:
        cfg_path = args.config
        if not os.path.exists(cfg_path):
            print(f"Config file not found: {cfg_path}")
            sys.exit(1)
        try:
            if cfg_path.lower().endswith(('.yml', '.yaml')):
                if yaml is None:
                    raise RuntimeError('PyYAML not installed; cannot read YAML config')
                with open(cfg_path, 'r') as fh:
                    cfg = yaml.safe_load(fh) or {}
            else:
                with open(cfg_path, 'r') as fh:
                    cfg = _json.load(fh) or {}
        except Exception as e:
            print(f"Failed to read config file {cfg_path}: {e}")
            sys.exit(1)

        # apply config values only when user didn't override them (compare to parser defaults)
        for key, val in cfg.items():
            try:
                default = p.get_default(key)
            except Exception:
                # ignore unknown keys
                continue
            if getattr(args, key, None) == default:
                setattr(args, key, val)

    # defaults: S17, 6:5 off unless pay32 set, US peek by default
    if not args.h17:
        # we want S17 default, so set False (already False by default in TableRules)
        pass
    if not args.pay32:
        # default to 6:5? The posting used 3:2 earlier—keep 3:2 as default:
        args.pay32 = True  # most common fair game baseline

    run_experiment(args)
