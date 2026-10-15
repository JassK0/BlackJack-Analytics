// Betting strategies: the five built-ins from strat2.py plus user-defined ones
import type { Adjust, BuiltinKey, BuiltinOptions, CustomStrategy, Outcome, StrategyDef } from './types';
import { money } from '../lib/format';

export interface BetStrategy {
  /** First bet in dollars (before table/bankroll caps). */
  start(): number;
  /** Next bet in dollars given the (capped) previous bet and its result. */
  next(prev: number, o: Outcome): number;
  /** Plain-English reason for the bet `next` just picked. Only called when logging a replay. */
  explain(prev: number, o: Outcome, desired: number): string;
  /** Custom stop-win / stop-loss: true ends the session before the next hand. */
  stop?(net: number): boolean;
}

export const BUILTINS: { key: BuiltinKey; name: string; summary: string; detail: string }[] = [
  { key: 'flat', name: 'Flat', summary: 'Bet one unit every hand, win or lose.',
    detail: 'The baseline. Flat betting exposes the raw house edge with the least variance.' },
  { key: 'martingale', name: 'Martingale', summary: 'Double after every loss, back to one unit after a win.',
    detail: 'Wins many small sessions, but a losing streak runs into the table max or empties the bankroll.' },
  { key: 'paroli', name: 'Paroli', summary: 'Double after a win until a streak cap, then bank it.',
    detail: 'A reverse Martingale: losses cost one unit, hot streaks are pressed up to the cap.' },
  { key: '1326', name: '1-3-2-6', summary: 'Bet 1, 3, 2, then 6 units while winning.',
    detail: 'Any loss restarts the sequence at one unit; finishing all four steps also restarts it.' },
  { key: 'oscars_grind', name: "Oscar's Grind", summary: 'Grind out +1 unit per series, raising after wins.',
    detail: 'Raise one unit after each win, keep the bet after a loss, and reset once the series is up a unit.' },
  { key: 'dalembert', name: "D'Alembert", summary: 'Add a unit after a loss, remove one after a win.',
    detail: 'A gentle negative progression: bets creep up through losing runs and drift back down as wins arrive, never below one unit.' },
  { key: 'fibonacci', name: 'Fibonacci', summary: 'Climb the Fibonacci sequence after losses, drop back after a win.',
    detail: 'Bets follow 1, 1, 2, 3, 5, 8, 13... units. Each loss moves one step up, each win two steps back. Slower than Martingale, but long losing runs still get expensive.' },
  { key: 'labouchere', name: 'Labouchère', summary: 'Bet the two ends of a number line; cross them off on wins.',
    detail: 'Start with a line like 1-2-3-4 and bet first + last. A win crosses both off; a loss adds the amount lost to the end. Clearing the line banks its total.' },
];

export const DEFAULT_OPTIONS: BuiltinOptions = {
  martResetOnWin: true, martResetOnPush: false, paroliStreakCap: 3, paroliResetOnPush: false,
  seqResetOnPush: true, oscResetOnPush: false, dalStep: 1, fibBack: 2, labLength: 4,
};

export const BUILTIN_OPTION_FIELDS: { key: keyof BuiltinOptions; strategy: BuiltinKey; label: string; type: 'bool' | 'int'; min?: number; max?: number }[] = [
  { key: 'martResetOnWin', strategy: 'martingale', label: 'Reset to one unit after a win', type: 'bool' },
  { key: 'martResetOnPush', strategy: 'martingale', label: 'Reset to one unit after a push', type: 'bool' },
  { key: 'paroliStreakCap', strategy: 'paroli', label: 'Wins in a row before resetting', type: 'int', min: 1, max: 10 },
  { key: 'paroliResetOnPush', strategy: 'paroli', label: 'Reset after a push', type: 'bool' },
  { key: 'seqResetOnPush', strategy: '1326', label: 'Restart the sequence after a push', type: 'bool' },
  { key: 'oscResetOnPush', strategy: 'oscars_grind', label: 'Reset the series after a push', type: 'bool' },
  { key: 'dalStep', strategy: 'dalembert', label: 'Units added after a loss (and removed after a win)', type: 'int', min: 1, max: 5 },
  { key: 'fibBack', strategy: 'fibonacci', label: 'Steps back after a win', type: 'int', min: 1, max: 3 },
  { key: 'labLength', strategy: 'labouchere', label: 'Starting line: 1, 2, ... up to', type: 'int', min: 2, max: 8 },
];

