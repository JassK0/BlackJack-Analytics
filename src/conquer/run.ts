// Count & Conquer: one run across three cities, plus the local leaderboard
import type { Rank } from '../engine/types';
import { buildShoe, HILO } from '../engine/cards';
import { CITIES, PRICE, RELICS, RELIC_IDS, type NodeType, type Rarity, type RelicId } from './data';
import {
  casinoFor, cleanSeed, generateMap, openTable, shuffled, stream,
  type ActMap, type CasinoSpec, type EndReason, type MapNode, type TableState,
} from './engine';
import { EVENTS, EVENT_IDS, type EventId } from './events';

export const START_BANKROLL = 1000;
export const MAX_STARS = 3;
export const MAX_FOCUS_CAP = 6;
/** Money in events and shops scales with the city, since the stakes do. */
export const ACT_SCALE = [1, 2, 4];
export const scale = (run: RunState) => ACT_SCALE[run.act - 1];

export type Screen = 'map' | 'table' | 'reward' | 'shop' | 'event' | 'motel' | 'act' | 'retry' | 'end';
export interface Reward { title: string; relics: RelicId[]; cash: number; tier: CasinoSpec['tier']; skipCash: number }
export type ShopKind = 'relic' | 'fake_id' | 'tapes' | 'espresso';
export interface ShopItem { id: string; kind: ShopKind; relic?: RelicId; price: number; sold: boolean }
export interface RunStats {
  tables: number; cleared: number; bosses: number; hands: number; hot: number;
  checksRight: number; checksTotal: number; backedOff: number; peakBank: number; bestHand: number;
}
export interface Visit { node: string; name: string; type: NodeType; act: number; cleared?: boolean; net?: number; hot?: number; target?: number; reason?: EndReason }
export interface EventState { id: EventId; node: string; outcome: string | null; drill?: { cards: Rank[]; options: number[]; answer: number; stake: number } }
export interface RunEnd { won: boolean; reason: string; score: number }

export interface RunState {
  v: 1; seed: string; seedLabel: string; assisted: boolean; daily: boolean; startedAt: number;
  act: number; map: ActMap; at: string | null; visited: string[];
  bankroll: number; relics: RelicId[]; notoriety: number; focus: number; maxFocus: number;
  screen: Screen; table: TableState | null; reward: Reward | null; shop: ShopItem[] | null; event: EventState | null;
  seenEvents: EventId[]; stats: RunStats; history: Visit[]; motelDone: boolean; partnerBonus: number;
  /** Second nights at the current boss. */
  bossTries: number;
  end: RunEnd | null;
}

const has = (run: RunState, r: RelicId) => run.relics.includes(r);
const round10 = (x: number) => Math.round(x / 10) * 10;

export function newRun(seedRaw: string, assisted: boolean, daily = false): RunState {
  const seed = cleanSeed(seedRaw) || 'LUCKY';
  // show the seed the way it was typed (or generated); the cleaned form drives the randomness
  const label = seedRaw.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 14) || seed;
  return {
    v: 1, seed, seedLabel: label, assisted, daily, startedAt: Date.now(),
    act: 1, map: generateMap(seed, 1), at: null, visited: [],
    bankroll: START_BANKROLL, relics: [], notoriety: 0, focus: 1, maxFocus: 3,
    screen: 'map', table: null, reward: null, shop: null, event: null,
    seenEvents: [], stats: { tables: 0, cleared: 0, bosses: 0, hands: 0, hot: 0, checksRight: 0, checksTotal: 0, backedOff: 0, peakBank: START_BANKROLL, bestHand: 0 },
    history: [], motelDone: false, partnerBonus: 0, bossTries: 0, end: null,
  };
}

export const nodeById = (run: RunState, id: string) => run.map.nodes.find((n) => n.id === id) ?? null;
export function reachable(run: RunState): MapNode[] {
  if (run.screen !== 'map') return [];
  if (!run.at) return run.map.nodes.filter((n) => n.row === 0);
  const here = nodeById(run, run.at);
  return here ? here.next.map((id) => nodeById(run, id)!).filter(Boolean) : [];
}
export function specFor(run: RunState, node: MapNode): CasinoSpec {
  const spec = casinoFor(run.seed, node);
  // a second night at the boss deals from different shoes
  return node.type === 'boss' && run.bossTries ? { ...spec, id: `${spec.id}#${run.bossTries}` } : spec;
}
export const isTable = (t: NodeType) => t === 'casino' || t === 'elite' || t === 'boss';
/** You need enough for a few minimum bets to be allowed to sit down. */
export const buyIn = (spec: CasinoSpec) => spec.minBet * 3;

