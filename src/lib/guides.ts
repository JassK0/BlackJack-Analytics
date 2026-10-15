// Plain-English guides for each strategy, a showcase demo session, and a quick test
import type { Bankroll, HandLog, Rules, StrategyDef } from '../engine/types';
import { adjustText, BUILTINS, DEFAULT_OPTIONS, describeCustom, fmtUnits } from '../engine/strategies';
import { runSession } from '../engine/session';
import { simulate } from '../engine/simulate';

export interface Guide {
  summary: string;
  how: { when: string; then: string }[];
  notes: string[];
  likes: string[];
  catches: string[];
}

export function guideFor(def: StrategyDef): Guide {
  if (def.kind === 'custom') return customGuide(def);
  const o = { ...DEFAULT_OPTIONS, ...def.options };
  const b = BUILTINS.find((x) => x.key === def.key)!;
  const g = (how: Guide['how'], likes: string[], catches: string[], notes: string[] = []): Guide => ({ summary: `${b.summary} ${b.detail}`, how, notes, likes, catches });
  switch (def.key) {
    case 'flat':
      return g([{ when: 'Start', then: 'Bet 1 unit.' }, { when: 'After a win', then: 'Bet 1 unit.' }, { when: 'After a loss', then: 'Bet 1 unit.' }, { when: 'After a push', then: 'Bet 1 unit.' }],
        ['Simplest possible plan: nothing to track.', 'Smallest swings, so the bankroll lasts longest.'],
        ['No way to "win it back": you simply pay the house edge, slowly.']);
    case 'martingale':
      return g([{ when: 'Start', then: 'Bet 1 unit.' },
        { when: 'After a win', then: o.martResetOnWin ? 'Go back to 1 unit. One win recovers every loss in the streak plus 1 unit.' : 'Keep the same bet.' },
        { when: 'After a loss', then: 'Double the last bet: 1, 2, 4, 8, 16... units.' },
        { when: 'After a push', then: o.martResetOnPush ? 'Go back to 1 unit.' : 'Keep the same bet.' }],
        ['Most sessions end slightly ahead.', 'Feels safe: one win always clears the streak.'],
        ['Six losses in a row needs a 64-unit bet. The table max or your bankroll stops the doubling, and that one streak wipes out many small wins.'],
        ['Losing streaks are less rare than they feel: you lose about 48% of blackjack hands.']);
    case 'paroli':
      return g([{ when: 'Start', then: 'Bet 1 unit.' },
        { when: 'After a win', then: `Double the bet with the winnings, up to ${o.paroliStreakCap} wins in a row; then bank it and go back to 1 unit.` },
        { when: 'After a loss', then: 'Go back to 1 unit.' },
        { when: 'After a push', then: o.paroliResetOnPush ? 'Go back to 1 unit.' : 'Keep the bet and the streak.' }],
        ['A loss only ever costs 1 unit of your own money.', 'Big bets are made with money just won.'],
        ['Most streaks end before the cap, giving back the pressed winnings.']);
    case '1326':
      return g([{ when: 'Start', then: 'Bet 1 unit.' },
        { when: 'After a win', then: 'Move to the next step of 1 → 3 → 2 → 6 units; after the 6, start over at 1.' },
        { when: 'After a loss', then: 'Start over at 1 unit.' },
        { when: 'After a push', then: o.seqResetOnPush ? 'Start over at 1 unit.' : 'Stay on the current step.' }],
        ['Risk is capped: a cycle never loses more than 2 units.', 'Four wins in a row bank 12 units.'],
        ['The 6-unit bet comes after three wins and loses almost half the time, taking the cycle\'s profit with it.']);
    case 'oscars_grind':
      return g([{ when: 'Start', then: 'Bet 1 unit. Each series aims to finish exactly 1 unit up.' },
        { when: 'After a win', then: 'Raise the bet by 1 unit, unless that win already put the series 1 unit up; then start a new series at 1 unit.' },
        { when: 'After a loss', then: 'Keep the same bet.' },
        { when: 'After a push', then: o.oscResetOnPush ? 'Start a new series.' : 'Keep the same bet.' }],
        ['Bets only rise after wins, so it feels patient and controlled.', 'Most series end with the small target reached.'],
        ['A long losing series keeps the bet high while the deficit grows, so it can bust slowly.']);
    case 'dalembert':
      return g([{ when: 'Start', then: 'Bet 1 unit.' },
        { when: 'After a win', then: `Remove ${o.dalStep} unit${o.dalStep === 1 ? '' : 's'} (never below 1).` },
        { when: 'After a loss', then: `Add ${o.dalStep} unit${o.dalStep === 1 ? '' : 's'}.` },
        { when: 'After a push', then: 'Keep the same bet.' }],
        ['Much gentler than Martingale: bets climb one step at a time.', 'Recovers small losing runs once wins and losses even out.'],
        ['It assumes wins and losses balance, but the house wins more hands, so long stretches ratchet the bet up.']);
    case 'fibonacci':
      return g([{ when: 'Start', then: 'Bet 1 unit, the first number of 1, 1, 2, 3, 5, 8, 13, 21...' },
        { when: 'After a win', then: `Move back ${o.fibBack} step${o.fibBack === 1 ? '' : 's'} in the sequence.` },
        { when: 'After a loss', then: 'Move one step forward in the sequence.' },
        { when: 'After a push', then: 'Stay on the same step.' }],
        ['Grows more slowly than Martingale.', 'A couple of wins undo several losses.'],
        ['Still a loss-chasing system: nine losses in a row means a 55-unit bet.']);
    case 'labouchere': {
      const n = Math.max(2, Math.min(8, o.labLength));
      const line = Array.from({ length: n }, (_, i) => i + 1);
      return g([{ when: 'Start', then: `Write the line ${line.join('-')} and bet first + last (${1 + n} units).` },
        { when: 'After a win', then: 'Cross off the first and last numbers, then bet the new first + last.' },
        { when: 'After a loss', then: 'Write the amount you lost at the end of the line.' },
        { when: 'After a push', then: 'Leave the line as it is.' }],
        [`You pick the target: clearing the line banks ${line.reduce((a, b) => a + b, 0)} units.`, 'Each win removes two numbers, each loss adds only one.'],
        ['Even the first bet is several units, and the line grows with every loss, so bets escalate fast and it goes broke often.'],
        ['When the line is cleared, a new one starts.']);
    }
  }
}

