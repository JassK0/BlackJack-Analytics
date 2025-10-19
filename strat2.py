# simulator.py
import random
from dataclasses import dataclass, asdict
from typing import List, Tuple, Dict, Optional
import math
import uuid
import time

# --------- Card / Rules ---------
RANKS = ('2','3','4','5','6','7','8','9','10','J','Q','K','A')
VALUES = {'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':10,'Q':10,'K':10,'A':11}

@dataclass
class TableRules:
    num_decks: int = 6
    cut_card: int = 52                  # reshuffle when <= this many cards remain
    dealer_hits_soft_17: bool = True    # True=H17, False=S17
    hole_card: bool = True              # US peek on A/10; False=ENHC (no peek)
    pay_bj: float = 1.5                 # 3:2 -> 1.5; 6:5 -> 1.2
    allow_double: bool = True
    table_max: Optional[int] = 500      # None => unlimited

@dataclass
class BankrollConfig:
    starting_bankroll: int = 1000
    bet_base: int = 25
    rounds: int = 18
    sessions: int = 100

@dataclass
class StrategyConfig:
    kind: str = "paroli"                # 'flat'|'martingale'|'paroli'|'1326'|'oscars_grind'
    mart_reset_on_win: bool = True
    mart_reset_on_push: bool = False
    paroli_streak_cap: int = 3
    paroli_reset_on_push: bool = False
    seq_reset_on_push: bool = True
    osc_reset_on_push: bool = False

# --------- Utilities ---------
def build_shoe(n: int) -> List[str]:
    shoe = []
    for _ in range(n):
        for r in RANKS:
            shoe.extend([r]*4)
    random.shuffle(shoe)
    return shoe

def hand_total(hand: List[str]) -> int:
    total, aces = 0, 0
    for c in hand:
        v = VALUES[c]
        total += v
        if c == 'A':
            aces += 1
    while total > 21 and aces:
        total -= 10
        aces -= 1
    return total

def is_soft(hand: List[str]) -> bool:
    # Soft if an Ace can count as 11 without bust
    total, aces = 0, 0
    for c in hand:
        total += VALUES[c]
        if c == 'A': aces += 1
    while total > 21 and aces:
        total -= 10; aces -= 1
    return ('A' in hand) and (total <= 11)

def dealer_peek_if_needed(upcard: str, hole: str) -> bool:
    if upcard in ('A','10','J','Q','K'):
        return hand_total([upcard, hole]) == 21
    return False

def cap_bet(desired: int, bankroll: int, table_max: Optional[int]) -> int:
    cap = bankroll if table_max is None else min(bankroll, table_max)
    return max(0, min(int(desired), cap))

# --------- Player Policy (basic, no splits/surrender) ---------
def player_action(hand: List[str], dealer_up: str, allow_double: bool) -> str:
    total = hand_total(hand)
    up_val = 11 if dealer_up == 'A' else VALUES[dealer_up]

    # Soft
    if is_soft(hand):
        if total <= 17:
            if allow_double and len(hand) == 2 and 3 <= up_val <= 6:
                return 'DOUBLE'
            return 'HIT'
        elif total == 18:
            if allow_double and len(hand) == 2 and 3 <= up_val <= 6:
                return 'DOUBLE'
            if up_val in (9,10,11): return 'HIT'
            return 'STAND'
        else:
            return 'STAND'
    # Hard
    if total <= 8: return 'HIT'
    if total == 9:
        if allow_double and len(hand) == 2 and 3 <= up_val <= 6: return 'DOUBLE'
        return 'HIT'
    if total == 10:
        if allow_double and len(hand) == 2 and up_val <= 9: return 'DOUBLE'
        return 'HIT'
    if total == 11:
        if allow_double and len(hand) == 2: return 'DOUBLE'
        return 'HIT'
    if total == 12: return 'STAND' if 4 <= up_val <= 6 else 'HIT'
    if 13 <= total <= 16: return 'STAND' if 2 <= up_val <= 6 else 'HIT'
    return 'STAND'