// ------------------------------------------------------------- built-ins

class Flat implements BetStrategy {
  constructor(private unit: number) {}
  start() { return this.unit; }
  next() { return this.unit; }
  explain() { return `Flat betting keeps the bet at one unit (${money(this.unit)}).`; }
}

class Martingale implements BetStrategy {
  constructor(private unit: number, private o: BuiltinOptions) {}
  start() { return this.unit; }
  next(prev: number, out: Outcome) {
    if (out === 'L') return Math.max(this.unit, prev * 2);
    if (out === 'W') return this.o.martResetOnWin ? this.unit : prev;
    return this.o.martResetOnPush ? this.unit : prev;
  }
  explain(prev: number, out: Outcome, desired: number) {
    if (out === 'L') return `Lost ${money(prev)}, so Martingale doubles to ${money(desired)}.`;
    if (out === 'W') return this.o.martResetOnWin ? `Won, so back to one unit (${money(this.unit)}).` : 'Won; the bet stays where it is.';
    return this.o.martResetOnPush ? `Push, so back to one unit (${money(this.unit)}).` : 'Push; the bet stays where it is.';
  }
}

class Paroli implements BetStrategy {
  private streak = 0;
  constructor(private unit: number, private o: BuiltinOptions) {}
  start() { return this.unit; }
  next(prev: number, out: Outcome) {
    if (out === 'W') {
      this.streak += 1;
      if (this.streak >= this.o.paroliStreakCap) { this.streak = 0; return this.unit; }
      return Math.max(this.unit, prev * 2);
    }
    if (out === 'L') { this.streak = 0; return this.unit; }
    if (this.o.paroliResetOnPush) { this.streak = 0; return this.unit; }
    return prev;
  }
  explain(_prev: number, out: Outcome, desired: number) {
    const cap = this.o.paroliStreakCap;
    if (out === 'W') return this.streak === 0 ? `${cap} wins in a row: bank the profit and reset to ${money(this.unit)}.`
      : `Win ${this.streak} of ${cap}: let it ride at ${money(desired)}.`;
    if (out === 'L') return `Lost, so the streak resets to one unit (${money(this.unit)}).`;
    return this.o.paroliResetOnPush ? 'Push, so the streak resets to one unit.' : 'Push; the streak and bet carry over.';
  }
}

class OneThreeTwoSix implements BetStrategy {
  private static seq = [1, 3, 2, 6];
  private idx = 0;
  constructor(private unit: number, private o: BuiltinOptions) {}
  start() { return this.unit; }
  next(_prev: number, out: Outcome) {
    if (out === 'W') this.idx = (this.idx + 1) % 4;
    else if (out === 'L') this.idx = 0;
    else if (this.o.seqResetOnPush) this.idx = 0;
    return this.unit * OneThreeTwoSix.seq[this.idx];
  }
  explain(_prev: number, out: Outcome, desired: number) {
    const units = OneThreeTwoSix.seq[this.idx];
    if (out === 'W') return this.idx === 0 ? `Completed 1-3-2-6: start over at 1 unit (${money(desired)}).`
      : `Won: step ${this.idx + 1} of 1-3-2-6 is ${units} units (${money(desired)}).`;
    if (out === 'L') return `Lost, so the sequence restarts at 1 unit (${money(desired)}).`;
    return this.o.seqResetOnPush ? 'Push, so the sequence restarts at 1 unit.' : `Push; stay on ${units} units.`;
  }
}

class OscarsGrind implements BetStrategy {
  private series = 0;
  private units = 1;
  constructor(private unit: number, private o: BuiltinOptions) {}
  start() { return this.unit; }
  next(_prev: number, out: Outcome) {
    const u = this.unit;
    if (out === 'W') {
      this.series += this.units * u;
      if (this.series >= u) { this.series = 0; this.units = 1; } else this.units += 1;
    } else if (out === 'L') {
      this.series -= this.units * u;
    } else if (this.o.oscResetOnPush) {
      this.series = 0; this.units = 1;
    }
    return this.units * u;
  }
  explain(_prev: number, out: Outcome, desired: number) {
    const series = `series ${money(this.series)}`;
    if (out === 'W') return this.series === 0 && this.units === 1 ? `Series finished up a unit: reset to 1 unit (${money(desired)}).`
      : `Won, so raise to ${this.units} units (${series}).`;
    if (out === 'L') return `Lost; keep ${this.units} unit${this.units === 1 ? '' : 's'} (${series}).`;
    return this.o.oscResetOnPush ? 'Push, so the series resets.' : `Push; keep ${this.units} units (${series}).`;
  }
}

