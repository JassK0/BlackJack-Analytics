import type { Rank } from './types';
import type { Rng } from './rng';

export const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export const VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 10, Q: 10, K: 10, A: 11,
};

/** Hi-Lo card counting tags (shown on the live table for learning only). */
export const HILO: Record<Rank, number> = {
  '2': 1, '3': 1, '4': 1, '5': 1, '6': 1, '7': 0, '8': 0, '9': 0, '10': -1, J: -1, Q: -1, K: -1, A: -1,
};

export function buildShoe(decks: number, rng: Rng): Rank[] {
  const shoe: Rank[] = new Array(decks * 52);
  let i = 0;
  for (let d = 0; d < decks; d++) for (const r of RANKS) for (let k = 0; k < 4; k++) shoe[i++] = r;
  for (let j = shoe.length - 1; j > 0; j--) {
    const k = Math.floor(rng() * (j + 1));
    const t = shoe[j]; shoe[j] = shoe[k]; shoe[k] = t;
  }
  return shoe;
}

/** Best total, demoting aces from 11 to 1 as needed; soft when an ace still counts 11. */
export function handValue(hand: readonly Rank[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of hand) {
    total += VALUES[c];
    if (c === 'A') aces++;
  }
  while (total > 21 && aces) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}

export const handTotal = (hand: readonly Rank[]) => handValue(hand).total;

export const isTenOrAce = (r: Rank) => r === 'A' || VALUES[r] === 10;

export function handLabel(hand: readonly Rank[]): string {
  const { total, soft } = handValue(hand);
  if (hand.length === 2 && total === 21) return 'Blackjack';
  return `${soft && total < 21 ? 'Soft' : 'Hard'} ${total}`;
}

// ---- analysis buckets: dealer upcard and the player's two-card start

export const UPCARDS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];

export function upcardIndex(r: Rank): number {
  if (r === 'A') return 9;
  const v = VALUES[r];
  return v === 10 ? 8 : v - 2;
}

export const HEAT_ROWS = [
  'Hard 4-8', ...Array.from({ length: 12 }, (_, i) => `Hard ${i + 9}`),
  'A,A', ...Array.from({ length: 8 }, (_, i) => `A,${i + 2}`), 'Blackjack',
];

export function heatRow(c1: Rank, c2: Rank): number {
  const a1 = c1 === 'A', a2 = c2 === 'A';
  if (a1 && a2) return 13;
  if (a1 || a2) {
    const other = VALUES[a1 ? c2 : c1];
    return other === 10 ? 22 : 14 + (other - 2);
  }
  const t = VALUES[c1] + VALUES[c2];
  return t <= 8 ? 0 : t - 8;
}