# --------- Round Settle ---------
def settle(bankroll: int, base_bet: int, p_total: int, d_total: int,
           pay_bj: float, player_blackjack: bool=False, dealer_blackjack: bool=False) -> Tuple[int,str,int]:
    """Return (new_bankroll, outcome 'W'|'L'|'P', profit_loss_int)"""
    if player_blackjack and dealer_blackjack:
        return bankroll, 'P', 0
    if player_blackjack:
        win = int(base_bet * pay_bj)
        return bankroll + win, 'W', win
    if dealer_blackjack:
        return bankroll - base_bet, 'L', -base_bet
    if p_total > 21:
        return bankroll - base_bet, 'L', -base_bet
    if d_total > 21:
        return bankroll + base_bet, 'W', base_bet
    if p_total > d_total:
        return bankroll + base_bet, 'W', base_bet
    if d_total > p_total:
        return bankroll - base_bet, 'L', -base_bet
    return bankroll, 'P', 0

# --------- Strategies ---------
class StrategyBase:
    def __init__(self, unit: int, rules: TableRules):
        self.unit = unit
        self.rules = rules

    def start_bet(self, bankroll: int) -> int:
        return cap_bet(self.unit, bankroll, self.rules.table_max)

    def next_bet(self, prev_bet: int, outcome: str, bankroll: int) -> int:
        raise NotImplementedError

class Flat(StrategyBase):
    def next_bet(self, prev_bet, outcome, bankroll):
        return cap_bet(self.unit, bankroll, self.rules.table_max)

class Martingale(StrategyBase):
    def __init__(self, unit, rules, reset_on_win=True, reset_on_push=False):
        super().__init__(unit, rules)
        self.rw = reset_on_win; self.rp = reset_on_push
    def next_bet(self, prev_bet, outcome, bankroll):
        if outcome == 'L':
            desired = max(self.unit, prev_bet*2)
        elif outcome == 'W':
            desired = self.unit if self.rw else prev_bet
        else:
            desired = self.unit if self.rp else prev_bet
        return cap_bet(desired, bankroll, self.rules.table_max)

class Paroli(StrategyBase):
    def __init__(self, unit, rules, streak_cap=3, reset_on_push=False):
        super().__init__(unit, rules)
        self.cap = streak_cap; self.rp = reset_on_push; self.streak = 0
    def next_bet(self, prev_bet, outcome, bankroll):
        if outcome == 'W':
            self.streak += 1
            if self.streak >= self.cap:
                self.streak = 0; desired = self.unit
            else:
                desired = max(self.unit, prev_bet*2)
        elif outcome == 'L':
            self.streak = 0; desired = self.unit
        else:
            if self.rp: self.streak = 0; desired = self.unit
            else: desired = prev_bet
        return cap_bet(desired, bankroll, self.rules.table_max)

class OneThreeTwoSix(StrategyBase):
    seq = [1,3,2,6]
    def __init__(self, unit, rules, reset_on_push=True):
        super().__init__(unit, rules); self.idx = 0; self.rp = reset_on_push
    def next_bet(self, prev_bet, outcome, bankroll):
        if outcome == 'W':
            self.idx = (self.idx + 1) % len(self.seq)
        elif outcome == 'L':
            self.idx = 0
        else:
            if self.rp: self.idx = 0
        desired = self.unit * self.seq[self.idx]
        return cap_bet(desired, bankroll, self.rules.table_max)

class OscarsGrind(StrategyBase):
    def __init__(self, unit, rules, reset_on_push=False):
        super().__init__(unit, rules)
        self.series_profit = 0; self.current_units = 1; self.rp = reset_on_push
    def next_bet(self, prev_bet, outcome, bankroll):
        u = self.unit
        if outcome == 'W':
            self.series_profit += self.current_units * u
            if self.series_profit >= u:
                self.series_profit = 0; self.current_units = 1
            else:
                self.current_units += 1
        elif outcome == 'L':
            self.series_profit -= self.current_units * u
        else:
            if self.rp: self.series_profit = 0; self.current_units = 1
        return cap_bet(self.current_units * u, bankroll, self.rules.table_max)