export function enterNode(run: RunState, id: string): RunState {
  const node = reachable(run).find((n) => n.id === id);
  if (!node) return run;
  const base: RunState = { ...run, at: id, visited: [...run.visited, id] };
  if (isTable(node.type)) {
    const spec = specFor(run, node);
    return {
      ...base, screen: 'table',
      table: openTable(run.seed, spec, { bankroll: run.bankroll, relics: run.relics, notoriety: run.notoriety, focus: run.focus, maxFocus: run.maxFocus, assisted: run.assisted }),
    };
  }
  if (node.type === 'shop') return { ...base, screen: 'shop', shop: makeShop(run, node) };
  if (node.type === 'motel') return { ...base, screen: 'motel', motelDone: false };
  const rng = stream(run.seed, `event:${node.id}`);
  const fresh = EVENT_IDS.filter((e) => !run.seenEvents.includes(e));
  const id2 = shuffled(rng, fresh.length ? fresh : EVENT_IDS)[0];
  return { ...base, screen: 'event', event: { id: id2, node: node.id, outcome: null }, seenEvents: [...run.seenEvents, id2] };
}

export function updateTable(run: RunState, fn: (t: TableState) => TableState): RunState {
  if (!run.table) return run;
  const t = fn(run.table);
  if (t === run.table) return run;
  return { ...run, table: t, stats: { ...run.stats, peakBank: Math.max(run.stats.peakBank, t.bankroll) } };
}

function relicChoices(run: RunState, label: string, weights: Record<Rarity, number>, n = 3): RelicId[] {
  const rng = stream(run.seed, label);
  const pool = RELIC_IDS.filter((r) => !has(run, r));
  const out: RelicId[] = [];
  while (out.length < n && out.length < pool.length) {
    const left = pool.filter((r) => !out.includes(r));
    const tot = left.reduce((a, r) => a + weights[RELICS[r].rarity], 0);
    if (tot <= 0) { out.push(left[Math.floor(rng() * left.length)]); continue; }
    let x = rng() * tot;
    for (const r of left) { x -= weights[RELICS[r].rarity]; if (x <= 0) { out.push(r); break; } }
  }
  return out;
}

const endRun = (run: RunState, won: boolean, reason: string): RunState => {
  const r = { ...run, screen: 'end' as const, table: null, reward: null, shop: null, event: null };
  return { ...r, end: { won, reason, score: scoreOf(r, won) } };
};

/** Called when the player leaves a finished table. */
export function finishTable(run: RunState): RunState {
  const t = run.table;
  if (!t || !t.over) return run;
  const node = nodeById(run, run.at!)!;
  const spec = t.spec;
  const cleared = t.over.cleared;
  const stats: RunStats = {
    ...run.stats, tables: run.stats.tables + 1, cleared: run.stats.cleared + (cleared ? 1 : 0), bosses: run.stats.bosses + (cleared && spec.tier === 'boss' ? 1 : 0),
    hands: run.stats.hands + t.hands, hot: run.stats.hot + Math.max(0, t.hot), checksRight: run.stats.checksRight + t.checksRight,
    checksTotal: run.stats.checksTotal + t.checksTotal, backedOff: run.stats.backedOff + (t.over.reason === 'backed_off' ? 1 : 0),
    bestHand: Math.max(run.stats.bestHand, t.biggestWin), peakBank: Math.max(run.stats.peakBank, t.bankroll),
  };
  const visit: Visit = { node: node.id, name: spec.name, type: node.type, act: run.act, cleared, net: t.net, hot: t.hot, target: spec.target, reason: t.over.reason };
  let next: RunState = {
    ...run, table: null, bankroll: t.bankroll, focus: t.focus, notoriety: run.notoriety + (t.over.reason === 'backed_off' ? 1 : 0),
    stats, history: [...run.history, visit],
  };
  if (next.notoriety >= MAX_STARS) return endRun(next, false, 'Blacklisted. Every casino in the state has your photo now.');
  if (spec.tier === 'boss' && !cleared) {
    if (next.bankroll < CITIES[run.act - 1].minBet) return endRun(next, false, `The job at ${spec.name} fell through, and so did your bankroll.`);
    return { ...next, screen: 'retry' };
  }
  if (next.bankroll < CITIES[run.act - 1].minBet) return endRun(next, false, 'Out of money. Even the slot machines won\'t look at you.');
  if (!cleared) return { ...next, screen: 'map' };
  const weights: Record<Rarity, number> = spec.tier === 'boss' ? { common: 0, uncommon: 40, rare: 60 }
    : spec.tier === 'elite' ? { common: 15, uncommon: 55, rare: 30 } : { common: 60, uncommon: 32, rare: 8 };
  const cash = spec.tier === 'boss' ? [500, 1000, 2000][run.act - 1] : round10(spec.target * 1.2);
  next = {
    ...next, screen: 'reward',
    reward: { title: spec.name, tier: spec.tier, cash, relics: spec.tier === 'boss' && run.act === 3 ? [] : relicChoices(next, `reward:${node.id}`, weights), skipCash: round10(40 * scale(run)) },
  };
  return next;
}

