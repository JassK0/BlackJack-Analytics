import type { Bankroll, Rules } from './types';
import { money, payoutLabel } from '../lib/format';

export const DEFAULT_RULES: Rules = {
  decks: 6, cutCard: 52, hitSoft17: false, holeCard: true, blackjackPays: 1.5, allowDouble: true, tableMax: 500,
};

export const DEFAULT_BANKROLL: Bankroll = { start: 1000, unit: 25, rounds: 50, sessions: 1000 };

export const MAX_TOTAL_HANDS = 40_000_000;

export interface Preset { key: string; name: string; blurb: string; rules: Rules; bankroll?: Partial<Bankroll> }

export const PRESETS: Preset[] = [
  { key: 'strip', name: 'Vegas Strip', blurb: '6 decks, S17, 3:2', rules: { ...DEFAULT_RULES } },
  { key: 'downtown', name: 'Single deck', blurb: '1 deck, H17, half dealt',
    rules: { ...DEFAULT_RULES, decks: 1, cutCard: 26, hitSoft17: true } },
  { key: 'six_five', name: '6:5 table', blurb: 'Blackjack pays 6:5, H17',
    rules: { ...DEFAULT_RULES, hitSoft17: true, blackjackPays: 1.2 } },
  { key: 'european', name: 'European', blurb: 'No hole card, S17',
    rules: { ...DEFAULT_RULES, holeCard: false } },
  { key: 'no_limit', name: 'No table limit', blurb: 'The bankroll is the only cap',
    rules: { ...DEFAULT_RULES, tableMax: null } },
  { key: 'high_roller', name: 'High roller', blurb: '8 decks, $10k max, $25k roll',
    rules: { ...DEFAULT_RULES, decks: 8, cutCard: 78, tableMax: 10000 }, bankroll: { start: 25000, unit: 100 } },
];

export const SIZES = [
  { label: 'Quick', sessions: 500, rounds: 30 },
  { label: 'Standard', sessions: 2000, rounds: 50 },
  { label: 'Deep', sessions: 10000, rounds: 100 },
];

export function rulesShort(r: Rules): string {
  return [`${r.decks}D`, r.hitSoft17 ? 'H17' : 'S17', payoutLabel(r.blackjackPays), r.holeCard ? 'peek' : 'no hole card',
    r.allowDouble ? 'double' : 'no double', r.tableMax == null ? 'no max' : `${money(r.tableMax)} max`].join(' · ');
}

export function rulesMatch(a: Rules, b: Rules): boolean {
  return (Object.keys(a) as (keyof Rules)[]).every((k) => a[k] === b[k]);
}

/** Clamp a rules object into the ranges the engine supports. */
export function sanitizeRules(r: Partial<Rules>): Rules {
  const d = DEFAULT_RULES;
  const decks = clampInt(r.decks ?? d.decks, 1, 8);
  return {
    decks,
    cutCard: clampInt(r.cutCard ?? d.cutCard, 20, decks * 52),
    hitSoft17: !!(r.hitSoft17 ?? d.hitSoft17),
    holeCard: !!(r.holeCard ?? d.holeCard),
    blackjackPays: [1, 1.2, 1.5].includes(Number(r.blackjackPays)) ? Number(r.blackjackPays) : d.blackjackPays,
    allowDouble: !!(r.allowDouble ?? d.allowDouble),
    tableMax: r.tableMax == null ? null : clampInt(r.tableMax, 1, 1e9),
  };
}

export function sanitizeBankroll(b: Partial<Bankroll>): Bankroll {
  const d = DEFAULT_BANKROLL;
  const start = clampInt(b.start ?? d.start, 1, 1e9);
  return {
    start,
    unit: clampInt(b.unit ?? d.unit, 1, start),
    rounds: clampInt(b.rounds ?? d.rounds, 1, 5000),
    sessions: clampInt(b.sessions ?? d.sessions, 1, 200000),
  };
}

export function clampInt(v: unknown, lo: number, hi: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}