function customGuide(def: Extract<StrategyDef, { kind: 'custom' }>): Guide {
  const d = def.def;
  const lines = describeCustom(d);
  const how = [
    { when: 'Start', then: d.mode === 'sequence' ? `Bet ${fmtUnits(d.sequence[0])} unit${d.sequence[0] === 1 ? '' : 's'}, step 1 of ${d.sequence.map(fmtUnits).slice(0, 10).join(', ')}${d.sequence.length > 10 ? '...' : ''}.` : `Bet ${fmtUnits(d.startUnits)} unit${d.startUnits === 1 ? '' : 's'}.` },
    { when: 'After a win', then: cap(adjustText(d.onWin, d.mode)) + '.' },
    { when: 'After a loss', then: cap(adjustText(d.onLoss, d.mode)) + '.' },
    { when: 'After a push', then: cap(adjustText(d.onPush, d.mode)) + '.' },
  ];
  const raisesOnLoss = (d.onLoss.kind === 'multiply' && d.onLoss.value > 1) || (d.onLoss.kind === 'add' && d.onLoss.value > 0) || (d.onLoss.kind === 'step' && d.onLoss.value > 0);
  const raisesOnWin = (d.onWin.kind === 'multiply' && d.onWin.value > 1) || (d.onWin.kind === 'add' && d.onWin.value > 0) || (d.onWin.kind === 'step' && d.onWin.value > 0);
  const likes: string[] = [], catches: string[] = [];
  if (raisesOnWin) likes.push('Presses winning streaks.');
  if (d.maxUnits > 0) likes.push(`Bets are capped at ${fmtUnits(d.maxUnits)} units, which limits the damage of a bad run.`);
  if (d.stopWin > 0 || d.stopLoss > 0) likes.push('Walks away at a set profit or loss instead of playing every hand.');
  if (!likes.length) likes.push('Your rules, tested on the same shoes as every other strategy.');
  if (raisesOnLoss) catches.push('Raises bets after losses, so losing streaks get expensive.');
  catches.push('No betting pattern changes the house edge on each hand.');
  return { summary: 'Your own strategy.', how, notes: lines.slice(4), likes, catches };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A short session that shows the strategy doing its thing: bet changes, a
 * losing run and a winning run. Deterministic, so the demo is the same every time.
 */
export function pickDemo(def: StrategyDef, rules: Rules, bank: Bankroll, hands = 16): { seed: number; hands: HandLog[] } {
  let best = { seed: 1, hands: [] as HandLog[], score: -Infinity };
  const b = { ...bank, rounds: hands, sessions: 1 };
  for (let seed = 1; seed <= 40; seed++) {
    const log = runSession(def, rules, b, seed, 0, { log: true }).hands;
    let changes = 0, runL = 0, runW = 0, maxL = 0, maxW = 0;
    for (const h of log) {
      if (h.nextBet !== h.stake) changes++;
      if (h.outcome === 'L') { runL++; runW = 0; } else if (h.outcome === 'W') { runW++; runL = 0; }
      maxL = Math.max(maxL, runL); maxW = Math.max(maxW, runW);
    }
    const bust = log.length && log[log.length - 1].after <= 0;
    const score = changes + 2 * Math.min(maxL, 4) + 2 * Math.min(maxW, 3) + (log.some((h) => h.doubled) ? 1 : 0) - (bust ? 4 : 0) + (log.length === hands ? 2 : 0);
    if (score > best.score) best = { seed, hands: log, score };
  }
  return { seed: best.seed, hands: best.hands };
}

export interface QuickStats { mean: number; ror: number; ahead: number; worst: number }

/** 400 sessions of up to 100 hands against flat betting, on the given settings. */
export function quickTest(def: StrategyDef, rules: Rules, bank: Bankroll): { mine: QuickStats; flat: QuickStats } {
  const res = simulate({
    rules, bank: { ...bank, sessions: 400, rounds: Math.min(bank.rounds, 100) }, seed: 7, strategies: [
      { id: 'mine', name: 'mine', slot: 0, def },
      { id: 'flat', name: 'Flat', slot: 0, def: { kind: 'builtin', key: 'flat', options: DEFAULT_OPTIONS } },
    ],
  });
  const pick = (i: number) => { const r = res.strategies[i]; return { mean: r.meanNet, ror: r.riskOfRuin, ahead: r.pProfit, worst: r.p05 }; };
  return { mine: pick(0), flat: pick(1) };
}