export function takeReward(run: RunState, relic: RelicId | null): RunState {
  const rw = run.reward;
  if (!rw || run.screen !== 'reward') return run;
  const relics = relic && rw.relics.includes(relic) ? [...run.relics, relic] : run.relics;
  const bankroll = run.bankroll + rw.cash + (relic ? 0 : rw.relics.length ? rw.skipCash : 0);
  const next: RunState = { ...run, relics, bankroll, reward: null };
  if (rw.tier !== 'boss') return { ...next, screen: 'map' };
  if (run.act === 3) return endRun(next, true, 'You beat the Syndicate. The cleanest counting run anyone has ever seen.');
  const bonus = has(next, 'partner') ? Math.round(next.bankroll * 0.25) : 0;
  return { ...next, bankroll: next.bankroll + bonus, partnerBonus: bonus, screen: 'act' };
}

/** What a second night at the boss costs. */
export const retryCost = (run: RunState) => Math.floor(run.bankroll * 0.5);
export const canRetry = (run: RunState) => run.notoriety + 1 < MAX_STARS && run.bankroll - retryCost(run) >= CITIES[run.act - 1].minBet * 3;
export function retryBoss(run: RunState, again: boolean): RunState {
  if (run.screen !== 'retry') return run;
  const node = nodeById(run, run.at!)!;
  if (!again || !canRetry(run)) return endRun(run, false, `The job at ${casinoFor(run.seed, node).name} fell through. Your crew cuts you loose.`);
  const next: RunState = { ...run, bankroll: run.bankroll - retryCost(run), notoriety: run.notoriety + 1, bossTries: run.bossTries + 1 };
  const spec = specFor(next, node);
  return {
    ...next, screen: 'table',
    table: openTable(run.seed, spec, { bankroll: next.bankroll, relics: next.relics, notoriety: next.notoriety, focus: next.focus, maxFocus: next.maxFocus, assisted: next.assisted }),
  };
}

export function nextAct(run: RunState): RunState {
  if (run.screen !== 'act') return run;
  const act = run.act + 1;
  return { ...run, act, map: generateMap(run.seed, act), at: null, screen: 'map', partnerBonus: 0, bossTries: 0 };
}

// ----------------------------------------------------------------- shop

