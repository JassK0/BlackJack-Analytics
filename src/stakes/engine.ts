// Twenty-One Stakes: decks, the table, and the chips × mult scoring pipeline
import type { Rank } from '../engine/types';
import { playerAction } from '../engine/session';
import { mulberry32, type Rng } from '../engine/rng';
import {
  ANTE_BASE, BOSS_POOL, BOSSES, CHARMS, HANDS, RANKS, STAGE_INFO, STAGES, SUITS,
  type BossId, type CharmId, type Consumable, type HandType, type PCard, type Stage, type Suit, type TagId, type VoucherId,
} from './data';

// ------------------------------------------------------------------ seeds

const SEED_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomSeedCode(): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += SEED_CHARS[Math.floor(Math.random() * SEED_CHARS.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}
export const cleanSeed = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
/** One random stream per purpose, so a choice in the shop never changes the cards you're dealt. */
export const stream = (seed: string, label: string): Rng => mulberry32(hash(`${seed}|${label}`));
export function shuffle<T>(rng: Rng, list: readonly T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export const pickOne = <T,>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];

// ------------------------------------------------------------------ cards

export const rankValue = (r: Rank) => (r === 'A' ? 11 : r === 'J' || r === 'Q' || r === 'K' || r === '10' ? 10 : Number(r));
export const isFace = (r: Rank) => r === 'J' || r === 'Q' || r === 'K';
export const rankName = (r: Rank) => ({ J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace' } as Record<string, string>)[r] ?? r;

export function standardDeck(firstUid: number): PCard[] {
  const out: PCard[] = [];
  let uid = firstUid;
  for (const suit of SUITS) for (const rank of RANKS) out.push({ uid: uid++, rank, suit });
  return out;
}

/** Best total for a hand: aces count 1 or 11, Wild cards fill whatever gets closest to 21, Stone cards count 0. */
export function totalOf(cards: readonly PCard[]): { total: number; soft: boolean } {
  let hard = 0, aces = 0, wilds = 0;
  for (const c of cards) {
    if (c.enh === 'stone') continue;
    if (c.enh === 'wild') { wilds++; continue; }
    if (c.rank === 'A') { aces++; hard += 1; } else hard += rankValue(c.rank);
  }
  if (!wilds) {
    if (aces && hard + 10 <= 21) return { total: hard + 10, soft: true };
    return { total: hard, soft: false };
  }
  const low = hard + wilds;
  if (low > 21) return { total: low, soft: false };
  return { total: Math.min(21, hard + wilds * 11 + aces * 10), soft: true };
}
export const isNatural = (h: PHand) => h.cards.length === 2 && !h.hits && !h.doubled && !h.split && totalOf(h.cards).total === 21;

/** What basic strategy would do with this total, for the By the Book charm and the hint. */
export function bookMove(cards: readonly PCard[], up: PCard, canDouble: boolean): 'HIT' | 'STAND' | 'DOUBLE' {
  const { total, soft } = totalOf(cards);
  const rank = (v: number): Rank => (v >= 11 ? 'A' : v >= 10 ? '10' : (String(Math.max(2, v)) as Rank));
  let synth: Rank[];
  if (soft && total <= 21 && total >= 12) synth = total === 12 ? ['A', 'A'] : ['A', rank(total - 11)];
  else if (total >= 12) synth = ['10', rank(Math.min(total - 10, 9))];
  else if (total >= 4) synth = [rank(Math.min(total - 2, 9)), rank(total - Math.min(total - 2, 9))];
  else synth = ['2', '2'];
  const upRank: Rank = up.enh === 'wild' ? 'A' : up.enh === 'stone' ? '2' : up.rank;
  return playerAction(synth, upRank, canDouble && cards.length === 2);
}

// ------------------------------------------------------------------ state

export interface CharmInst { uid: number; id: CharmId; counter: number }
export interface PHand { cards: PCard[]; hits: number; doubled: boolean; done: boolean; split: boolean; book: boolean }
export type Outcome = 'win' | 'loss' | 'bust' | 'push' | 'refund';
export interface Step {
  /** Where the number pops up: a card in the hand, a charm, or the whole hand. */
  at: { card: number } | { charm: number } | { hand: true };
  chips?: number; mult?: number; xmult?: number; money?: number; text: string;
}
export interface Scored { type: HandType; level: number; baseChips: number; baseMult: number; steps: Step[]; chips: number; mult: number; total: number; money: number; shattered: number[] }
export interface HandResult { outcome: Outcome; type: HandType | null; reason: string; score: Scored | null }
export interface Round {
  hands: PHand[]; active: number; dealer: PCard[]; holeHidden: boolean;
  phase: 'insurance' | 'play' | 'done'; insured: boolean; dealerBust: boolean;
  results: HandResult[] | null; gained: number; off: number | null;
}
export interface TableState {
  ante: number; stage: Stage; boss: BossId | null; target: number; score: number;
  handsLeft: number; redrawsLeft: number; maxHands: number; maxRedraws: number;
  deck: PCard[]; discard: PCard[]; house: PCard[]; houseDiscard: PCard[];
  round: Round | null; roundNo: number; shuffles: number;
  over: null | { won: boolean }; dealerLows: number; netUsed: boolean; feetUsed: boolean; best: number;
}
export interface RunStats { bestHand: number; bestType: HandType | null; hands: number; wins: number; blackjacks: number; tablesWon: number; total: number }
export type Screen = 'select' | 'table' | 'cashout' | 'shop' | 'pack' | 'won' | 'end';
export interface ShopItem { slot: number; kind: 'charm' | 'cocktail' | 'fortune'; id: string; price: number; sold: boolean }
export interface ShopState { items: ShopItem[]; packs: { kind: 'cocktail' | 'fortune' | 'charm' | 'standard'; price: number; sold: boolean }[]; voucher: VoucherId | null; voucherSold: boolean; rerolls: number }
export interface PackState {
  kind: 'cocktail' | 'fortune' | 'charm' | 'standard'; options: string[]; cards: PCard[]; picks: number; from: 'shop' | 'select';
  /** for fortune packs: the fortune chosen, waiting for target cards */
  pending: string | null; done: boolean;
}
export interface Cashout { reward: number; hands: number; interest: number; extra: { label: string; amount: number }[]; total: number; notes: string[] }
export interface RunState {
  v: 1; seed: string; seedLabel: string; daily: boolean; startedAt: number;
  ante: number; stage: number; bosses: Record<number, BossId>; endless: boolean;
  money: number; deck: PCard[]; nextUid: number;
  charms: CharmInst[]; charmSlots: number; cons: Consumable[]; consSlots: number;
  vouchers: VoucherId[]; voucherAnte: number; levels: Record<HandType, number>; played: Record<HandType, number>;
  baseHands: number; baseRedraws: number; tags: TagId[]; handTag: number; freeCharm: boolean; freeRare: boolean;
  screen: Screen; table: TableState | null; cashout: Cashout | null; shop: ShopState | null; pack: PackState | null;
  stats: RunStats; end: null | { won: boolean; reason: string };
}

export const hasCharm = (run: RunState, id: CharmId) => run.charms.some((c) => c.id === id);
const activeCharms = (run: RunState) => run.charms.filter((c) => c.uid !== run.table?.round?.off);
const live = (run: RunState, id: CharmId) => activeCharms(run).some((c) => c.id === id);
export const stageOf = (run: RunState): Stage => STAGES[run.stage];
export function targetFor(ante: number, stage: Stage): number {
  const base = ante <= 8 ? ANTE_BASE[ante] : Math.round(ANTE_BASE[8] * 1.75 ** (ante - 8) / 1000) * 1000;
  return Math.round(base * STAGE_INFO[stage].mult);
}
export function bossFor(run: RunState, ante: number): BossId {
  if (run.bosses[ante]) return run.bosses[ante];
  if (ante % 8 === 0) return 'house';
  const used = Object.values(run.bosses);
  const rng = stream(run.seed, `boss:${ante}`);
  const fresh = BOSS_POOL.filter((b) => !used.includes(b));
  return pickOne(rng, fresh.length ? fresh : BOSS_POOL);
}
export const handLevel = (run: RunState, t: HandType) => run.levels[t] ?? 1;

// --------------------------------------------------------------- the table

/** Each action works on a copy so React always sees fresh objects. */
function work(run: RunState): RunState {
  const t = run.table;
  if (!t) return { ...run, charms: run.charms.map((c) => ({ ...c })) };
  const r = t.round;
  return {
    ...run, charms: run.charms.map((c) => ({ ...c })),
    table: {
      ...t, deck: [...t.deck], discard: [...t.discard], house: [...t.house], houseDiscard: [...t.houseDiscard],
      round: r && { ...r, hands: r.hands.map((h) => ({ ...h, cards: [...h.cards] })), dealer: [...r.dealer], results: r.results && [...r.results] },
    },
  };
}

export function openTable(run0: RunState): RunState {
  const run = { ...run0 };
  const stage = stageOf(run);
  const boss = stage === 'boss' ? bossFor(run, run.ante) : null;
  const hands = run.baseHands + (run.vouchers.includes('grand_table') ? 1 : 0) + (hasCharm(run, 'house_edge') ? 1 : 0) + run.handTag - (boss === 'hourglass' ? 1 : 0);
  const redraws = boss === 'briefcase' ? 0 : run.baseRedraws + (run.vouchers.includes('fresh_deck') ? 1 : 0);
  const label = `${run.ante}:${stage}`;
  run.table = {
    ante: run.ante, stage, boss, target: targetFor(run.ante, stage), score: 0,
    handsLeft: hands, redrawsLeft: redraws, maxHands: hands, maxRedraws: redraws,
    deck: shuffle(stream(run.seed, `deck:${label}:0`), run.deck), discard: [],
    house: shuffle(stream(run.seed, `house:${label}:0`), standardDeck(-1000)), houseDiscard: [],
    round: null, roundNo: 0, shuffles: 0, over: null, dealerLows: 0, netUsed: false, feetUsed: false, best: 0,
  };
  run.handTag = 0;
  run.screen = 'table';
  if (boss) run.bosses = { ...run.bosses, [run.ante]: boss };
  return run;
}

function drawMine(run: RunState): PCard {
  const t = run.table!;
  if (!t.deck.length) {
    t.shuffles += 1;
    t.deck = shuffle(stream(run.seed, `deck:${t.ante}:${t.stage}:${t.shuffles}`), t.discard);
    t.discard = [];
  }
  return t.deck.pop()!;
}
function drawHouse(run: RunState): PCard {
  const t = run.table!;
  if (t.boss === 'mirror') return drawMine(run);
  if (!t.house.length) {
    t.shuffles += 1;
    t.house = shuffle(stream(run.seed, `house:${t.ante}:${t.stage}:${t.shuffles}`), t.houseDiscard);
    t.houseDiscard = [];
  }
  return t.house.pop()!;
}
function countLow(run: RunState, c: PCard) {
  if (c.enh !== 'stone' && ['2', '3', '4', '5', '6'].includes(c.rank)) run.table!.dealerLows += 1;
}

/** Clears the last hand and deals the next one. */
export function deal(run0: RunState): RunState {
  const t0 = run0.table;
  if (!t0 || t0.over || (t0.round && t0.round.phase !== 'done') || t0.handsLeft <= 0) return run0;
  const run = work(run0);
  const t = run.table!;
  if (t.round) {
    for (const h of t.round.hands) t.discard.push(...h.cards);
    (t.boss === 'mirror' ? t.discard : t.houseDiscard).push(...t.round.dealer);
    t.round = null;
  }
  if (t.boss === 'shuffler') {
    t.shuffles += 1;
    t.deck = shuffle(stream(run.seed, `deck:${t.ante}:${t.stage}:${t.shuffles}`), [...t.deck, ...t.discard]);
    t.discard = [];
  }
  if (t.house.length < 12 && t.boss !== 'mirror') {
    t.shuffles += 1;
    t.house = shuffle(stream(run.seed, `house:${t.ante}:${t.stage}:${t.shuffles}`), [...t.house, ...t.houseDiscard]);
    t.houseDiscard = [];
  }
  t.roundNo += 1;
  const off = t.boss === 'pit_boss' && run.charms.length ? pickOne(stream(run.seed, `off:${t.ante}:${t.roundNo}`), run.charms).uid : null;
  const hand: PHand = { cards: [], hits: 0, doubled: false, done: false, split: false, book: true };
  t.round = { hands: [hand], active: 0, dealer: [], holeHidden: true, phase: 'play', insured: false, dealerBust: false, results: null, gained: 0, off };
  hand.cards.push(drawMine(run));
  t.round.dealer.push(drawHouse(run));
  hand.cards.push(drawMine(run));
  t.round.dealer.push(drawHouse(run));
  countLow(run, t.round.dealer[0]);
  const up = t.round.dealer[0];
  if (up.rank === 'A' && up.enh !== 'stone' && live(run, 'insurance') && run.money >= 2) { t.round.phase = 'insurance'; return run; }
  return peek(run);
}

export function insure(run0: RunState, take: boolean): RunState {
  const r0 = run0.table?.round;
  if (!r0 || r0.phase !== 'insurance') return run0;
  const run = work(run0);
  const r = run.table!.round!;
  r.phase = 'play';
  if (take) { run.money -= 2; r.insured = true; }
  return peek(run);
}

function dealerNatural(cards: PCard[]) { return cards.length === 2 && totalOf(cards).total === 21; }

/** The dealer checks for blackjack before you act. */
function peek(run: RunState): RunState {
  const t = run.table!, r = t.round!;
  const up = r.dealer[0];
  const canPeek = up.enh === 'wild' || (up.enh !== 'stone' && (up.rank === 'A' || rankValue(up.rank) === 10));
  if (canPeek && dealerNatural(r.dealer)) {
    r.holeHidden = false;
    countLow(run, r.dealer[1]);
    const h = r.hands[0];
    if (r.insured) { run.money += 8; return finish(run, [{ outcome: 'refund', type: null, reason: 'Insurance paid. The hand is refunded.', score: null }]); }
    if (isNatural(h)) return finish(run, [{ outcome: 'push', type: null, reason: 'Blackjack against blackjack. Push.', score: null }]);
    if (live(run, 'hush')) return finish(run, [{ outcome: 'push', type: null, reason: 'Hush Money: the dealer\'s blackjack is only a push.', score: null }]);
    return finish(run, [settleOne(run, 0, 'loss', 'The dealer has blackjack.')]);
  }
  if (r.insured) r.insured = false;
  if (isNatural(r.hands[0])) { r.hands[0].done = true; return dealerTurn(run); }
  return run;
}

export const canDouble = (run: RunState) => {
  const h = activeHand(run);
  return !!h && h.cards.length === 2 && !h.hits && !h.doubled;
};
export const canSplit = (run: RunState) => {
  const r = run.table?.round, h = activeHand(run);
  return !!r && !!h && live(run, 'split') && r.hands.length < 4 && h.cards.length === 2 && !h.hits && h.cards[0].rank === h.cards[1].rank
    && h.cards[0].enh !== 'stone' && h.cards[1].enh !== 'stone';
};
export const canSurrender = (run: RunState) => {
  const r = run.table?.round, h = activeHand(run);
  return !!r && !!h && live(run, 'cold_feet') && !run.table!.feetUsed && r.hands.length === 1 && h.cards.length === 2 && !h.hits && !h.doubled;
};
export const canRedraw = (run: RunState) => !!activeHand(run) && run.table!.redrawsLeft > 0;
export function activeHand(run: RunState): PHand | null {
  const r = run.table?.round;
  if (!r || r.phase !== 'play') return null;
  const h = r.hands[r.active];
  return h && !h.done ? h : null;
}
const charlieSize = (run: RunState) => (live(run, 'five_dime') ? 4 : 5);

export type Action = 'hit' | 'stand' | 'double' | 'split' | 'surrender';
export function act(run0: RunState, a: Action): RunState {
  const h0 = activeHand(run0);
  if (!h0) return run0;
  if (a === 'double' && !canDouble(run0)) return run0;
  if (a === 'split' && !canSplit(run0)) return run0;
  if (a === 'surrender' && !canSurrender(run0)) return run0;
  const run = work(run0);
  const t = run.table!, r = t.round!;
  const h = r.hands[r.active];
  const up = r.dealer[0];
  if (a === 'surrender') {
    t.feetUsed = true;
    return finish(run, [{ outcome: 'refund', type: null, reason: 'Cold Feet: you surrender and keep the hand.', score: null }]);
  }
  if (a === 'split') {
    const second: PHand = { cards: [h.cards.pop()!], hits: 0, doubled: false, done: false, split: true, book: h.book };
    h.split = true;
    h.cards.push(drawMine(run));
    r.hands.splice(r.active + 1, 0, second);
    return settleAuto(run);
  }
  const want = bookMove(h.cards, up, h.cards.length === 2 && !h.hits);
  if (want !== (a === 'hit' ? 'HIT' : a === 'stand' ? 'STAND' : 'DOUBLE')) h.book = false;
  if (a === 'stand') { h.done = true; return advance(run); }
  const c = drawMine(run);
  h.cards.push(c);
  if (a === 'hit') { h.hits += 1; if (t.boss === 'thief') run.money = Math.max(0, run.money - 1); }
  if (a === 'double') { h.doubled = true; h.done = true; }
  if (totalOf(h.cards).total > 21 && live(run, 'safety_net') && !t.netUsed) {
    t.netUsed = true;
    t.discard.push(h.cards.pop()!);
    if (a === 'double') h.done = true;
  }
  return settleAuto(run);
}

/** Swap a card in your hand for the top card of your deck. */
export function redraw(run0: RunState, uid: number): RunState {
  const h0 = activeHand(run0);
  if (!h0 || !canRedraw(run0) || !h0.cards.some((c) => c.uid === uid)) return run0;
  const run = work(run0);
  const t = run.table!, h = activeHand(run)!;
  const i = h.cards.findIndex((c) => c.uid === uid);
  t.discard.push(h.cards[i]);
  h.cards[i] = drawMine(run);
  t.redrawsLeft -= 1;
  return settleAuto(run);
}

/** Auto-stand on 21, bust out, or win on a Charlie; then move on to the next hand. */
export function settleAuto(run: RunState): RunState {
  const r = run.table!.round!;
  const h = r.hands[r.active];
  if (!h) return run;
  const { total } = totalOf(h.cards);
  if (total >= 21 || h.cards.length >= charlieSize(run)) h.done = true;
  return h.done ? advance(run) : run;
}

function advance(run: RunState): RunState {
  const r = run.table!.round!;
  while (r.active < r.hands.length && r.hands[r.active].done) {
    r.active += 1;
    // a split hand gets its second card dealt as you reach it
    const next = r.hands[r.active];
    if (next && next.cards.length === 1) next.cards.push(drawMine(run));
    if (next && !next.done) { settleAuto(run); return run; }
  }
  return dealerTurn(run);
}

function dealerTurn(run: RunState): RunState {
  const t = run.table!, r = t.round!;
  r.holeHidden = false;
  countLow(run, r.dealer[1]);
  const needDealer = r.hands.some((h) => {
    const v = totalOf(h.cards).total;
    return v <= 21 && h.cards.length < charlieSize(run) && !isNatural(h);
  });
  if (needDealer) {
    const standAt = t.boss === 'wall' ? 15 : 17;
    for (;;) {
      const d = totalOf(r.dealer);
      if (d.total < standAt || (d.total === 17 && d.soft && t.boss === 'house')) {
        const c = drawHouse(run);
        r.dealer.push(c);
        countLow(run, c);
      } else break;
    }
  }
  const d = totalOf(r.dealer).total;
  r.dealerBust = d > 21;
  const results = r.hands.map((h, i) => {
    const v = totalOf(h.cards).total;
    if (v > 21) return settleOne(run, i, 'bust', 'Bust.');
    if (h.cards.length >= charlieSize(run)) return settleOne(run, i, 'win', `${h.cards.length}-card Charlie!`, 'charlie');
    if (isNatural(h)) return settleOne(run, i, 'win', 'Blackjack!', t.boss === 'cooler' ? 'win' : 'blackjack');
    if (d > 21) return settleOne(run, i, 'win', 'The dealer busts.', v === 21 ? 'twentyone' : v === 20 ? 'twenty' : 'dealer_bust');
    if (v > d) return settleOne(run, i, 'win', `${v} beats ${d}.`, v === 21 ? 'twentyone' : v === 20 ? 'twenty' : 'win');
    if (v === d && t.boss !== 'house') return { outcome: 'push' as const, type: null, reason: `${v} each. Push: the hand comes back.`, score: null };
    return settleOne(run, i, 'loss', v === d ? `${v} each, and the House wins ties.` : `${d} beats ${v}.`);
  });
  return finish(run, results);
}

function settleOne(run: RunState, i: number, outcome: 'win' | 'loss' | 'bust', reason: string, type?: HandType): HandResult {
  if (outcome === 'bust') return { outcome, type: null, reason, score: null };
  if (outcome === 'loss' && run.table!.round!.hands[i].doubled) return { outcome, type: 'loss', reason: `${reason} Doubled and lost: nothing scores.`, score: null };
  const t: HandType = outcome === 'loss' ? 'loss' : type ?? 'win';
  return { outcome, type: t, reason, score: score(run, i, t) };
}

/** Bank the results: score, money, scaling charms, shattered glass, and whether the table is won or lost. */
function finish(run: RunState, results: HandResult[]): RunState {
  const t = run.table!, r = t.round!;
  r.phase = 'done';
  r.results = results;
  r.holeHidden = false;
  let gained = 0, consumed = false;
  for (const res of results) {
    if (res.outcome === 'push' || res.outcome === 'refund') continue;
    consumed = true;
    run.stats = { ...run.stats, hands: run.stats.hands + 1 };
    const streak = run.charms.find((c) => c.id === 'hot_streak');
    const snow = run.charms.find((c) => c.id === 'snowball');
    if (res.outcome === 'win') {
      run.stats.wins += 1;
      if (streak) streak.counter += 1;
      if (snow) snow.counter += 1;
    } else {
      if (streak) streak.counter = 0;
      if (snow) snow.counter = Math.max(0, snow.counter - 1);
    }
    if (res.score) {
      gained += res.score.total;
      run.money += res.score.money;
      run.played = { ...run.played, [res.score.type]: (run.played[res.score.type] ?? 0) + 1 };
      if (res.score.type === 'blackjack') run.stats.blackjacks += 1;
      if (res.score.total > run.stats.bestHand) run.stats = { ...run.stats, bestHand: res.score.total, bestType: res.score.type };
      if (res.score.shattered.length) destroyCards(run, res.score.shattered);
    }
  }
  if (consumed) t.handsLeft -= 1;
  r.gained = gained;
  t.score += gained;
  t.best = Math.max(t.best, gained);
  run.stats = { ...run.stats, total: run.stats.total + gained };
  if (t.score >= t.target) t.over = { won: true };
  else if (t.handsLeft <= 0) t.over = { won: false };
  return run;
}

/** Removes cards from your deck for good (shattered glass, the Shredder). */
export function destroyCards(run: RunState, uids: number[]) {
  const gone = new Set(uids);
  run.deck = run.deck.filter((c) => !gone.has(c.uid));
  const t = run.table;
  if (!t) return;
  t.deck = t.deck.filter((c) => !gone.has(c.uid));
  t.discard = t.discard.filter((c) => !gone.has(c.uid));
  if (t.round) for (const h of t.round.hands) h.cards = h.cards.filter((c) => !gone.has(c.uid));
}
/** Changes cards everywhere they live: your deck list, the draw pile, and your hand. */
export function changeCards(run: RunState, uids: number[], fn: (c: PCard) => PCard) {
  const set = new Set(uids);
  const map = (list: PCard[]) => list.map((c) => (set.has(c.uid) ? fn(c) : c));
  run.deck = map(run.deck);
  const t = run.table;
  if (!t) return;
  t.deck = map(t.deck);
  t.discard = map(t.discard);
  if (t.round) for (const h of t.round.hands) h.cards = map(h.cards);
}

// ------------------------------------------------------------------ scoring

const LOW = new Set(['2', '3', '4', '5']);
const EVEN = new Set(['2', '4', '6', '8', '10']);
const ODD = new Set(['3', '5', '7', '9', 'A']);

/** chips × mult, step by step: base hand, each card, each charm left to right, then doubling. */
export function score(run: RunState, i: number, type: HandType): Scored {
  const t = run.table!, r = t.round!, h = r.hands[i];
  const def = HANDS[type];
  const level = type === 'loss' ? 1 : handLevel(run, type);
  const baseChips = def.chips + def.lvChips * (level - 1);
  const baseMult = def.mult + def.lvMult * (level - 1);
  let chips = baseChips, mult = baseMult, money = 0;
  const steps: Step[] = [];
  const shattered: number[] = [];
  const win = type !== 'loss';
  const charms = activeCharms(run);
  const on = (id: CharmId) => charms.find((c) => c.id === id);
  const add = (s: Step) => {
    if (s.chips) chips += s.chips;
    if (s.mult) mult += s.mult;
    if (s.xmult) mult *= s.xmult;
    if (s.money) money += s.money;
    steps.push(s);
  };
  const rng = stream(run.seed, `luck:${t.ante}:${t.stage}:${t.roundNo}:${i}`);
  const luck = on('lucky_coin') ? 2 : 1;

  const scoreCard = (c: PCard, idx: number, again: boolean) => {
    const at = { card: idx };
    const tag = again ? 'Again! ' : '';
    if (c.enh === 'stone') { add({ at, chips: 50, text: `${tag}+50` }); return; }
    const rc = t.boss === 'mime' && isFace(c.rank) ? 0 : rankValue(c.rank);
    if (rc) add({ at, chips: rc, text: `${tag}+${rc}` });
    if (c.enh === 'bonus') add({ at, chips: 30, text: '+30' });
    if (c.enh === 'glass') {
      const x = on('glass_cannon') ? 2 : 1.5;
      add({ at, xmult: x, text: `×${x}` });
      if (!again && rng() < 0.25) shattered.push(c.uid);
    }
    if (c.enh === 'lucky') {
      if (rng() < 0.2 * luck) add({ at, mult: 10, text: '+10 mult' });
      if (rng() < luck / 15) add({ at, money: 10, text: '+$10' });
    }
    if (c.enh === 'gold' && win) {
      add({ at, money: 2, text: '+$2' });
      if (on('gold_rush')) add({ at: { charm: on('gold_rush')!.uid }, mult: 6, text: '+6 mult' });
    }
    for (const ch of charms) {
      const cat = { charm: ch.uid };
      if (ch.id === 'lucky_sevens' && c.rank === '7') add({ at: cat, mult: 7, text: '+7 mult' });
      if (ch.id === 'royal_court' && isFace(c.rank)) add({ at: cat, mult: 3, text: '+3 mult' });
      if (ch.id === 'ace_hole' && c.rank === 'A') add({ at: cat, chips: 25, text: '+25' });
      if (ch.id === 'low_rider' && LOW.has(c.rank)) add({ at: cat, mult: 5, text: '+5 mult' });
      if (ch.id === 'even_steven' && EVEN.has(c.rank)) add({ at: cat, mult: 4, text: '+4 mult' });
      if (ch.id === 'odd_todd' && ODD.has(c.rank)) add({ at: cat, chips: 30, text: '+30' });
    }
  };
  h.cards.forEach((c, idx) => {
    scoreCard(c, idx, false);
    if (idx < 2 && on('encore')) scoreCard(c, idx, true);
  });

  const { total, soft } = totalOf(h.cards);
  {
    for (const ch of charms) {
      const at = { charm: ch.uid };
      switch (ch.id) {
        case 'high_roller': add({ at, mult: 4, text: '+4 mult' }); break;
        case 'lucky_penny': add({ at, mult: 15, text: '+15 mult' }); break;
        case 'tip_jar': if (win) add({ at, money: 1, text: '+$1' }); break;
        case 'fat_stack': add({ at, xmult: 2, text: '×2 mult' }); break;
        case 'snowball': if (ch.counter) add({ at, mult: ch.counter, text: `+${ch.counter} mult` }); break;
        case 'twenty_club': if (total === 20) add({ at, xmult: 1.5, text: '×1.5 mult' }); break;
        case 'schadenfreude': if (r.dealerBust) add({ at, xmult: 2, text: '×2 mult' }); break;
        case 'big_hand': if (h.cards.length >= 4) add({ at, xmult: 1.5, text: '×1.5 mult' }); break;
        case 'compounder': if (ch.counter) add({ at, xmult: 1 + 0.2 * ch.counter, text: `×${Math.round((1 + 0.2 * ch.counter) * 10) / 10} mult` }); break;
        case 'chip_stack': add({ at, chips: 40, text: '+40' }); break;
        case 'bust_boom': if (r.dealerBust) add({ at, mult: 10, text: '+10 mult' }); break;
        case 'soft_touch': if (soft) add({ at, mult: 8, text: '+8 mult' }); break;
        case 'hard_case': if (!soft) add({ at, chips: 50, text: '+50' }); break;
        case 'stand_pat': if (win && !h.hits && !h.doubled) add({ at, chips: 60, text: '+60' }); break;
        case 'greedy': if (h.hits) add({ at, mult: 4 * h.hits, text: `+${4 * h.hits} mult` }); break;
        case 'pocket_pair': if (h.cards.length >= 2 && h.cards[0].rank === h.cards[1].rank) add({ at, mult: 12, text: '+12 mult' }); break;
        case 'by_the_book': if (h.book) add({ at, mult: 10, text: '+10 mult' }); break;
        case 'counter': if (t.dealerLows) add({ at, mult: t.dealerLows, text: `+${t.dealerLows} mult` }); break;
        case 'hot_streak': add({ at, mult: 2 * (ch.counter + 1), text: `+${2 * (ch.counter + 1)} mult` }); break;
        case 'collector': add({ at, mult: 3 * run.charms.length, text: `+${3 * run.charms.length} mult` }); break;
        case 'suit_up': if (h.cards.every((c) => c.suit === h.cards[0].suit)) add({ at, xmult: 2, text: '×2 mult' }); break;
        case 'whale': if (type === 'blackjack') add({ at, xmult: 3, text: '×3 mult' }); break;
        case 'perfect': if (total === 21) add({ at, xmult: 2, text: '×2 mult' }); break;
        case 'loan_shark': if (run.money > 0) add({ at, chips: 2 * run.money, text: `+${2 * run.money}` }); break;
        case 'natural': {
          if (type === 'blackjack') ch.counter += 1;
          if (ch.counter) add({ at, xmult: 1 + 0.25 * ch.counter, text: `×${1 + 0.25 * ch.counter} mult` });
          break;
        }
        default: break;
      }
    }
    if (h.doubled && win) { const x = on('double_trouble') ? 3 : 2; add({ at: { hand: true }, xmult: x, text: `Doubled ×${x}` }); }
  }
  // a lost hand scores half, unless you're a Sore Loser
  if (!win) {
    const sl = on('sore_loser');
    if (sl) steps.push({ at: { charm: sl.uid }, text: 'Full score!' });
    else add({ at: { hand: true }, xmult: 0.5, text: 'Lost ×½' });
  }
  if (t.boss === 'taxman' && mult > 1) add({ at: { hand: true }, xmult: 0.5, text: 'Tax Man ×½' });
  mult = Math.round(mult * 100) / 100;
  return { type, level, baseChips, baseMult, steps, chips, mult, total: Math.floor(chips * mult), money, shattered };
}

export const charmName = (id: CharmId) => CHARMS[id].name;
export const bossName = (id: BossId) => BOSSES[id].name;
export type { Suit };
