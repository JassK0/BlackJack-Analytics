// Playing hands and sessions (port of strat2.play_hand / run_session)
import type { Action, Bankroll, Decision, Hand, HandLog, HandResult, Outcome, Phase, Rank, Rules, SessionSummary, StrategyDef } from './types';
import { buildShoe, handValue, isTenOrAce, VALUES } from './cards';
import { createStrategy } from './strategies';
import { sessionRng, type Rng } from './rng';
import { money } from '../lib/format';

/** The fixed player policy: simplified basic strategy, no splits or surrender (same as strat2.player_action). */
export function playerAction(hand: readonly Rank[], up: Rank, allowDouble: boolean): Action {
  const { total, soft } = handValue(hand);
  const upVal = up === 'A' ? 11 : VALUES[up];
  const two = hand.length === 2;
  if (soft) {
    if (total <= 17) return allowDouble && two && upVal >= 3 && upVal <= 6 ? 'DOUBLE' : 'HIT';
    if (total === 18) {
      if (allowDouble && two && upVal >= 3 && upVal <= 6) return 'DOUBLE';
      return upVal >= 9 ? 'HIT' : 'STAND';
    }
    return 'STAND';
  }
  if (total <= 8) return 'HIT';
  if (total === 9) return allowDouble && two && upVal >= 3 && upVal <= 6 ? 'DOUBLE' : 'HIT';
  if (total === 10) return allowDouble && two && upVal <= 9 ? 'DOUBLE' : 'HIT';
  if (total === 11) return allowDouble && two ? 'DOUBLE' : 'HIT';
  if (total === 12) return upVal >= 4 && upVal <= 6 ? 'STAND' : 'HIT';
  if (total <= 16) return upVal >= 2 && upVal <= 6 ? 'STAND' : 'HIT';
  return 'STAND';
}

export function capBet(desired: number, bankroll: number, tableMax: number | null): number {
  const cap = tableMax == null ? bankroll : Math.min(bankroll, tableMax);
  return Math.max(0, Math.min(Math.floor(desired), cap));
}

export interface Shoe { cards: Rank[]; rng: Rng; decks: number }

const NO_DECISIONS: Decision[] = [];

/** Deal and settle one hand. `bankroll` decides whether a double is affordable. */
export function playHand(shoe: Shoe, bankroll: number, stake: number, rules: Rules, log: boolean): Hand {
  let reshuffled = false;
  if (shoe.cards.length <= rules.cutCard) { shoe.cards = buildShoe(rules.decks, shoe.rng); reshuffled = true; }
  const cards = shoe.cards;
  const shoeBefore = cards.length;
  const dealer: Rank[] = [cards.pop()!, cards.pop()!];
  const player: Rank[] = [cards.pop()!, cards.pop()!];
  const up = dealer[0];
  const playerBJ = handValue(player).total === 21;
  const dealerBJ = handValue(dealer).total === 21;
  const peeked = rules.holeCard && isTenOrAce(up);

  const done = (profit: number, outcome: Outcome, result: HandResult, phase: Phase, bet: number, decisions: Decision[], doubled: boolean, dealerPlays: boolean): Hand =>
    ({ stake, bet, profit, outcome, player, dealer, doubled, phase, peeked, dealerPlays, result, decisions, reshuffled, shoeBefore });

  // naturals: US peek settles a dealer blackjack before the player acts; a player natural pays at once
  if (rules.holeCard && peeked && dealerBJ) {
    return playerBJ ? done(0, 'P', 'push', 'dealer_blackjack', stake, NO_DECISIONS, false, false)
      : done(-stake, 'L', 'dealer_blackjack', 'dealer_blackjack', stake, NO_DECISIONS, false, false);
  }
  if (playerBJ) {
    if (dealerBJ) return done(0, 'P', 'push', 'dealer_blackjack', stake, NO_DECISIONS, false, false);
    return done(Math.floor(stake * rules.blackjackPays), 'W', 'blackjack', 'player_blackjack', stake, NO_DECISIONS, false, false);
  }

  // player turn
  let bet = stake;
  let doubled = false;
  const decisions: Decision[] = log ? [] : NO_DECISIONS;
  for (;;) {
    let action = playerAction(player, up, rules.allowDouble);
    const v = log ? handValue(player) : null;
    if (action === 'DOUBLE') {
      if (bankroll >= bet * 2) {
        if (v) decisions.push({ total: v.total, soft: v.soft, action });
        bet *= 2; doubled = true;
        player.push(cards.pop()!);
        break;
      }
      action = 'HIT';
      if (v) decisions.push({ total: v.total, soft: v.soft, action, note: "can't afford to double" });
    } else if (v) {
      decisions.push({ total: v.total, soft: v.soft, action });
    }
    if (action === 'HIT') {
      player.push(cards.pop()!);
      if (handValue(player).total > 21) return done(-bet, 'L', 'bust', 'play', bet, decisions, doubled, false);
    } else break;
  }

  // European no-hole-card: the dealer's natural shows up only now and takes the whole bet
  if (!rules.holeCard && dealerBJ) return done(-bet, 'L', 'dealer_blackjack', 'play', bet, decisions, doubled, false);

  // dealer turn
  for (;;) {
    const d = handValue(dealer);
    if (d.total > 21) return done(bet, 'W', 'dealer_bust', 'play', bet, decisions, doubled, true);
    if (d.total < 17 || (d.total === 17 && rules.hitSoft17 && d.soft)) { dealer.push(cards.pop()!); continue; }
    break;
  }
  const p = handValue(player).total, d = handValue(dealer).total;
  if (p > d) return done(bet, 'W', 'win', 'play', bet, decisions, doubled, true);
  if (d > p) return done(-bet, 'L', 'lose', 'play', bet, decisions, doubled, true);
  return done(0, 'P', 'push', 'play', bet, decisions, doubled, true);
}

