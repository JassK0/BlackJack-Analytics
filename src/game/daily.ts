// The Daily Shoe: one shoe per day, the same for everyone, played once
import type { Rank } from '../engine/types';
import { buildShoe, handValue, isTenOrAce } from '../engine/cards';
import { mulberry32 } from '../engine/rng';
import { playerAction } from '../engine/session';

export type Act = 'HIT' | 'STAND' | 'DOUBLE';
export type Result = 'blackjack' | 'win' | 'dealer_bust' | 'push' | 'lose' | 'bust' | 'dealer_blackjack';

export const DAILY = { decks: 2, hands: 10, bankroll: 1000, minBet: 10, maxBet: 100, botBet: 25 } as const;
const EPOCH = new Date(2026, 0, 1);

// ------------------------------------------------------------- the day

const pad = (n: number) => String(n).padStart(2, '0');
/** The player's local calendar day, like Wordle. */
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round((new Date(y, m - 1, d).getTime() - EPOCH.getTime()) / 86_400_000) + 1;
}
export function msUntilTomorrow(now = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}

function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Index 0 is the first card dealt. Same date, same shoe, on every device. */
export const dailyShoe = (key: string): Rank[] => buildShoe(DAILY.decks, mulberry32(hashString(`daily-shoe:${key}`)));
const at = (shoe: Rank[], i: number) => shoe[i % shoe.length];
export const total = (cards: Rank[]) => handValue(cards).total;

// ------------------------------------------------------------ the rules

/** Deals in casino order: player, dealer up, player, dealer hole. */
export function deal(shoe: Rank[], pos: number) {
  return { player: [at(shoe, pos), at(shoe, pos + 2)], dealer: [at(shoe, pos + 1), at(shoe, pos + 3)], pos: pos + 4 };
}

/** US peek: a dealer natural (ace or ten up) ends the hand before the player acts. */
export function naturals(player: Rank[], dealer: Rank[]): { mult: number; result: Result } | null {
  const p = total(player) === 21, d = total(dealer) === 21 && isTenOrAce(dealer[0]);
  if (d) return p ? { mult: 0, result: 'push' } : { mult: -1, result: 'dealer_blackjack' };
  if (p) return { mult: 1.5, result: 'blackjack' };
  return null;
}

/** Dealer stands on all 17s. */
export function dealerDraw(shoe: Rank[], dealer: Rank[], pos: number) {
  const d = [...dealer];
  let p = pos;
  while (total(d) < 17) d.push(at(shoe, p++));
  return { dealer: d, pos: p };
}

export function compare(player: Rank[], dealer: Rank[], doubled: boolean): { mult: number; result: Result } {
  const k = doubled ? 2 : 1, p = total(player), d = total(dealer);
  if (p > 21) return { mult: -k, result: 'bust' };
  if (d > 21) return { mult: k, result: 'dealer_bust' };
  if (p > d) return { mult: k, result: 'win' };
  if (p < d) return { mult: -k, result: 'lose' };
  return { mult: 0, result: 'push' };
}

/** The basic-strategy move, using the same policy as the simulator. */
export function bookMove(player: Rank[], up: Rank, canDouble: boolean): Act {
  const a = playerAction(player, up, true);
  return a === 'DOUBLE' && !(canDouble && player.length === 2) ? 'HIT' : a;
}

const profitOf = (mult: number, bet: number) => (mult === 1.5 ? Math.floor(bet * 1.5) : mult * bet);

// ----------------------------------------------------------- your game

export interface HandState {
  bet: number;
  player: Rank[];
  dealer: Rank[];
  doubled: boolean;
  actions: Act[];
  book: { match: number; total: number };
  result: Result | null;
  profit: number;
}

export interface GameState {
  day: string;
  pos: number;
  bankroll: number;
  hands: HandState[];
  current: HandState | null;
  lastBet: number;
  finished: boolean;
}

export const newGame = (day: string): GameState =>
  ({ day, pos: 0, bankroll: DAILY.bankroll, hands: [], current: null, lastBet: 25, finished: false });

export const maxBetFor = (g: GameState) => Math.min(DAILY.maxBet, g.bankroll);
export const canDouble = (g: GameState) => !!g.current && !g.current.result && g.current.player.length === 2 && g.bankroll >= g.current.bet * 2;

function settle(g: GameState, h: HandState, mult: number, result: Result): GameState {
  const profit = profitOf(mult, h.bet);
  return { ...g, bankroll: g.bankroll + profit, current: { ...h, result, profit } };
}

export function startHand(g: GameState, shoe: Rank[], bet: number): GameState {
  const b = Math.max(Math.min(DAILY.minBet, g.bankroll), Math.min(bet, maxBetFor(g)));
  const d = deal(shoe, g.pos);
  const h: HandState = { bet: b, player: d.player, dealer: d.dealer, doubled: false, actions: [], book: { match: 0, total: 0 }, result: null, profit: 0 };
  const next = { ...g, pos: d.pos, lastBet: b, current: h };
  const nat = naturals(d.player, d.dealer);
  return nat ? settle(next, h, nat.mult, nat.result) : next;
}