function makeShop(run: RunState, node: MapNode): ShopItem[] {
  const m = scale(run);
  const mult = [1, 1.6, 2.4][run.act - 1];
  const relics = relicChoices(run, `shop:${node.id}`, { common: 50, uncommon: 35, rare: 15 });
  return [
    ...relics.map((r) => ({ id: r, kind: 'relic' as const, relic: r, price: round10(PRICE[RELICS[r].rarity] * mult), sold: false })),
    { id: 'fake_id', kind: 'fake_id', price: 150 * m, sold: false },
    { id: 'tapes', kind: 'tapes', price: 100 * m, sold: false },
    { id: 'espresso', kind: 'espresso', price: 30 * m, sold: false },
  ];
}
export const SHOP_TEXT: Record<Exclude<ShopKind, 'relic'>, { name: string; text: string }> = {
  fake_id: { name: 'Fake ID', text: 'A new name. Removes one notoriety star.' },
  tapes: { name: 'Count Drill Tapes', text: 'Practise all night. +1 maximum Focus.' },
  espresso: { name: 'Triple Espresso', text: 'Refills your Focus to the maximum.' },
};
export function canBuy(run: RunState, item: ShopItem): boolean {
  if (item.sold || run.bankroll < item.price) return false;
  if (item.kind === 'fake_id') return run.notoriety > 0;
  if (item.kind === 'tapes') return run.maxFocus < MAX_FOCUS_CAP;
  if (item.kind === 'espresso') return run.focus < run.maxFocus;
  return !has(run, item.relic!);
}
export function buy(run: RunState, id: string): RunState {
  const item = run.shop?.find((i) => i.id === id);
  if (!item || !canBuy(run, item)) return run;
  let next: RunState = { ...run, bankroll: run.bankroll - item.price, shop: run.shop!.map((i) => (i.id === id ? { ...i, sold: true } : i)) };
  if (item.kind === 'relic') next = { ...next, relics: [...next.relics, item.relic!] };
  if (item.kind === 'fake_id') next = { ...next, notoriety: next.notoriety - 1 };
  if (item.kind === 'tapes') next = { ...next, maxFocus: next.maxFocus + 1, focus: next.focus + 1 };
  if (item.kind === 'espresso') next = { ...next, focus: next.maxFocus };
  return next;
}
export const leaveShop = (run: RunState): RunState => (run.screen === 'shop' ? { ...run, shop: null, screen: 'map' } : run);

// ---------------------------------------------------------------- motel

export type MotelChoice = 'sleep' | 'drill' | 'nightshift';
export const MOTEL: Record<MotelChoice, { name: string; text: (run: RunState) => string }> = {
  sleep: { name: 'Sleep it off', text: (r) => (r.notoriety ? 'Lie low for a night. Removes one notoriety star.' : 'A quiet night. Refills your Focus.') },
  drill: { name: 'Drill until dawn', text: () => 'Count down a deck a hundred times. +1 maximum Focus.' },
  nightshift: { name: 'Night shift', text: (r) => `Deal cards at an illegal home game. +$${100 * scale(r)}.` },
};
export function motel(run: RunState, choice: MotelChoice): RunState {
  if (run.screen !== 'motel' || run.motelDone) return run;
  let next: RunState = { ...run, motelDone: true };
  if (choice === 'sleep') next = run.notoriety ? { ...next, notoriety: run.notoriety - 1 } : { ...next, focus: run.maxFocus };
  if (choice === 'drill') next = { ...next, maxFocus: Math.min(MAX_FOCUS_CAP, run.maxFocus + 1), focus: Math.min(MAX_FOCUS_CAP, run.focus + 1) };
  if (choice === 'nightshift') next = { ...next, bankroll: run.bankroll + 100 * scale(run) };
  return next;
}
export const leaveMotel = (run: RunState): RunState => (run.screen === 'motel' ? { ...run, screen: 'map' } : run);

// --------------------------------------------------------------- events