export interface SessionOptions {
  log?: boolean;
  /** Called after every hand with the bankroll before and after it. */
  onHand?: (h: Hand, index: number, before: number, after: number) => void;
}

/** One session for one strategy. Same (seed, session) => same shoe for every strategy. */
export function runSession(def: StrategyDef, rules: Rules, bank: Bankroll, seed: number, session: number, opts: SessionOptions = {}):
  { summary: SessionSummary; hands: HandLog[] } {
  const rng = sessionRng(seed, session);
  const shoe: Shoe = { cards: buildShoe(rules.decks, rng), rng, decks: rules.decks };
  const strat = createStrategy(def, bank.unit);
  const tmax = rules.tableMax;
  let bankroll = bank.start;
  let stake = capBet(strat.start(), bankroll, tmax);
  let wins = 0, losses = 0, pushes = 0, blackjacks = 0, doubles = 0;
  let peak = bankroll, maxDrawdown = 0, tableMaxHits = 0, stakeTotal = 0, maxStake = 0, rounds = 0;
  let stopped = false;
  const hands: HandLog[] = [];

  for (let i = 1; i <= bank.rounds; i++) {
    if (bankroll <= 0) break;
    if (strat.stop && strat.stop(bankroll - bank.start)) { stopped = true; break; }
    stake = capBet(stake, bankroll, tmax);
    if (tmax != null && stake >= tmax) tableMaxHits++;
    const before = bankroll;
    const h = playHand(shoe, bankroll, stake, rules, !!opts.log);
    bankroll += h.profit;
    rounds++;
    stakeTotal += stake;
    if (stake > maxStake) maxStake = stake;
    if (h.outcome === 'W') wins++; else if (h.outcome === 'L') losses++; else pushes++;
    if (h.result === 'blackjack') blackjacks++;
    if (h.doubled) doubles++;
    if (bankroll > peak) peak = bankroll;
    if (peak - bankroll > maxDrawdown) maxDrawdown = peak - bankroll;
    opts.onHand?.(h, i, before, bankroll);

    const desired = strat.next(stake, h.outcome);
    const next = capBet(desired, bankroll, tmax);
    if (opts.log) {
      let reason = strat.explain(stake, h.outcome, desired);
      if (bankroll <= 0) reason = 'The bankroll is empty, so the session is over.';
      else if (next < Math.floor(desired)) {
        reason += tmax != null && next === tmax ? ` Capped at the ${money(tmax)} table max.` : ` Capped: only ${money(bankroll)} left.`;
      }
      if (bankroll > 0 && strat.stop && strat.stop(bankroll - bank.start)) reason += ' That hits the stop rule, so the session ends here.';
      hands.push({ ...h, index: i, before, after: bankroll, nextBet: next, reason });
    }
    stake = next;
  }
  return {
    summary: {
      net: bankroll - bank.start, final: bankroll, rounds, wins, losses, pushes, blackjacks, doubles,
      winRate: rounds ? wins / rounds : 0, stakeTotal, maxStake, maxDrawdown, tableMaxHits,
      bust: bankroll <= 0, stopped,
    },
    hands,
  };
}