export function act(g: GameState, shoe: Rank[], a: Act): GameState {
  const h0 = g.current;
  if (!h0 || h0.result) return g;
  if (a === 'DOUBLE' && !canDouble(g)) return g;
  const book = bookMove(h0.player, h0.dealer[0], canDouble(g));
  let h: HandState = { ...h0, actions: [...h0.actions, a], book: { match: h0.book.match + (a === book ? 1 : 0), total: h0.book.total + 1 } };
  let pos = g.pos;
  if (a === 'HIT' || a === 'DOUBLE') {
    h = { ...h, player: [...h.player, at(shoe, pos++)], doubled: a === 'DOUBLE' };
    if (total(h.player) > 21) return settle({ ...g, pos }, h, a === 'DOUBLE' ? -2 : -1, 'bust');
    if (a === 'HIT' && total(h.player) < 21) return { ...g, pos, current: h };
  }
  const dd = dealerDraw(shoe, h.dealer, pos);
  h = { ...h, dealer: dd.dealer };
  const c = compare(h.player, h.dealer, h.doubled);
  return settle({ ...g, pos: dd.pos }, h, c.mult, c.result);
}

export function nextHand(g: GameState): GameState {
  if (!g.current?.result) return g;
  const hands = [...g.hands, g.current];
  const finished = hands.length >= DAILY.hands || g.bankroll < DAILY.minBet;
  return { ...g, hands, current: null, finished };
}

// ------------------------------------------------- perfect run and bot

export interface Line { actions: Act[]; player: Rank[]; dealer: Rank[]; mult: number; result: Result; next: number }

/** Every way the hand dealt at `pos` can be played, and where each leaves the shoe. */
export function lines(shoe: Rank[], pos: number): Line[] {
  const d = deal(shoe, pos);
  const nat = naturals(d.player, d.dealer);
  if (nat) return [{ actions: [], player: d.player, dealer: d.dealer, ...nat, next: d.pos }];
  const out: Line[] = [];
  const finish = (player: Rank[], p: number, actions: Act[], doubled: boolean) => {
    if (total(player) > 21) { out.push({ actions, player, dealer: d.dealer, mult: doubled ? -2 : -1, result: 'bust', next: p }); return; }
    const dd = dealerDraw(shoe, d.dealer, p);
    out.push({ actions, player, dealer: dd.dealer, ...compare(player, dd.dealer, doubled), next: dd.pos });
  };
  const walk = (player: Rank[], p: number, actions: Act[]) => {
    finish(player, p, [...actions, 'STAND'], false);
    if (!actions.length) finish([...player, at(shoe, p)], p + 1, ['DOUBLE'], true);
    const hit = [...player, at(shoe, p)];
    // you can't hit on 21 (it stands for you), so the perfect run can't either
    if (total(hit) >= 21) finish(hit, p + 1, [...actions, 'HIT'], false);
    else walk(hit, p + 1, [...actions, 'HIT']);
  };
  walk(d.player, d.pos, []);
  return out;
}

export interface RunHand { bet: number; line: Line; profit: number }
export interface Run { final: number; hands: RunHand[] }

/**
 * The best possible result with hindsight: knowing the shoe, bet the max on
 * every hand you'll win and the min on the rest, and play each hand so the
 * cards fall best for the hands still to come (sometimes by busting on purpose).
 */
export function perfectRun(shoe: Rank[]): Run {
  const memo = new Map<string, { v: number; line: Line | null }>();
  const best = (h: number, pos: number): number => {
    if (h === DAILY.hands) return 0;
    const key = `${h}:${pos}`;
    const hit = memo.get(key);
    if (hit) return hit.v;
    let v = -Infinity, pick: Line | null = null;
    for (const l of lines(shoe, pos)) {
      const bet = l.mult > 0 ? DAILY.maxBet : DAILY.minBet;
      const g = profitOf(l.mult, bet) + best(h + 1, l.next);
      if (g > v) { v = g; pick = l; }
    }
    memo.set(key, { v, line: pick });
    return v;
  };
  best(0, 0);
  const hands: RunHand[] = [];
  let pos = 0, bankroll = DAILY.bankroll;
  for (let h = 0; h < DAILY.hands; h++) {
    const line = memo.get(`${h}:${pos}`)!.line!;
    const bet = line.mult > 0 ? DAILY.maxBet : DAILY.minBet;
    const profit = profitOf(line.mult, bet);
    hands.push({ bet, line, profit });
    bankroll += profit;
    pos = line.next;
  }
  return { final: bankroll, hands };
}

