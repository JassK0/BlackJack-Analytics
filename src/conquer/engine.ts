// Count & Conquer: seeded randomness, the city map, and the blackjack table with Heat
import type { Rank } from '../engine/types';
import { buildShoe, handValue, HILO, isTenOrAce } from '../engine/cards';
import { mulberry32, type Rng } from '../engine/rng';
import { playerAction } from '../engine/session';
import { BOSSES, CITIES, NPC_NAMES, NPC_STYLE, type NodeType, type NpcStyle, type RelicId, type Special } from './data';

// --------------------------------------------------------------- seeds

const SEED_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomSeedCode(): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += SEED_CHARS[Math.floor(Math.random() * SEED_CHARS.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}
export const cleanSeed = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
export const formatSeed = (raw: string) => { const s = cleanSeed(raw); return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : s; };

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
/** An independent random stream per purpose, so one choice never shifts another's luck. */
export const stream = (seed: string, label: string): Rng => mulberry32(hash(`${cleanSeed(seed)}|${label}`));
export const pick = <T,>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];
export function shuffled<T>(rng: Rng, list: readonly T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ----------------------------------------------------------------- map

export interface MapNode { id: string; row: number; lane: number; type: NodeType; next: string[] }
export interface ActMap { act: number; nodes: MapNode[] }
export const MAP_ROWS = 6;
const LANES = 4;

/** Slay-the-Spire style: three wandering paths over four lanes, merged, then a boss. */
export function generateMap(seed: string, act: number): ActMap {
  const rng = stream(seed, `map:${act}`);
  const nodes = new Map<string, MapNode>();
  const id = (row: number, lane: number) => `${act}-${row}-${lane}`;
  const starts = shuffled(rng, [0, 1, 2, 3]).slice(0, 3);
  for (const start of starts) {
    let lane = start;
    for (let row = 0; row < MAP_ROWS; row++) {
      const key = id(row, lane);
      if (!nodes.has(key)) nodes.set(key, { id: key, row, lane, type: 'casino', next: [] });
      if (row < MAP_ROWS - 1) {
        const nextLane = Math.max(0, Math.min(LANES - 1, lane + Math.floor(rng() * 3) - 1));
        const n = nodes.get(key)!;
        const nk = id(row + 1, nextLane);
        if (!n.next.includes(nk)) n.next.push(nk);
        lane = nextLane;
      }
    }
  }
  const boss: MapNode = { id: `${act}-boss`, row: MAP_ROWS, lane: 1.5, type: 'boss', next: [] };
  for (const n of nodes.values()) {
    if (n.row === 0) n.type = 'casino';
    else if (n.row === MAP_ROWS - 1) { n.type = 'motel'; n.next = [boss.id]; }
    else {
      const r = rng();
      n.type = r < 0.44 ? 'casino' : r < 0.66 ? 'event' : r < 0.8 ? 'shop' : n.row >= 2 ? 'elite' : 'casino';
    }
  }
  const list = [...nodes.values(), boss];
  if (!list.some((n) => n.type === 'shop')) {
    const mid = list.filter((n) => n.row >= 2 && n.row <= 4);
    if (mid.length) mid[Math.floor(rng() * mid.length)].type = 'shop';
  }
  return { act, nodes: list.sort((a, b) => a.row - b.row || a.lane - b.lane) };
}

// ------------------------------------------------------------ casinos

export interface CasinoSpec {
  id: string; name: string; tier: 'casino' | 'elite' | 'boss'; act: number;
  decks: number; pen: number; minBet: number; maxBet: number; target: number; sens: number; hands: number;
  npcs: string[]; bjPays: number; h17: boolean; special: Special | null; blurb: string;
}

export function casinoFor(seed: string, node: MapNode): CasinoSpec {
  const act = Number(node.id.split('-')[0]);
  const city = CITIES[act - 1];
  const rng = stream(seed, `casino:${node.id}`);
  const round10 = (x: number) => Math.round(x / 10) * 10;
  const npcCount = city.npcs[0] + Math.floor(rng() * (city.npcs[1] - city.npcs[0] + 1));
  const npcs = shuffled(rng, NPC_NAMES).slice(0, npcCount);
  const base = {
    id: node.id, act, decks: pick(rng, city.decks), pen: city.pen, minBet: city.minBet, maxBet: city.maxBet, sens: city.sens, npcs,
    bjPays: 1.5, h17: false, hands: city.hands,
  };
  if (node.type === 'boss') {
    const b = BOSSES[act];
    return {
      ...base, name: b.name, tier: 'boss', decks: b.decks, target: b.target, maxBet: city.maxBet * 2, special: b.special, blurb: b.blurb, hands: b.hands,
      sens: b.special === 'eye' ? city.sens * 1.6 : city.sens, bjPays: b.special === 'syndicate' ? 1.2 : 1.5, h17: b.special === 'syndicate',
    };
  }
  const name = pick(rng, city.casinos);
  const target = round10(city.target[0] + (city.target[1] - city.target[0]) * rng());
  if (node.type === 'elite') {
    return {
      ...base, name: `${name} High Limit`, tier: 'elite', target: round10(target * 1.7), minBet: city.minBet * 2, maxBet: city.maxBet * 2,
      sens: city.sens + 0.2, special: null, blurb: 'Bigger limits, a bigger mark, and a pit boss who has seen it all.',
    };
  }
  return { ...base, name, tier: 'casino', target, special: null, blurb: city.tagline };
}

// --------------------------------------------------------------- table

export type Outcome = 'blackjack' | 'win' | 'dealer_bust' | 'push' | 'lose' | 'bust' | 'dealer_blackjack' | 'surrender';
export type NpcResult = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';
export type Move = 'HIT' | 'STAND' | 'DOUBLE' | 'SURRENDER';
/** 'P' is you, 'D' the dealer, a number is an NPC seat. */
export type SeatId = 'P' | 'D' | number;
export interface Npc { name: string; style: NpcStyle; first: boolean; cards: Rank[]; result: NpcResult | null }
export type DealEvent =
  | { kind: 'card'; seat: SeatId; card: Rank; hole?: boolean }
  | { kind: 'reveal' }
  | { kind: 'shuffle'; why: 'cut' | 'pref' | 'varga' | 'empty' };

export interface Round {
  sitOut: boolean; bet: number; side: number; player: Rank[]; dealer: Rank[]; npcs: Npc[];
  doubled: boolean; insured: number; surrendered: boolean; holeHidden: boolean;
  phase: 'insurance' | 'play' | 'done'; result: Outcome | null;
  profit: number; insuranceProfit: number; sideProfit: number; seq: DealEvent[]; tcAtBet: number;
  /** How this hand moved the job: + for hot money, - for big bets into a cold shoe. */
  hotDelta: number;
  /** The shoe was shuffled before this deal, so a big bet here isn't held against you. */
  shuffled: boolean;
}
export interface LogLine { text: string; tone: 'good' | 'bad' | 'info' | 'heat' }
export type EndReason = 'closed' | 'left' | 'backed_off' | 'broke';
export interface TableState {
  spec: CasinoSpec; seed: string; relics: RelicId[]; assisted: boolean;
  shoe: Rank[]; pos: number; cut: number; shoeNo: number; dealt: number; seated: boolean; watched: number;
  rc: number; heat: number; hot: number; bankroll: number; startBankroll: number; net: number; hands: number; prevBet: number;
  round: Round | null; over: null | { reason: EndReason; cleared: boolean };
  nextCheck: number; check: { options: number[]; answer: number } | null;
  peeking: boolean; lighterUsed: boolean; tipWait: number; log: LogLine[];
  focus: number; maxFocus: number; checksRight: number; checksTotal: number; biggestWin: number; heatPeak: number;
}

export const SIDE_PAYS = 8;
/** Bets placed at this true count or better are "hot money" and count toward the job. */
export const HOT_TC = 2;
/** Big bets below this true count are "cold money" and set the job back. */
export const COLD_TC = 1;
/** Hands you can watch from the rail before security wonders what you're doing. */
export const freeWatch = (spec: CasinoSpec) => 4 + 2 * spec.decks;
export const FREE_WATCH_TEXT = '6 hands at a single-deck game, up to 16 at a six-deck shoe';
const has = (t: TableState, r: RelicId) => t.relics.includes(r);
export const total = (c: readonly Rank[]) => handValue(c).total;
export const isBJ = (c: readonly Rank[]) => c.length === 2 && total(c) === 21;
/** Decks left, read off the discard tray to the nearest half deck, the way counters estimate it. */
export const decksLeft = (t: TableState) => Math.max(0.5, Math.round((t.shoe.length - t.pos) / 26) / 2);
export const trueCount = (t: TableState) => t.rc / decksLeft(t);
export const tableMax = (t: TableState) => {
  const m = t.spec.maxBet * (has(t, 'jacket') ? 1.5 : 1) * (t.heat >= 80 ? 0.5 : 1);
  return Math.max(t.spec.minBet, Math.floor(m / 5) * 5);
};
export const sideStake = (t: TableState) => t.spec.minBet;
export const heatLevel = (h: number) => (h >= 80 ? 'surveillance' : h >= 50 ? 'watched' : h >= 25 ? 'noticed' : 'calm');
const heatScale = (t: TableState) => t.spec.sens * (has(t, 'mustache') ? 0.8 : 1);

export interface RunView { bankroll: number; relics: RelicId[]; notoriety: number; focus: number; maxFocus: number; assisted: boolean }

export function openTable(seed: string, spec: CasinoSpec, run: RunView): TableState {
  const pen = Math.min(0.85, spec.pen + (run.relics.includes('tracker') ? 0.15 : 0));
  const comp = run.relics.includes('comp_card') ? spec.minBet * 4 : 0;
  const first = stream(seed, `check:${spec.id}:start`)();
  const t: TableState = {
    spec, seed, relics: run.relics, assisted: run.assisted,
    shoe: buildShoe(spec.decks, stream(seed, `shoe:${spec.id}:0`)), pos: 0, cut: Math.floor(spec.decks * 52 * pen), shoeNo: 0,
    dealt: 0, seated: false, watched: 0,
    rc: 0, heat: Math.min(90, run.notoriety * 12), hot: 0, bankroll: run.bankroll + comp, startBankroll: run.bankroll, net: comp, hands: 0, prevBet: spec.minBet,
    round: null, over: null, nextCheck: 4 + Math.floor(first * 3), check: null,
    peeking: false, lighterUsed: false, tipWait: 0, log: [], focus: run.focus, maxFocus: run.maxFocus,
    checksRight: 0, checksTotal: 0, biggestWin: 0, heatPeak: 0,
  };
  if (comp) say(t, `Your comp card is good for ${comp} in chips.`, 'good');
  if (run.notoriety) say(t, `Your reputation precedes you. Heat starts at ${t.heat}.`, 'heat');
  t.heatPeak = t.heat;
  return t;
}

// Every action works on a private copy, so React always sees new objects.
function work(t0: TableState): TableState {
  const r = t0.round;
  return {
    ...t0, log: [...t0.log],
    round: r && { ...r, player: [...r.player], dealer: [...r.dealer], npcs: r.npcs.map((n) => ({ ...n, cards: [...n.cards] })), seq: [...r.seq] },
  };
}
function say(t: TableState, text: string, tone: LogLine['tone']) { t.log = [{ text, tone }, ...t.log].slice(0, 8); }
function addHeat(t: TableState, h: number) {
  t.heat = Math.max(0, Math.min(100, Math.round((t.heat + h) * 10) / 10));
  t.heatPeak = Math.max(t.heatPeak, t.heat);
}
function freshShoe(t: TableState, why: 'cut' | 'pref' | 'varga' | 'empty') {
  t.shoeNo += 1;
  t.shoe = buildShoe(t.spec.decks, stream(t.seed, `shoe:${t.spec.id}:${t.shoeNo}`));
  t.pos = 0;
  t.rc = 0;
  t.round?.seq.push({ kind: 'shuffle', why });
}

/** Cards come out of the shoe in order. The count only sees a card once it's face up. */
function draw(t: TableState, seat: SeatId, hole = false): Rank {
  if (t.pos >= t.shoe.length) freshShoe(t, 'empty');
  const c = t.shoe[t.pos];
  t.pos += 1;
  t.dealt += 1;
  if (!hole) t.rc += HILO[c];
  const r = t.round!;
  if (seat === 'P') r.player.push(c);
  else if (seat === 'D') r.dealer.push(c);
  else r.npcs[seat].cards.push(c);
  r.seq.push({ kind: 'card', seat, card: c, hole: hole || undefined });
  return c;
}

function npcWants(n: Npc, up: Rank): 'HIT' | 'STAND' | 'DOUBLE' {
  const v = handValue(n.cards);
  if (n.style === 'cautious') return v.total >= 12 ? 'STAND' : 'HIT';
  if (n.style === 'dealer') return v.total >= 17 ? 'STAND' : 'HIT';
  if (n.style === 'reckless') return v.total >= 18 ? 'STAND' : 'HIT';
  return playerAction(n.cards, up, true);
}
function playNpc(t: TableState, i: number) {
  const r = t.round!;
  const n = r.npcs[i];
  if (isBJ(n.cards)) return;
  for (;;) {
    if (total(n.cards) >= 21) break;
    const a = npcWants(n, r.dealer[0]);
    if (a === 'STAND') break;
    draw(t, i);
    if (a === 'DOUBLE') break;
  }
}

/** Heat from your betting pattern this hand. Gradual ramps look natural, jumps look like counting. */
export function betHeat(t: TableState, bet: number, side: boolean): number {
  const k = heatScale(t);
  const spread = bet / t.spec.minBet, jump = bet / t.prevBet, tc = trueCount(t);
  let h = 0;
  if (jump >= 1.5) h += Math.min(35, 5 * (jump - 1));
  if (tc >= HOT_TC) h += 0.75 * Math.max(0, spread - 2);
  if (side && tc >= HOT_TC) h += 1.5;
  h *= k;
  if (spread <= 2 && jump < 1.5) h -= 2.5;
  return h;
}

export const watchHeat = (t: TableState) => (t.watched < freeWatch(t.spec) || has(t, 'watch') ? 0 : 2 * heatScale(t));
export interface BetOptions { side?: boolean }
export const stakeNeeded = (t: TableState, bet: number, side: boolean) => bet + (side ? sideStake(t) : 0);

export function startRound(t0: TableState, bet: number, opts: BetOptions = {}): TableState {
  if (t0.round || t0.over || t0.check) return t0;
  const sitOut = !t0.seated;
  const b = sitOut ? 0 : Math.max(t0.spec.minBet, Math.min(Math.floor(bet), tableMax(t0)));
  const side = !sitOut && !!opts.side;
  if (!sitOut && stakeNeeded(t0, b, side) > t0.bankroll) return t0;
  const t = work(t0);
  t.round = {
    sitOut, bet: b, side: side ? sideStake(t) : 0, player: [], dealer: [],
    npcs: t.spec.npcs.map((name, i) => ({ name, style: NPC_STYLE[name] ?? 'book', first: i === 0, cards: [], result: null })),
    doubled: false, insured: 0, surrendered: false, holeHidden: true, phase: 'play', result: null,
    profit: 0, insuranceProfit: 0, sideProfit: 0, seq: [], tcAtBet: 0, hotDelta: 0, shuffled: false,
  };

  if (t.pos >= t.cut) { freshShoe(t, 'cut'); say(t, 'The cut card is out. The dealer shuffles a fresh shoe.', 'info'); }
  else if (t.pos > 0) {
    // the house shuffles early when it smells a counter
    const rng = stream(t.seed, `pref:${t.spec.id}:${t.hands}`);
    const tc = trueCount(t);
    if (t.spec.special === 'varga' && !sitOut && b >= t.prevBet * 3 && rng() < 0.5) {
      freshShoe(t, 'varga'); say(t, 'Varga sees your bet jump and snaps his fingers. Fresh shoe.', 'heat');
    } else if (t.heat >= 50 && tc >= 3 && rng() < 0.25 + (t.heat >= 80 ? 0.15 : 0)) {
      freshShoe(t, 'pref'); say(t, 'The dealer shuffles up early. Someone upstairs is nervous.', 'heat');
    }
  }

  t.round.shuffled = t.round.seq.length > 0;
  const before = t.heat;
  if (sitOut) {
    const h = watchHeat(t);
    if (h && t.watched === freeWatch(t.spec)) say(t, 'Security wonders why you keep hovering behind the table.', 'heat');
    addHeat(t, h);
    t.watched += 1;
  } else {
    addHeat(t, betHeat(t, b, side));
    if (t.heat - before >= 8) say(t, 'The pit boss glances at your bet.', 'heat');
  }
  t.round.tcAtBet = trueCount(t);
  if (!sitOut) t.prevBet = b;

  // dealing order: first base (the NPC who acts before you), you, third base, then the dealer
  const npcs = t.round.npcs;
  const order: SeatId[] = [
    ...npcs.flatMap((n, i) => (n.first ? [i] : [])),
    ...(sitOut ? [] : ['P' as const]),
    ...npcs.flatMap((n, i) => (n.first ? [] : [i])),
  ];
  for (const s of order) draw(t, s);
  draw(t, 'D');
  for (const s of order) draw(t, s);
  draw(t, 'D', true);

  const r = t.round;
  if (side) {
    const hit = total(r.player) === 20;
    r.sideProfit = hit ? r.side * SIDE_PAYS : -r.side;
    if (hit) say(t, `Lucky 20! The side bet pays ${SIDE_PAYS} to 1.`, 'good');
  }
  if (r.dealer[0] === 'A' && !sitOut) { r.phase = 'insurance'; return t; }
  return peek(t);
}

export function insure(t0: TableState, take: boolean): TableState {
  const r0 = t0.round;
  if (!r0 || r0.phase !== 'insurance') return t0;
  const t = work(t0);
  const r = t.round!;
  if (take) {
    const amount = Math.floor(r.bet / 2);
    if (t.bankroll >= r.bet + r.side + amount) {
      r.insured = amount;
      addHeat(t, 2 * heatScale(t));
      const dealerBJ = total(r.dealer) === 21;
      const pays = has(t, 'agent') ? 3 : 2;
      r.insuranceProfit = dealerBJ ? amount * pays : -amount;
      say(t, dealerBJ ? `Insurance pays ${pays} to 1.` : 'No blackjack. The insurance is lost.', dealerBJ ? 'good' : 'bad');
    }
  }
  r.phase = 'play';
  return peek(t);
}

/** US rules: the dealer checks for blackjack before anyone acts. */
function peek(t: TableState): TableState {
  const r = t.round!;
  if (isTenOrAce(r.dealer[0]) && total(r.dealer) === 21) {
    reveal(t);
    for (const n of r.npcs) n.result = isBJ(n.cards) ? 'push' : 'lose';
    if (r.sitOut) { r.phase = 'done'; return t; }
    return settle(t, isBJ(r.player) ? 'push' : 'dealer_blackjack', isBJ(r.player) ? 0 : -1);
  }
  r.npcs.forEach((n, i) => { if (n.first) playNpc(t, i); });
  if (r.sitOut || isBJ(r.player)) return finish(t);
  return t;
}

function reveal(t: TableState) {
  const r = t.round!;
  if (!r.holeHidden) return;
  r.holeHidden = false;
  t.rc += HILO[r.dealer[1]];
  r.seq.push({ kind: 'reveal' });
}

export const canDouble = (t: TableState) => {
  const r = t.round;
  return !!r && r.phase === 'play' && !r.result && !r.sitOut && r.player.length === 2 && t.bankroll >= r.bet * 2 + r.insured + r.side;
};
export const canSurrender = (t: TableState) => {
  const r = t.round;
  return !!r && has(t, 'surrender') && r.phase === 'play' && !r.result && !r.sitOut && r.player.length === 2;
};

export function move(t0: TableState, m: Move): TableState {
  const r0 = t0.round;
  if (!r0 || r0.phase !== 'play' || r0.result || r0.sitOut) return t0;
  if (m === 'DOUBLE' && !canDouble(t0)) return t0;
  if (m === 'SURRENDER' && !canSurrender(t0)) return t0;
  const t = work(t0);
  const r = t.round!;
  if (m === 'SURRENDER') { r.surrendered = true; return finish(t); }
  if (m === 'HIT' || m === 'DOUBLE') {
    draw(t, 'P');
    if (m === 'DOUBLE') r.doubled = true;
    if (m === 'HIT' && total(r.player) < 21) return t;
  }
  return finish(t);
}

/** Third base plays, the dealer reveals and draws, then everything settles. */
function finish(t: TableState): TableState {
  const r = t.round!;
  r.npcs.forEach((n, i) => { if (!n.first) playNpc(t, i); });
  reveal(t);
  const playerLive = !r.sitOut && !r.surrendered && total(r.player) <= 21 && !isBJ(r.player);
  const npcLive = r.npcs.some((n) => total(n.cards) <= 21 && !isBJ(n.cards));
  if (playerLive || npcLive) {
    for (;;) {
      const v = handValue(r.dealer);
      if (v.total < 17 || (v.total === 17 && v.soft && t.spec.h17)) draw(t, 'D');
      else break;
    }
  }
  const d = total(r.dealer);
  for (const n of r.npcs) {
    const p = total(n.cards);
    n.result = isBJ(n.cards) ? 'blackjack' : p > 21 ? 'bust' : d > 21 || p > d ? 'win' : p === d ? 'push' : 'lose';
  }
  if (r.sitOut) { r.phase = 'done'; return t; }
  const k = r.doubled ? 2 : 1;
  const p = total(r.player);
  if (r.surrendered) return settle(t, 'surrender', -0.5);
  if (p > 21) return settle(t, 'bust', -k);
  if (isBJ(r.player)) return settle(t, 'blackjack', has(t, 'rabbit') ? 2 : t.spec.bjPays);
  if (d > 21) return settle(t, 'dealer_bust', k);
  if (p > d) return settle(t, 'win', k);
  if (p < d) return settle(t, 'lose', -k);
  return settle(t, 'push', 0);
}

function settle(t: TableState, result: Outcome, mult: number): TableState {
  const r = t.round!;
  let profit = Math.floor(r.bet * mult);
  if (profit < 0 && has(t, 'lighter') && !t.lighterUsed) {
    profit = 0;
    t.lighterUsed = true;
    say(t, 'Your lucky lighter flickers. That loss is a push.', 'good');
  }
  r.result = result;
  r.profit = profit;
  const hotBet = r.bet * (r.doubled ? 2 : 1) * (has(t, 'lucky_chip') ? 1.25 : 1);
  r.hotDelta = r.tcAtBet >= HOT_TC ? Math.round(hotBet) : r.tcAtBet < COLD_TC && !r.shuffled ? -(r.bet - t.spec.minBet) : 0;
  t.hot += r.hotDelta;
  r.phase = 'done';
  const delta = profit + r.insuranceProfit + r.sideProfit;
  t.bankroll += delta;
  t.net += delta;
  t.biggestWin = Math.max(t.biggestWin, delta);
  return t;
}

/** Clear the table, cool off, and check whether the session is over. */
export function endRound(t0: TableState): TableState {
  const r = t0.round;
  if (!r || r.phase !== 'done') return t0;
  const t = work(t0);
  t.round = null;
  if (!r.sitOut) t.hands += 1;
  t.peeking = false;
  t.tipWait = Math.max(0, t.tipWait - 1);
  if (has(t, 'cool_head')) addHeat(t, -2);
  const cleared = t.hot >= t.spec.target;
  if (t.heat >= 100) {
    say(t, 'Two men in suits ask you to cash out. You are being backed off.', 'bad');
    t.over = { reason: 'backed_off', cleared };
  } else if (t.bankroll < t.spec.minBet) {
    t.over = { reason: 'broke', cleared: false };
  } else if (t.hands >= t.spec.hands) {
    say(t, 'Last hand of the night. The table is closing.', 'info');
    t.over = { reason: 'closed', cleared };
  } else if (!t.assisted && t.hands >= t.nextCheck) {
    const rng = stream(t.seed, `check:${t.spec.id}:${t.hands}`);
    const answer = t.rc;
    const set = new Set<number>([answer]);
    while (set.size < 4) set.add(answer + (Math.floor(rng() * 9) - 4 || 3));
    t.check = { options: [...set].sort((a, b) => a - b), answer };
    t.nextCheck = t.hands + 4 + Math.floor(rng() * 3);
  }
  return t;
}

export function answerCheck(t0: TableState, value: number): TableState {
  if (!t0.check) return t0;
  const t = work(t0);
  const answer = t0.check.answer;
  t.check = null;
  t.checksTotal += 1;
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  if (value === answer) {
    t.checksRight += 1;
    t.focus = Math.min(t.maxFocus, t.focus + 1);
    addHeat(t, -6);
    say(t, `You kept the count through the small talk (${sign(answer)}). The pit boss moves on. +1 Focus.`, 'good');
  } else if (has(t, 'shades')) {
    say(t, `You lost the count (it was ${sign(answer)}), but behind the shades nobody can tell.`, 'info');
  } else {
    addHeat(t, 6);
    say(t, `You lost the count. It was ${sign(answer)}, and you look flustered.`, 'heat');
  }
  return t;
}

export const tipCost = (t: TableState) => (has(t, 'friend') ? 0 : t.spec.minBet * 2);
export const canTip = (t: TableState) => !t.round && !t.over && !t.check && t.tipWait === 0 && t.heat > 0 && t.bankroll >= tipCost(t) + t.spec.minBet;
export function tip(t0: TableState): TableState {
  if (!canTip(t0)) return t0;
  const t = work(t0);
  const c = tipCost(t);
  t.bankroll -= c;
  t.net -= c;
  t.tipWait = 3;
  addHeat(t, -10);
  say(t, c ? `You tip the dealer $${c}. Everyone relaxes a little.` : 'The dealer winks. Heat drops.', 'good');
  return t;
}

export function concentrate(t0: TableState): TableState {
  if (t0.focus <= 0 || t0.peeking || t0.round || t0.over) return t0;
  return { ...t0, focus: t0.focus - 1, peeking: true };
}

/** Take a seat. Sitting down into a hot shoe mid-shoe is a classic counter tell. */
export function sitDown(t0: TableState): TableState {
  if (t0.seated || t0.round || t0.over || t0.check) return t0;
  const t = work(t0);
  t.seated = true;
  t.prevBet = t.spec.minBet;
  if (t.pos > 0 && trueCount(t) >= HOT_TC && !has(t, 'watch')) {
    addHeat(t, 4 * heatScale(t));
    say(t, 'You slide into a seat mid-shoe. The pit boss makes a note.', 'heat');
  } else say(t, 'You take a seat and buy in.', 'info');
  return t;
}
export function standUp(t0: TableState): TableState {
  if (!t0.seated || t0.round || t0.over || t0.check) return t0;
  const t = work(t0);
  t.seated = false;
  say(t, 'You step back from the table to watch.', 'info');
  return t;
}

export function leaveTable(t0: TableState): TableState {
  if (t0.round || t0.over) return t0;
  return { ...t0, over: { reason: 'left', cleared: t0.hot >= t0.spec.target } };
}

// ------------------------------------------------------------- hints

/** A few of the "Illustrious 18" count-based plays, for the Illustrious Notes relic. */
export function deviation(player: readonly Rank[], up: Rank, tc: number): { move: Move; text: string } | null {
  const { total: p, soft } = handValue(player);
  const u = up === 'A' ? 11 : ['10', 'J', 'Q', 'K'].includes(up) ? 10 : Number(up);
  if (soft) return null;
  const two = player.length === 2;
  if (p === 16 && u === 10 && tc >= 0) return { move: 'STAND', text: 'Count is up: stand on 16 vs 10.' };
  if (p === 15 && u === 10 && tc >= 4) return { move: 'STAND', text: 'Count is very high: stand on 15 vs 10.' };
  if (p === 12 && u === 3 && tc >= 2) return { move: 'STAND', text: 'Count is up: stand on 12 vs 3.' };
  if (p === 12 && u === 2 && tc >= 3) return { move: 'STAND', text: 'Count is up: stand on 12 vs 2.' };
  if (p === 13 && u === 2 && tc <= -1) return { move: 'HIT', text: 'Count is down: hit 13 vs 2.' };
  if (p === 12 && u === 4 && tc < 0) return { move: 'HIT', text: 'Count is down: hit 12 vs 4.' };
  if (p === 10 && u === 10 && two && tc >= 4) return { move: 'DOUBLE', text: 'Count is very high: double 10 vs 10.' };
  if (p === 11 && u === 11 && two && tc >= 1) return { move: 'DOUBLE', text: 'Count is up: double 11 vs ace.' };
  if (p === 9 && u === 2 && two && tc >= 1) return { move: 'DOUBLE', text: 'Count is up: double 9 vs 2.' };
  if (p === 9 && u === 7 && two && tc >= 3) return { move: 'DOUBLE', text: 'Count is high: double 9 vs 7.' };
  return null;
}

/** The book move for the Cheat Sheet, from the same chart the simulator uses. */
export function bookMove(t: TableState): Move | null {
  const r = t.round;
  if (!r || r.phase !== 'play' || r.result || r.sitOut) return null;
  return playerAction(r.player, r.dealer[0], canDouble(t));
}