def make_strategy(cfg: StrategyConfig, rules: TableRules) -> StrategyBase:
    if cfg.kind == 'flat': return Flat(cfg.bet_base if hasattr(cfg,'bet_base') else 25, rules)
    if cfg.kind == 'martingale': return Martingale(25, rules, cfg.mart_reset_on_win, cfg.mart_reset_on_push)
    if cfg.kind == 'paroli': return Paroli(25, rules, cfg.paroli_streak_cap, cfg.paroli_reset_on_push)
    if cfg.kind == '1326': return OneThreeTwoSix(25, rules, cfg.seq_reset_on_push)
    if cfg.kind == 'oscars_grind': return OscarsGrind(25, rules, cfg.osc_reset_on_push)
    raise ValueError("Unknown strategy")

# --------- Simulation (with logging) ---------
@dataclass
class HandLog:
    session_id: str
    hand_idx: int
    stake: int
    bankroll_before: int
    bankroll_after: int
    outcome: str                     # W/L/P
    profit: int
    player_total: int
    dealer_total: int
    player_bj: int
    dealer_bj: int
    dealer_up: str
    player_len: int
    dealer_len: int
    player_cards: List[str]
    dealer_cards: List[str]

@dataclass
class SessionSummary:
    session_id: str
    strategy: str
    rounds_played: int
    starting_bankroll: int
    final_bankroll: int
    net: int
    win: int
    lose: int
    push: int
    win_rate: float
    avg_stake: float
    max_drawdown: int
    table_max_hits: int
    bust: int                       # went to 0
    rules: Dict

def play_hand(shoe: List[str], bankroll: int, stake: int, rules: TableRules) -> Tuple[int,str,int,Dict]:
    if len(shoe) <= rules.cut_card:
        shoe[:] = build_shoe(rules.num_decks)

    dealer = [shoe.pop(), shoe.pop()]
    player = [shoe.pop(), shoe.pop()]

    p_total = hand_total(player); d_total = hand_total(dealer)
    player_blackjack = (p_total == 21)

    # Peek
    if rules.hole_card:
        if dealer_peek_if_needed(dealer[0], dealer[1]):
            nb, outcome, profit = settle(bankroll, stake, p_total, 21, rules.pay_bj,
                                         player_blackjack, True)
            return nb, outcome, profit, {
                "player_total": p_total, "dealer_total": 21,
                "player_bj": int(player_blackjack), "dealer_bj": 1,
                "player_len": len(player), "dealer_len": 2, "dealer_up": dealer[0],
                "player_cards": player.copy(), "dealer_cards": dealer.copy()
            }
        if player_blackjack:
            nb, outcome, profit = settle(bankroll, stake, 21, d_total, rules.pay_bj,
                                         True, False)
            return nb, outcome, profit, {
                "player_total": 21, "dealer_total": d_total,
                "player_bj": 1, "dealer_bj": 0,
                "player_len": len(player), "dealer_len": 2, "dealer_up": dealer[0],
                "player_cards": player.copy(), "dealer_cards": dealer.copy()
            }

    # Player turn
    current_bet = stake
    while True:
        action = player_action(player, dealer[0], rules.allow_double)
        if action == 'DOUBLE' and rules.allow_double and len(player)==2:
            if bankroll >= current_bet * 2:
                current_bet *= 2
                player.append(shoe.pop())
                break
            else:
                action = 'HIT'
        if action == 'HIT':
            player.append(shoe.pop())
            if hand_total(player) > 21:
                return bankroll - current_bet, 'L', -current_bet, {
                    "player_total": hand_total(player), "dealer_total": hand_total(dealer),
                    "player_bj": 0, "dealer_bj": 0,
                    "player_len": len(player), "dealer_len": len(dealer),
                    "dealer_up": dealer[0],
                    "player_cards": player.copy(), "dealer_cards": dealer.copy()
                }
        else:
            break

    # Dealer turn
    while True:
        d_total = hand_total(dealer)
        if d_total > 21:
            return bankroll + current_bet, 'W', current_bet, {
                "player_total": hand_total(player), "dealer_total": d_total,
                "player_bj": 0, "dealer_bj": 0,
                "player_len": len(player), "dealer_len": len(dealer),
                "dealer_up": dealer[0],
                "player_cards": player.copy(), "dealer_cards": dealer.copy()
            }
        if d_total < 17:
            dealer.append(shoe.pop()); continue
        if d_total == 17 and rules.dealer_hits_soft_17 and is_soft(dealer):
            dealer.append(shoe.pop()); continue
        break

    p_total = hand_total(player); d_total = hand_total(dealer)
    nb, outcome, profit = settle(bankroll, current_bet, p_total, d_total, rules.pay_bj,
                                 False, False)
    return nb, outcome, profit, {
        "player_total": p_total, "dealer_total": d_total,
        "player_bj": 0, "dealer_bj": 0,
        "player_len": len(player), "dealer_len": len(dealer),
        "dealer_up": dealer[0],
        "player_cards": player.copy(), "dealer_cards": dealer.copy()
    }