/** Basic strategy with a flat bet, on the same shoe. */
export function botRun(shoe: Rank[]): Run {
  let g = newGame('bot');
  const hands: RunHand[] = [];
  while (!g.finished) {
    g = startHand(g, shoe, DAILY.botBet);
    while (g.current && !g.current.result) {
      const h = g.current;
      g = act(g, shoe, bookMove(h.player, h.dealer[0], canDouble(g)));
    }
    const h = g.current!;
    hands.push({ bet: h.bet, profit: h.profit, line: { actions: h.actions, player: h.player, dealer: h.dealer, mult: 0, result: h.result!, next: g.pos } });
    g = nextHand(g);
  }
  return { final: g.bankroll, hands };
}

// ------------------------------------------------------------- scoring

export const TILE: Record<Result, string> = {
  blackjack: '⭐', win: '🟩', dealer_bust: '🟩', push: '⬜', lose: '🟥', bust: '💥', dealer_blackjack: '🟥',
};

export function tier(pct: number): { title: string; blurb: string } {
  if (pct < 0) return { title: 'Comped a free drink', blurb: 'The casino thanks you for your generous donation.' };
  if (pct < 0.1) return { title: 'Still has their shirt', blurb: 'You walked out with more than you walked in with. That counts.' };
  if (pct < 0.25) return { title: 'Grinder', blurb: 'Solid, patient, slightly up. The pit boss barely noticed you.' };
  if (pct < 0.5) return { title: 'Sharp', blurb: 'Good reads and good bets. The pit boss noticed you.' };
  if (pct < 0.8) return { title: 'Card Shark', blurb: 'Security would like a word.' };
  return { title: 'Rain Man', blurb: 'Did you memorise the shoe?' };
}

export interface Summary {
  day: string; number: number; final: number; profit: number;
  perfect: number; bot: number; pct: number; tiles: string;
  book: { match: number; total: number }; title: string; blurb: string;
}

export function summarize(g: GameState, perfect: Run, bot: Run): Summary {
  const profit = g.bankroll - DAILY.bankroll;
  const best = perfect.final - DAILY.bankroll;
  const pct = best > 0 ? profit / best : 0;
  const book = g.hands.reduce((a, h) => ({ match: a.match + h.book.match, total: a.total + h.book.total }), { match: 0, total: 0 });
  return {
    day: g.day, number: dayNumber(g.day), final: g.bankroll, profit, perfect: perfect.final, bot: bot.final, pct,
    tiles: g.hands.map((h) => TILE[h.result!]).join(''), book, ...tier(pct),
  };
}

const usd = (x: number) => `${x < 0 ? '-' : ''}$${Math.abs(x).toLocaleString('en-US')}`;

export function shareText(s: Summary): string {
  const diff = s.final - s.bot;
  return [
    `🃏 Daily Shoe #${s.number}`,
    `${usd(s.final)} (${s.profit >= 0 ? '+' : ''}${usd(s.profit)}) · ${s.title}`,
    s.tiles,
    `${Math.round(s.pct * 100)}% of perfect · ${diff > 0 ? `beat the bot by ${usd(diff)}` : diff < 0 ? `the bot won by ${usd(-diff)}` : 'tied the bot'}`,
  ].join('\n');
}

// ------------------------------------------------------- browser storage

export interface DailyStore { games: Record<string, Summary>; progress: GameState | null }
const KEY = 'bja.daily.v1';

export function loadStore(): DailyStore {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s === 'object' && s.games) return { games: s.games, progress: s.progress ?? null };
  } catch { /* storage blocked or corrupt: start fresh */ }
  return { games: {}, progress: null };
}

export function saveStore(s: DailyStore) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: the game still works this visit */ }
}

export const playedToday = (key = dayKey()) => !!loadStore().games[key];

export function stats(store: DailyStore, today: string) {
  const days = Object.keys(store.games).sort();
  const played = days.length;
  const won = days.filter((d) => store.games[d].profit > 0).length;
  const dayIndex = (k: string) => dayNumber(k);
  let current = 0, maxStreak = 0, run = 0, prev = -Infinity;
  for (const d of days) {
    const n = dayIndex(d);
    run = n === prev + 1 ? run + 1 : 1;
    prev = n;
    maxStreak = Math.max(maxStreak, run);
  }
  // the streak is alive if the last game was today or yesterday
  if (played && dayIndex(today) - dayIndex(days[days.length - 1]) <= 1) current = run;
  const buckets = [
    { label: 'Lost money', test: (s: Summary) => s.profit < 0 },
    { label: '0-10%', test: (s: Summary) => s.profit >= 0 && s.pct < 0.1 },
    { label: '10-25%', test: (s: Summary) => s.pct >= 0.1 && s.pct < 0.25 },
    { label: '25-50%', test: (s: Summary) => s.pct >= 0.25 && s.pct < 0.5 },
    { label: '50%+', test: (s: Summary) => s.pct >= 0.5 },
  ];
  const dist = buckets.map((b) => ({ label: b.label, count: days.filter((d) => b.test(store.games[d])).length }));
  return { played, winPct: played ? won / played : 0, current, maxStreak, dist };
}