class DAlembert implements BetStrategy {
  private units = 1;
  constructor(private unit: number, private o: BuiltinOptions) {}
  start() { return this.unit; }
  next(_prev: number, out: Outcome) {
    const step = Math.max(1, this.o.dalStep);
    if (out === 'L') this.units += step;
    else if (out === 'W') this.units = Math.max(1, this.units - step);
    return this.units * this.unit;
  }
  explain(_prev: number, out: Outcome, desired: number) {
    const step = Math.max(1, this.o.dalStep);
    const now = `${this.units} unit${this.units === 1 ? '' : 's'} (${money(desired)})`;
    if (out === 'L') return `Lost, so add ${step} unit${step === 1 ? '' : 's'}: ${now}.`;
    if (out === 'W') return this.units === 1 ? `Won, so drop to the 1-unit floor (${money(desired)}).` : `Won, so remove ${step} unit${step === 1 ? '' : 's'}: ${now}.`;
    return `Push; the bet stays at ${now}.`;
  }
}

class Fibonacci implements BetStrategy {
  private idx = 0;
  private seq = [1, 1];
  constructor(private unit: number, private o: BuiltinOptions) {}
  private at(i: number) {
    while (this.seq.length <= i) this.seq.push(this.seq[this.seq.length - 1] + this.seq[this.seq.length - 2]);
    return this.seq[i];
  }
  start() { return this.unit; }
  next(_prev: number, out: Outcome) {
    if (out === 'L') this.idx += 1;
    else if (out === 'W') this.idx = Math.max(0, this.idx - Math.max(1, this.o.fibBack));
    return this.at(this.idx) * this.unit;
  }
  explain(_prev: number, out: Outcome, desired: number) {
    const units = this.at(this.idx);
    const now = `${units} unit${units === 1 ? '' : 's'} (${money(desired)})`;
    if (out === 'L') return `Lost, so climb to step ${this.idx + 1} of the Fibonacci sequence: ${now}.`;
    if (out === 'W') return `Won, so drop back ${this.o.fibBack} step${this.o.fibBack === 1 ? '' : 's'} to step ${this.idx + 1}: ${now}.`;
    return `Push; stay on ${now}.`;
  }
}

class Labouchere implements BetStrategy {
  private base: number[];
  private line: number[];
  private banked = 0;
  constructor(private unit: number, o: BuiltinOptions) {
    const n = Math.max(2, Math.min(8, Math.round(o.labLength)));
    this.base = Array.from({ length: n }, (_, i) => i + 1);
    this.line = [...this.base];
  }
  private betUnits() { return this.line.length === 1 ? this.line[0] : this.line[0] + this.line[this.line.length - 1]; }
  private dollars(u: number) { return Math.max(1, Math.round(u * this.unit)); }
  start() { return this.dollars(this.betUnits()); }
  next(prev: number, out: Outcome) {
    this.banked = 0;
    if (out === 'W') {
      if (this.line.length <= 2) { this.banked = this.base.reduce((a, b) => a + b, 0); this.line = [...this.base]; }
      else this.line = this.line.slice(1, -1);
    } else if (out === 'L') {
      this.line.push(prev / this.unit);            // add what was actually lost
    }
    return this.dollars(this.betUnits());
  }
  private show() {
    const l = this.line.map(fmtUnits);
    return l.length > 9 ? `${l.slice(0, 3).join('-')}-...-${l.slice(-3).join('-')} (${l.length} numbers)` : l.join('-');
  }
  explain(prev: number, out: Outcome, desired: number) {
    const bet = `bet first + last = ${fmtUnits(this.betUnits())} units (${money(desired)})`;
    if (out === 'W') return this.banked ? `Won and cleared the line: ${this.banked} units banked. Start over with ${this.show()}, ${bet}.`
      : `Won, so cross off both ends. Line ${this.show()}: ${bet}.`;
    if (out === 'L') return `Lost ${fmtUnits(prev / this.unit)} units, so add them to the end. Line ${this.show()}: ${bet}.`;
    return `Push; the line stays ${this.show()}: ${bet}.`;
  }
}

// ---------------------------------------------------------------- custom