export function chooseEvent(run: RunState, option: number): RunState {
  const ev = run.event;
  if (!ev || ev.outcome || run.screen !== 'event') return run;
  const def = EVENTS[ev.id];
  const opts = def.options(run);
  if (!opts[option] || opts[option].disabled) return run;
  const rng = stream(run.seed, `event-roll:${ev.node}:${option}`);
  const res = def.resolve(run, option, rng);
  if (res.drill) {
    // the bar bet: deal ten cards from a fresh deck and ask for the running count
    const deck = buildShoe(1, stream(run.seed, `drill:${ev.node}`));
    const cards = deck.slice(0, 10);
    const answer = cards.reduce((a, c) => a + HILO[c], 0);
    const set = new Set([answer]);
    while (set.size < 4) set.add(answer + (Math.floor(rng() * 7) - 3 || 2));
    return { ...res.run, event: { ...ev, drill: { cards, answer, options: [...set].sort((a, b) => a - b), stake: res.drill } } };
  }
  return { ...res.run, event: { ...ev, outcome: res.text } };
}
export function answerDrill(run: RunState, value: number): RunState {
  const ev = run.event;
  if (!ev?.drill || ev.outcome) return run;
  const right = value === ev.drill.answer;
  const s = ev.drill.stake;
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  return {
    ...run, bankroll: Math.max(0, run.bankroll + (right ? s : -s)), focus: right ? Math.min(run.maxFocus, run.focus + 1) : run.focus,
    event: { ...ev, outcome: right ? `"${sign(value)}." He stares, then slides $${s} across the bar. +1 Focus.` : `It was ${sign(ev.drill.answer)}. He pockets your $${s} with a grin.` },
  };
}
export function leaveEvent(run: RunState): RunState {
  if (run.screen !== 'event' || !run.event?.outcome) return run;
  const next = { ...run, event: null, screen: 'map' as const };
  if (next.notoriety >= MAX_STARS) return endRun(next, false, 'Blacklisted. Every casino in the state has your photo now.');
  if (next.bankroll < CITIES[next.act - 1].minBet) return endRun(next, false, 'Out of money. Even the slot machines won\'t look at you.');
  return next;
}

// -------------------------------------------------------------- scoring

export function scoreOf(run: RunState, won: boolean): number {
  const s = run.bankroll + 150 * run.stats.cleared + 750 * run.stats.bosses + (won ? 3000 : 0) - 200 * run.notoriety;
  return Math.max(0, Math.round(s * (run.assisted ? 0.5 : 1)));
}
export const progressLabel = (run: RunState) => `${CITIES[run.act - 1].name}${run.end?.won ? ' · beat the game' : ''}`;

// -------------------------------------------------------------- storage

export interface BoardEntry {
  seed: string; seedLabel?: string; score: number; won: boolean; act: number; bosses: number; cleared: number; bankroll: number;
  assisted: boolean; daily: boolean; date: string; relics: number; reason: string;
}
const RUN_KEY = 'bja.conquer.run';
const BOARD_KEY = 'bja.conquer.board';
const SETTINGS_KEY = 'bja.conquer.settings';
export interface ConquerSettings { sound: boolean; speed: 1 | 2 | 3; assisted: boolean; seenHowTo: boolean }
export const DEFAULT_SETTINGS: ConquerSettings = { sound: false, speed: 1, assisted: false, seenHowTo: false };

function read<T>(key: string): T | null {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
}
function write(key: string, v: unknown) {
  try { if (v == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage full or blocked */ }
}
export const loadRun = (): RunState | null => { const r = read<RunState>(RUN_KEY); return r && r.v === 1 && r.map ? { ...r, seedLabel: r.seedLabel ?? r.seed } : null; };
export const saveRun = (run: RunState | null) => write(RUN_KEY, run);
export const loadBoard = (): BoardEntry[] => read<BoardEntry[]>(BOARD_KEY) ?? [];
export const loadSettings = (): ConquerSettings => ({ ...DEFAULT_SETTINGS, ...(read<Partial<ConquerSettings>>(SETTINGS_KEY) ?? {}) });
export const saveSettings = (s: ConquerSettings) => write(SETTINGS_KEY, s);

/** Adds a finished run to the board and returns its rank (1-based), or 0 if it didn't place. */
export function recordRun(run: RunState): { board: BoardEntry[]; rank: number } {
  const board = loadBoard();
  if (!run.end) return { board, rank: 0 };
  const entry: BoardEntry = {
    seed: run.seed, seedLabel: run.seedLabel, score: run.end.score, won: run.end.won, act: run.act, bosses: run.stats.bosses, cleared: run.stats.cleared,
    bankroll: run.bankroll, assisted: run.assisted, daily: run.daily, date: new Date().toISOString().slice(0, 10), relics: run.relics.length, reason: run.end.reason,
  };
  const all = [...board, entry].sort((a, b) => b.score - a.score).slice(0, 25);
  write(BOARD_KEY, all);
  return { board: all, rank: all.indexOf(entry) + 1 };
}
export const clearBoard = () => write(BOARD_KEY, null);

export function dailySeed(date = new Date()): string {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  return `DAY${String(y).slice(2)}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;
}