def run_session(strategy_cfg: StrategyConfig,
                rules: TableRules,
                bank_cfg: BankrollConfig,
                seed: Optional[int]=None,
                log_hands: bool=True) -> Tuple[List[HandLog], SessionSummary]:
    if seed is not None:
        random.seed(seed)
    session_id = str(uuid.uuid4())[:8]
    shoe = build_shoe(rules.num_decks)
    bankroll = bank_cfg.starting_bankroll
    strat = make_strategy(strategy_cfg, rules)
    # bind base to strategy if absent
    if not hasattr(strategy_cfg, 'bet_base'):
        strategy_cfg.bet_base = bank_cfg.bet_base

    stake = strat.start_bet(bankroll)
    outcomes = {'W':0,'L':0,'P':0}
    handlogs: List[HandLog] = []
    bankroll_track = [bankroll]
    table_max_hits = 0
    max_peak = bankroll
    max_drawdown = 0

    for i in range(1, bank_cfg.rounds+1):
        if bankroll <= 0: break
        stake = cap_bet(stake, bankroll, rules.table_max)
        if rules.table_max is not None and stake >= rules.table_max:
            table_max_hits += 1

        before = bankroll
        bankroll, outcome, profit, extras = play_hand(shoe, bankroll, stake, rules)
        outcomes[outcome] += 1
        bankroll_track.append(bankroll)

        # drawdown
        if bankroll > max_peak: max_peak = bankroll
        dd = max_peak - bankroll
        if dd > max_drawdown: max_drawdown = dd

        if log_hands:
            handlogs.append(HandLog(
                session_id=session_id, hand_idx=i, stake=stake,
                bankroll_before=before, bankroll_after=bankroll,
                outcome=outcome, profit=profit,
                player_total=extras["player_total"], dealer_total=extras["dealer_total"],
                player_bj=extras["player_bj"], dealer_bj=extras["dealer_bj"],
                dealer_up=extras["dealer_up"], player_len=extras["player_len"], dealer_len=extras["dealer_len"],
                player_cards=extras.get("player_cards", []).copy(), dealer_cards=extras.get("dealer_cards",[]).copy()
            ))

        # Next bet
        stake = strat.next_bet(stake, outcome, bankroll)

    total = sum(outcomes.values())
    win_rate = outcomes['W']/total if total else 0.0
    summary = SessionSummary(
        session_id=session_id,
        strategy=strategy_cfg.kind,
        rounds_played=total,
        starting_bankroll=bank_cfg.starting_bankroll,
        final_bankroll=bankroll,
        net=bankroll - bank_cfg.starting_bankroll,
        win=outcomes['W'], lose=outcomes['L'], push=outcomes['P'],
        win_rate=win_rate,
        avg_stake=(sum(h.stake for h in handlogs)/total if total else 0.0),
        max_drawdown=max_drawdown,
        table_max_hits=table_max_hits,
        bust=int(bankroll <= 0),
        rules=asdict(rules)
    )
    return handlogs, summary