const plural = (n: number, w: string) => `${fmtUnits(n)} ${w}${Math.abs(n) === 1 ? '' : 's'}`;
export const fmtUnits = (u: number) => (Number.isInteger(u) ? String(u) : u.toFixed(u < 10 ? 2 : 1).replace(/\.?0+$/, ''));

export function adjustText(a: Adjust, mode: CustomStrategy['mode']): string {
  switch (a.kind) {
    case 'reset': return mode === 'sequence' ? 'go back to step 1' : 'go back to the starting bet';
    case 'keep': return 'keep the same bet';
    case 'multiply': return `multiply the bet by ${fmtUnits(a.value)}`;
    case 'add': return a.value >= 0 ? `add ${plural(a.value, 'unit')}` : `remove ${plural(-a.value, 'unit')}`;
    case 'step': return a.value >= 0 ? `move ${plural(a.value, 'step')} forward` : `move ${plural(-a.value, 'step')} back`;
  }
}

class Custom implements BetStrategy {
  private units: number;
  private step = 0;
  private wins = 0;
  private losses = 0;
  private note = '';
  private capped = false;
  constructor(private d: CustomStrategy, private unit: number) {
    this.units = d.mode === 'sequence' ? this.seq(0) : d.startUnits;
  }
  private seq(i: number) {
    const s = this.d.sequence;
    return s.length ? s[Math.max(0, Math.min(i, s.length - 1))] : 1;
  }
  private clamp(u: number) {
    this.capped = false;
    let v = Math.max(this.d.minUnits, u);
    if (this.d.maxUnits > 0 && v > this.d.maxUnits) { v = this.d.maxUnits; this.capped = true; }
    return v;
  }
  private dollars(u: number) { return Math.max(1, Math.round(u * this.unit)); }
  private toStart() { this.step = 0; this.units = this.d.mode === 'sequence' ? this.seq(0) : this.d.startUnits; }

  start() { this.units = this.clamp(this.units); return this.dollars(this.units); }

  next(prev: number, out: Outcome) {
    const d = this.d;
    if (out === 'W') { this.wins++; this.losses = 0; } else if (out === 'L') { this.losses++; this.wins = 0; }
    const adj = out === 'W' ? d.onWin : out === 'L' ? d.onLoss : d.onPush;
    this.note = '';
    if (d.mode === 'sequence') {
      if (adj.kind === 'reset') this.step = 0;
      else if (adj.kind === 'step') {
        let s = this.step + Math.round(adj.value);
        if (s >= d.sequence.length) s = d.sequenceEnd === 'wrap' ? 0 : d.sequence.length - 1;
        this.step = Math.max(0, s);
      }
      this.units = this.seq(this.step);
    } else {
      const prevUnits = prev / this.unit;
      if (adj.kind === 'reset') this.units = d.startUnits;
      else if (adj.kind === 'keep') this.units = prevUnits;
      else if (adj.kind === 'multiply') this.units = prevUnits * adj.value;
      else if (adj.kind === 'add') this.units = prevUnits + adj.value;
    }
    if (d.resetAfterWins > 0 && this.wins >= d.resetAfterWins) {
      this.toStart(); this.wins = 0; this.note = ` ${d.resetAfterWins} wins in a row, so back to the start.`;
    }
    if (d.resetAfterLosses > 0 && this.losses >= d.resetAfterLosses) {
      this.toStart(); this.losses = 0; this.note = ` ${d.resetAfterLosses} losses in a row, so back to the start.`;
    }
    this.units = this.clamp(this.units);
    return this.dollars(this.units);
  }

  explain(_prev: number, out: Outcome, desired: number) {
    const d = this.d;
    const word = out === 'W' ? 'Won' : out === 'L' ? 'Lost' : 'Push';
    const adj = out === 'W' ? d.onWin : out === 'L' ? d.onLoss : d.onPush;
    const where = d.mode === 'sequence' ? ` (step ${this.step + 1} of ${d.sequence.length})` : '';
    return `${word}, so ${adjustText(adj, d.mode)}: ${plural(this.units, 'unit')}${where}, ${money(desired)}.${this.note}` +
      (this.capped ? ` Capped at ${plural(d.maxUnits, 'unit')}.` : '');
  }

  stop(net: number) {
    const d = this.d, u = this.unit;
    return (d.stopWin > 0 && net >= d.stopWin * u) || (d.stopLoss > 0 && net <= -d.stopLoss * u);
  }
}

