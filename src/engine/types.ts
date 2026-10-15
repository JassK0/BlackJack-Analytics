// Shared types for the simulator (a TypeScript port of strat2.py)

export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
export type Outcome = 'W' | 'L' | 'P';
export type Action = 'HIT' | 'STAND' | 'DOUBLE';

export interface Rules {
  decks: number;              // 1-8
  cutCard: number;            // reshuffle when this many cards (or fewer) remain
  hitSoft17: boolean;         // H17 when true, S17 when false
  holeCard: boolean;          // US peek; false = European no-hole-card
  blackjackPays: number;      // 1.5 = 3:2, 1.2 = 6:5
  allowDouble: boolean;
  tableMax: number | null;    // null = no limit
}

export interface Bankroll {
  start: number;
  unit: number;               // base bet in dollars
  rounds: number;             // hands per session
  sessions: number;           // sessions per strategy
}

export type BuiltinKey = 'flat' | 'martingale' | 'paroli' | '1326' | 'oscars_grind' | 'dalembert' | 'fibonacci' | 'labouchere';

export interface BuiltinOptions {
  martResetOnWin: boolean;
  martResetOnPush: boolean;
  paroliStreakCap: number;
  paroliResetOnPush: boolean;
  seqResetOnPush: boolean;
  oscResetOnPush: boolean;
  dalStep: number;            // D'Alembert: units added after a loss / removed after a win
  fibBack: number;            // Fibonacci: steps back after a win
  labLength: number;          // Labouchere: starting line 1, 2, ..., labLength
}

/** How a custom strategy changes its bet after a result. */
export type Adjust =
  | { kind: 'reset' }
  | { kind: 'keep' }
  | { kind: 'multiply'; value: number }   // progression mode: bet x value
  | { kind: 'add'; value: number }        // progression mode: +/- units
  | { kind: 'step'; value: number };      // sequence mode: move +/- steps

export interface CustomStrategy {
  id: string;
  name: string;
  mode: 'progression' | 'sequence';
  startUnits: number;
  onWin: Adjust;
  onLoss: Adjust;
  onPush: Adjust;
  sequence: number[];                     // units per step (sequence mode)
  sequenceEnd: 'wrap' | 'stay';           // what happens when stepping past the last step
  minUnits: number;
  maxUnits: number;                       // 0 = no cap
  resetAfterWins: number;                 // 0 = off
  resetAfterLosses: number;               // 0 = off
  stopWin: number;                        // end the session once up this many units (0 = off)
  stopLoss: number;                       // end the session once down this many units (0 = off)
  slot: number;                           // preferred colour slot
}

export type StrategyDef =
  | { kind: 'builtin'; key: BuiltinKey; options: BuiltinOptions }
  | { kind: 'custom'; def: CustomStrategy };

/** A strategy as it takes part in a run: identity, colour and the definition the engine needs. */
export interface StrategySpec {
  id: string;
  name: string;
  slot: number;
  def: StrategyDef;
}

export interface Decision {
  total: number;
  soft: boolean;
  action: Action;
  note?: string;
}

export type Phase = 'play' | 'dealer_blackjack' | 'player_blackjack';
export type HandResult = 'blackjack' | 'win' | 'dealer_bust' | 'lose' | 'bust' | 'dealer_blackjack' | 'push';

export interface Hand {
  stake: number;              // bet before any double
  bet: number;                // total wagered (after a double)
  profit: number;
  outcome: Outcome;
  player: Rank[];
  dealer: Rank[];
  doubled: boolean;
  phase: Phase;
  peeked: boolean;            // dealer checked for blackjack (US peek with an ace or ten up)
  dealerPlays: boolean;       // dealer drew to a total
  result: HandResult;
  decisions: Decision[];
  reshuffled: boolean;
  shoeBefore: number;         // cards in the shoe before this hand was dealt
}

export interface HandLog extends Hand {
  index: number;              // 1-based hand number
  before: number;
  after: number;
  nextBet: number;
  reason: string;             // why the strategy picks its next bet
}

export interface SessionSummary {
  net: number;
  final: number;
  rounds: number;
  wins: number;
  losses: number;
  pushes: number;
  blackjacks: number;
  doubles: number;
  winRate: number;
  stakeTotal: number;
  maxStake: number;
  maxDrawdown: number;
  tableMaxHits: number;
  bust: boolean;
  stopped: boolean;           // ended early by a custom stop-win / stop-loss rule
}