export function createStrategy(def: StrategyDef, unit: number): BetStrategy {
  if (def.kind === 'custom') return new Custom(def.def, unit);
  const o = { ...DEFAULT_OPTIONS, ...def.options };
  switch (def.key) {
    case 'flat': return new Flat(unit);
    case 'martingale': return new Martingale(unit, o);
    case 'paroli': return new Paroli(unit, o);
    case '1326': return new OneThreeTwoSix(unit, o);
    case 'oscars_grind': return new OscarsGrind(unit, o);
    case 'dalembert': return new DAlembert(unit, o);
    case 'fibonacci': return new Fibonacci(unit, o);
    case 'labouchere': return new Labouchere(unit, o);
  }
}

// -------------------------------------------------------- custom helpers

export const TEMPLATES: { key: string; name: string; blurb: string; def: Partial<CustomStrategy> }[] = [
  { key: 'dalembert', name: "D'Alembert", blurb: 'Add a unit after a loss, remove one after a win.',
    def: { mode: 'progression', onWin: { kind: 'add', value: -1 }, onLoss: { kind: 'add', value: 1 }, onPush: { kind: 'keep' } } },
  { key: 'fibonacci', name: 'Fibonacci', blurb: 'Climb the Fibonacci sequence on losses, drop back two on a win.',
    def: { mode: 'sequence', sequence: [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89], sequenceEnd: 'stay',
      onWin: { kind: 'step', value: -2 }, onLoss: { kind: 'step', value: 1 }, onPush: { kind: 'keep' } } },
  { key: 'capped_martingale', name: 'Capped Martingale', blurb: 'Double after losses, but never past 16 units.',
    def: { mode: 'progression', onWin: { kind: 'reset' }, onLoss: { kind: 'multiply', value: 2 }, onPush: { kind: 'keep' }, maxUnits: 16 } },
  { key: 'reverse_dalembert', name: "Reverse D'Alembert", blurb: 'Add a unit after a win, remove one after a loss.',
    def: { mode: 'progression', onWin: { kind: 'add', value: 1 }, onLoss: { kind: 'add', value: -1 }, onPush: { kind: 'keep' } } },
  { key: 'parlay', name: 'Two-step parlay', blurb: 'Let one win ride, then bank it and start over.',
    def: { mode: 'progression', onWin: { kind: 'multiply', value: 2 }, onLoss: { kind: 'reset' }, onPush: { kind: 'keep' }, resetAfterWins: 2 } },
  { key: 'hit_and_run', name: 'Hit and run', blurb: 'Flat bets, but walk away at +10 or -20 units.',
    def: { mode: 'progression', onWin: { kind: 'keep' }, onLoss: { kind: 'keep' }, onPush: { kind: 'keep' }, stopWin: 10, stopLoss: 20 } },
  { key: 'blank', name: 'From scratch', blurb: 'Flat one-unit bets you can change.', def: {} },
];

export function newCustom(templateKey = 'blank', slot = 5): CustomStrategy {
  const t = TEMPLATES.find((x) => x.key === templateKey) || TEMPLATES[TEMPLATES.length - 1];
  return sanitizeCustom({
    id: Math.random().toString(36).slice(2, 10),
    name: t.key === 'blank' ? 'My strategy' : BUILTINS.some((b) => b.name === t.name) ? `My ${t.name}` : t.name,
    mode: 'progression', startUnits: 1,
    onWin: { kind: 'keep' }, onLoss: { kind: 'keep' }, onPush: { kind: 'keep' },
    sequence: [1, 2, 3, 5, 8], sequenceEnd: 'stay',
    minUnits: 1, maxUnits: 0, resetAfterWins: 0, resetAfterLosses: 0, stopWin: 0, stopLoss: 0,
    slot, ...t.def,
  });
}

const clampNum = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

function sanitizeAdjust(a: Adjust | undefined, mode: CustomStrategy['mode']): Adjust {
  if (!a) return { kind: 'keep' };
  if (mode === 'sequence') {
    if (a.kind === 'reset' || a.kind === 'keep') return { kind: a.kind };
    if (a.kind === 'step') return { kind: 'step', value: Math.round(clampNum(a.value, -20, 20, 1)) || 1 };
    return { kind: 'keep' };
  }
  if (a.kind === 'multiply') return { kind: 'multiply', value: clampNum(a.value, 0.1, 10, 2) };
  if (a.kind === 'add') return { kind: 'add', value: clampNum(a.value, -1000, 1000, 1) };
  if (a.kind === 'reset' || a.kind === 'keep') return { kind: a.kind };
  return { kind: 'keep' };
}

export function sanitizeCustom(d: CustomStrategy): CustomStrategy {
  const mode = d.mode === 'sequence' ? 'sequence' : 'progression';
  const seq = (Array.isArray(d.sequence) ? d.sequence : []).map((v) => clampNum(v, 0.5, 100000, 1)).slice(0, 40);
  return {
    id: String(d.id || Math.random().toString(36).slice(2, 10)),
    name: String(d.name || 'My strategy').slice(0, 40),
    mode,
    startUnits: clampNum(d.startUnits, 0.5, 100000, 1),
    onWin: sanitizeAdjust(d.onWin, mode),
    onLoss: sanitizeAdjust(d.onLoss, mode),
    onPush: sanitizeAdjust(d.onPush, mode),
    sequence: seq.length ? seq : [1],
    sequenceEnd: d.sequenceEnd === 'wrap' ? 'wrap' : 'stay',
    minUnits: clampNum(d.minUnits, 0.5, 100000, 1),
    maxUnits: clampNum(d.maxUnits, 0, 1000000, 0),
    resetAfterWins: Math.round(clampNum(d.resetAfterWins, 0, 50, 0)),
    resetAfterLosses: Math.round(clampNum(d.resetAfterLosses, 0, 50, 0)),
    stopWin: clampNum(d.stopWin, 0, 1000000, 0),
    stopLoss: clampNum(d.stopLoss, 0, 1000000, 0),
    slot: Math.round(clampNum(d.slot, 0, 7, 5)),
  };
}

export function describeCustom(d: CustomStrategy): string[] {
  const lines: string[] = [];
  if (d.mode === 'sequence') {
    const s = d.sequence.map(fmtUnits);
    lines.push(`Bets in units from the sequence ${s.slice(0, 12).join(', ')}${s.length > 12 ? ', ...' : ''}, starting at step 1.`);
  } else {
    lines.push(`Starts at ${plural(d.startUnits, 'unit')}.`);
  }
  lines.push(`After a win, ${adjustText(d.onWin, d.mode)}.`);
  lines.push(`After a loss, ${adjustText(d.onLoss, d.mode)}.`);
  lines.push(`After a push, ${adjustText(d.onPush, d.mode)}.`);
  if (d.mode === 'sequence') lines.push(d.sequenceEnd === 'wrap' ? 'Going past the last step starts the sequence over.' : 'It never goes past the last step.');
  const limits = [`never below ${plural(d.minUnits, 'unit')}`];
  if (d.maxUnits > 0) limits.push(`never above ${plural(d.maxUnits, 'unit')}`);
  lines.push(`Bets are ${limits.join(' and ')}.`);
  if (d.resetAfterWins > 0) lines.push(`Goes back to the start after ${d.resetAfterWins} wins in a row.`);
  if (d.resetAfterLosses > 0) lines.push(`Goes back to the start after ${d.resetAfterLosses} losses in a row.`);
  const stops = [];
  if (d.stopWin > 0) stops.push(`up ${plural(d.stopWin, 'unit')}`);
  if (d.stopLoss > 0) stops.push(`down ${plural(d.stopLoss, 'unit')}`);
  if (stops.length) lines.push(`Walks away from the table once ${stops.join(' or ')}.`);
  return lines;
}

export function summarize(def: StrategyDef): string {
  if (def.kind === 'builtin') return BUILTINS.find((b) => b.key === def.key)!.summary;
  return describeCustom(def.def).slice(0, 3).join(' ');
}

export const DEMO_OUTCOMES: Outcome[] = ['L', 'L', 'L', 'W', 'W', 'W', 'W', 'L', 'W', 'P', 'W', 'L', 'L', 'W', 'W', 'L'];

/** Units a strategy bets over DEMO_OUTCOMES with no caps, for the little "how it bets" bars. */
export function demoBets(def: StrategyDef, outcomes: Outcome[] = DEMO_OUTCOMES): number[] {
  const unit = 100;
  const s = createStrategy(def, unit);
  let bet = s.start();
  const out: number[] = [];
  for (const o of outcomes) {
    out.push(bet / unit);
    bet = Math.max(1, s.next(bet, o));
  }
  return out;
}
