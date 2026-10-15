// Twenty-One Stakes: the run (tables, cash-out, shop, packs, consumables), and the local leaderboard
import {
  CHARMS, CHARM_IDS, COCKTAILS, FRAGILE, COCKTAIL_IDS, ENH_INFO, FORTUNES, FORTUNE_IDS, HAND_ORDER, PACKS, RANKS, STAGE_INFO, SUITS, TAG_IDS,
  VOUCHER_COST, VOUCHER_IDS, WIN_ANTE,
  type CharmId, type CocktailId, type Consumable, type Enh, type FortuneId, type HandType, type PackKind, type PCard, type Rarity, type TagId,
} from './data';
import {
  activeHand, cleanSeed, changeCards, destroyCards, openTable, pickOne, settleAuto, shuffle, stageOf, standardDeck, stream,
  type Cashout, type CharmInst, type RunState, type ShopItem,
} from './engine';

export const START_MONEY = 4;
export const CHARM_SLOTS = 5;
export const CONS_SLOTS = 2;

export function newRun(seedRaw: string, daily = false): RunState {
  const seed = cleanSeed(seedRaw) || 'STAKES';
  const levels = Object.fromEntries(HAND_ORDER.map((h) => [h, 1])) as Record<HandType, number>;
  return {
    v: 1, seed, seedLabel: seedRaw.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 14) || seed, daily, startedAt: Date.now(),
    ante: 1, stage: 0, bosses: {}, endless: false,
    money: START_MONEY, deck: standardDeck(1), nextUid: 100,
    charms: [], charmSlots: CHARM_SLOTS, cons: [], consSlots: CONS_SLOTS,
    vouchers: [], voucherAnte: 0, levels, played: {} as Record<HandType, number>,
    baseHands: 5, baseRedraws: 3, tags: [], handTag: 0, freeCharm: false, freeRare: false,
    screen: 'select', table: null, cashout: null, shop: null, pack: null,
    stats: { bestHand: 0, bestType: null, hands: 0, wins: 0, blackjacks: 0, tablesWon: 0, total: 0 },
    end: null,
  };
}
const uid = (run: RunState) => { run.nextUid += 1; return run.nextUid; };
const clone = (run: RunState): RunState => ({ ...run, charms: run.charms.map((c) => ({ ...c })), cons: [...run.cons], deck: [...run.deck] });

// ------------------------------------------------------------ table select

/** The tag you'd get for skipping this table, shown before you decide. */
export const tagFor = (run: RunState, ante: number, stage: number): TagId => pickOne(stream(run.seed, `tag:${ante}:${stage}`), TAG_IDS);
export const canSkip = (run: RunState) => run.screen === 'select' && run.stage < 2;
export const playTable = (run: RunState): RunState => (run.screen === 'select' ? openTable(run) : run);

export function skipTable(run0: RunState): RunState {
  if (!canSkip(run0)) return run0;
  const run = clone(run0);
  const tag = tagFor(run, run.ante, run.stage);
  run.tags = [...run.tags, tag];
  run.stage += 1;
  if (tag === 'rich_tag') run.money += 15;
  if (tag === 'hand_tag') run.handTag += 1;
  if (tag === 'charm_tag') run.freeCharm = true;
  if (tag === 'rare_tag') run.freeRare = true;
  if (tag === 'cocktail_tag') return openPack(run, 'cocktail', 'select');
  if (tag === 'fortune_tag') return openPack(run, 'fortune', 'select');
  return run;
}

// ----------------------------------------------------------------- cash out

export const interestCap = (run: RunState) => (run.vouchers.includes('savings_bond') ? 10 : 5);
export function leaveTable(run0: RunState): RunState {
  const t = run0.table;
  if (!t?.over || (t.round && t.round.phase !== 'done')) return run0;
  const run = clone(run0);
  if (!t.over.won) return endRun(run, false, `Busted out at ${STAGE_INFO[t.stage].name}, ante ${t.ante}: ${t.score.toLocaleString('en-US')} of ${t.target.toLocaleString('en-US')} chips.`);
  const extra: Cashout['extra'] = [];
  if (run.charms.some((c) => c.id === 'piggy_bank')) extra.push({ label: 'Piggy Bank', amount: 3 });
  const reward = STAGE_INFO[t.stage].reward;
  const hands = t.handsLeft;
  // scaling charms grow, fragile ones may break
  const notes: string[] = [];
  run.charms = run.charms.flatMap((c) => {
    if (c.id === 'compounder') return [{ ...c, counter: c.counter + 1 }];
    const odds = FRAGILE[c.id];
    if (odds && stream(run.seed, `fragile:${t.ante}:${t.stage}:${c.uid}`)() < odds) { notes.push(`${CHARMS[c.id].name} broke.`); return []; }
    return [c];
  });
  const interest = Math.min(interestCap(run), Math.floor(run.money / 5));
  run.cashout = { reward, hands, interest, extra, notes, total: reward + hands + interest + extra.reduce((a, e) => a + e.amount, 0) };
  run.screen = 'cashout';
  run.stats = { ...run.stats, tablesWon: run.stats.tablesWon + 1 };
  return run;
}

export function collect(run0: RunState): RunState {
  if (run0.screen !== 'cashout' || !run0.cashout) return run0;
  const run = clone(run0);
  run.money += run.cashout!.total;
  run.cashout = null;
  const wasBoss = run.stage === 2;
  run.table = null;
  if (wasBoss && run.ante === WIN_ANTE && !run.endless) { run.screen = 'won'; return run; }
  if (wasBoss) { run.ante += 1; run.stage = 0; } else run.stage += 1;
  return openShop(run);
}
export function goEndless(run: RunState): RunState {
  if (run.screen !== 'won') return run;
  return openShop({ ...run, endless: true, ante: run.ante + 1, stage: 0 });
}
export function endRun(run: RunState, won: boolean, reason: string): RunState {
  return { ...run, screen: 'end', end: { won, reason }, table: null, shop: null, pack: null, cashout: null };
}
export function cashIn(run: RunState): RunState {
  if (run.screen !== 'won') return run;
  return endRun(run, true, `You beat The House. Ante ${run.ante} cleared with ${run.charms.length} charms.`);
}

// ---------------------------------------------------------------------- shop

const price = (run: RunState, base: number) => (run.vouchers.includes('comp_points') ? Math.max(1, Math.floor(base * 0.75)) : base);
export const rerollCost = (run: RunState) => Math.max(0, 5 - (run.vouchers.includes('house_rules') ? 2 : 0) + (run.shop?.rerolls ?? 0));
const RARITY_W: Record<Rarity, number> = { common: 70, uncommon: 25, rare: 5 };

function rollCharm(run: RunState, rng: () => number, exclude: Set<string>, rarity?: Rarity): CharmId | null {
  const owned = new Set(run.charms.map((c) => c.id));
  const pool = CHARM_IDS.filter((id) => !owned.has(id) && !exclude.has(id) && (!rarity || CHARMS[id].rarity === rarity));
  if (!pool.length) return null;
  const tot = pool.reduce((a, id) => a + RARITY_W[CHARMS[id].rarity], 0);
  let x = rng() * tot;
  for (const id of pool) { x -= RARITY_W[CHARMS[id].rarity]; if (x <= 0) return id; }
  return pool[pool.length - 1];
}
const rollCocktail = (rng: () => number): CocktailId => (rng() < 0.05 ? 'black_russian' : pickOne(rng, COCKTAIL_IDS.filter((c) => c !== 'black_russian')));
const rollFortune = (rng: () => number): FortuneId => pickOne(rng, FORTUNE_IDS);

function rollItems(run: RunState, label: string): ShopItem[] {
  const rng = stream(run.seed, label);
  const n = 2 + (run.vouchers.includes('overstock') ? 1 : 0);
  const items: ShopItem[] = [];
  const seen = new Set<string>();
  for (let slot = 0; slot < n; slot++) {
    const r = rng();
    if (r < 0.65) {
      const id = rollCharm(run, rng, seen);
      if (id) { seen.add(id); items.push({ slot, kind: 'charm', id, price: price(run, CHARMS[id].cost), sold: false }); continue; }
    }
    if (r < 0.9) items.push({ slot, kind: 'cocktail', id: rollCocktail(rng), price: price(run, 3), sold: false });
    else items.push({ slot, kind: 'fortune', id: rollFortune(rng), price: price(run, 3), sold: false });
  }
  return items;
}

export function openShop(run0: RunState): RunState {
  const run = clone(run0);
  const label = `shop:${run.ante}:${run.stage}`;
  const items = rollItems(run, `${label}:0`);
  if (run.freeRare) {
    const id = rollCharm(run, stream(run.seed, `${label}:rare`), new Set(items.map((i) => i.id)), 'rare');
    if (id) items.unshift({ slot: -1, kind: 'charm', id, price: 0, sold: false });
    run.freeRare = false;
  }
  if (run.freeCharm) {
    const first = items.find((i) => i.kind === 'charm' && i.price > 0);
    if (first) first.price = 0;
    run.freeCharm = false;
  }
  const prng = stream(run.seed, `${label}:packs`);
  const kinds: PackKind[] = ['cocktail', 'fortune', 'charm', 'standard'];
  const packs = [pickOne(prng, kinds), pickOne(prng, kinds)].map((kind) => ({ kind, price: price(run, PACKS[kind].cost), sold: false }));
  // one voucher per ante: once you buy it, the rest of the ante's shops have none
  const vpool = VOUCHER_IDS.filter((v) => !run.vouchers.includes(v));
  const voucher = vpool.length && run.voucherAnte !== run.ante ? pickOne(stream(run.seed, `voucher:${run.ante}`), vpool) : null;
  run.shop = { items, packs, voucher, voucherSold: false, rerolls: 0 };
  run.screen = 'shop';
  return run;
}

export function reroll(run0: RunState): RunState {
  const s = run0.shop;
  if (!s || run0.money < rerollCost(run0)) return run0;
  const run = clone(run0);
  run.money -= rerollCost(run0);
  run.shop = { ...s, rerolls: s.rerolls + 1, items: rollItems(run, `shop:${run.ante}:${run.stage}:${s.rerolls + 1}`) };
  return run;
}

export const charmRoom = (run: RunState) => run.charms.length < run.charmSlots;
export const consRoom = (run: RunState) => run.cons.length < run.consSlots;
export function canBuy(run: RunState, item: ShopItem) {
  if (item.sold || run.money < item.price) return false;
  return item.kind === 'charm' ? charmRoom(run) : consRoom(run);
}
export function buy(run0: RunState, slot: number): RunState {
  const item = run0.shop?.items.find((i) => i.slot === slot);
  if (!item || !canBuy(run0, item)) return run0;
  const run = clone(run0);
  run.money -= item.price;
  run.shop = { ...run.shop!, items: run.shop!.items.map((i) => (i.slot === slot ? { ...i, sold: true } : i)) };
  if (item.kind === 'charm') run.charms = [...run.charms, { uid: uid(run), id: item.id as CharmId, counter: 0 }];
  else run.cons = [...run.cons, item.kind === 'cocktail' ? { kind: 'cocktail', id: item.id as CocktailId, uid: uid(run) } : { kind: 'fortune', id: item.id as FortuneId, uid: uid(run) }];
  return run;
}
export function buyVoucher(run0: RunState): RunState {
  const s = run0.shop;
  const cost = price(run0, VOUCHER_COST);
  if (!s?.voucher || s.voucherSold || run0.money < cost) return run0;
  const run = clone(run0);
  run.money -= cost;
  run.vouchers = [...run.vouchers, s.voucher];
  run.voucherAnte = run.ante;
  if (s.voucher === 'vip_lounge') run.charmSlots += 1;
  if (s.voucher === 'coat_check') run.consSlots += 1;
  run.shop = { ...s, voucherSold: true };
  return run;
}
export function buyPack(run0: RunState, i: number): RunState {
  const p = run0.shop?.packs[i];
  if (!p || p.sold || run0.money < p.price) return run0;
  const run = clone(run0);
  run.money -= p.price;
  run.shop = { ...run.shop!, packs: run.shop!.packs.map((x, j) => (j === i ? { ...x, sold: true } : x)) };
  return openPack(run, p.kind, 'shop', i);
}
export const sellValue = (c: CharmInst) => Math.max(1, Math.floor(CHARMS[c.id].cost / 2));
export function sellCharm(run0: RunState, u: number): RunState {
  const c = run0.charms.find((x) => x.uid === u);
  if (!c) return run0;
  return { ...run0, money: run0.money + sellValue(c), charms: run0.charms.filter((x) => x.uid !== u) };
}
export function sellCons(run0: RunState, u: number): RunState {
  if (!run0.cons.some((x) => x.uid === u)) return run0;
  return { ...run0, money: run0.money + 1, cons: run0.cons.filter((x) => x.uid !== u) };
}
export function moveCharm(run0: RunState, u: number, dir: -1 | 1): RunState {
  const i = run0.charms.findIndex((c) => c.uid === u), j = i + dir;
  if (i < 0 || j < 0 || j >= run0.charms.length) return run0;
  const charms = [...run0.charms];
  [charms[i], charms[j]] = [charms[j], charms[i]];
  return { ...run0, charms };
}
export const leaveShop = (run: RunState): RunState => (run.screen === 'shop' ? { ...run, shop: null, screen: 'select' } : run);

// --------------------------------------------------------------------- packs

const ENHS: Enh[] = ['bonus', 'gold', 'glass', 'lucky', 'wild', 'stone'];
export function openPack(run0: RunState, kind: PackKind, from: 'shop' | 'select', n = 0): RunState {
  const run = clone(run0);
  const rng = stream(run.seed, `pack:${run.ante}:${run.stage}:${from}:${n}:${run.shop?.rerolls ?? 0}:${kind}`);
  let options: string[] = [];
  let cards: PCard[] = [];
  if (kind === 'cocktail') options = [rollCocktail(rng), rollCocktail(rng), rollCocktail(rng)];
  if (kind === 'fortune') {
    const pool = shuffle(rng, FORTUNE_IDS);
    options = pool.slice(0, 3);
    cards = shuffle(rng, run.deck).slice(0, 6);
  }
  if (kind === 'charm') {
    const seen = new Set<string>();
    for (let i = 0; i < 2; i++) { const id = rollCharm(run, rng, seen); if (id) { seen.add(id); options.push(id); } }
  }
  if (kind === 'standard') {
    for (let i = 0; i < 3; i++) {
      const c: PCard = { uid: uid(run), rank: pickOne(rng, RANKS), suit: pickOne(rng, SUITS) };
      if (rng() < 0.35) c.enh = pickOne(rng, ENHS);
      cards.push(c);
      options.push(String(c.uid));
    }
  }
  run.pack = { kind, options, cards, picks: 1, from, pending: null, done: false };
  run.screen = 'pack';
  return run;
}

function closePack(run: RunState): RunState {
  const from = run.pack!.from;
  return { ...run, pack: null, screen: from === 'shop' ? 'shop' : 'select' };
}
export const skipPack = (run: RunState): RunState => (run.pack ? closePack(run) : run);

export function choosePack(run0: RunState, option: number): RunState {
  const p = run0.pack;
  if (!p || p.pending) return run0;
  const id = p.options[option];
  if (!id) return run0;
  let run = clone(run0);
  if (p.kind === 'cocktail') run = drink(run, id as CocktailId);
  else if (p.kind === 'charm') {
    if (!charmRoom(run)) return run0;
    run.charms = [...run.charms, { uid: uid(run), id: id as CharmId, counter: 0 }];
  } else if (p.kind === 'standard') {
    const card = p.cards.find((c) => String(c.uid) === id);
    if (card) run.deck = [...run.deck, card];
  } else if (p.kind === 'fortune') {
    const f = FORTUNES[id as FortuneId];
    if (f.pick) { run.pack = { ...p, pending: id }; return run; }
    run = applyFortune(run, id as FortuneId, []);
  }
  return closePack(run);
}
/** Finish a fortune chosen from a pack, on cards shown in the pack. */
export function packFortune(run0: RunState, uids: number[]): RunState {
  const p = run0.pack;
  if (!p?.pending) return run0;
  const f = FORTUNES[p.pending as FortuneId];
  if (uids.length < f.need || uids.length > f.pick || !uids.every((u) => p.cards.some((c) => c.uid === u))) return run0;
  return closePack(applyFortune(clone(run0), p.pending as FortuneId, uids));
}

// --------------------------------------------------------------- consumables

export function drink(run0: RunState, id: CocktailId): RunState {
  const run = { ...run0, levels: { ...run0.levels } };
  const hand = COCKTAILS[id].hand;
  for (const h of hand === 'all' ? HAND_ORDER : [hand]) run.levels[h] = (run.levels[h] ?? 1) + 1;
  return run;
}
/** Can this consumable be used right now? Card fortunes need a hand in play to pick from. */
export function consUsable(run: RunState, c: Consumable): { ok: boolean; why?: string } {
  if (c.kind === 'cocktail') return { ok: true };
  const f = FORTUNES[c.id];
  if (c.id === 'patron' && !charmRoom(run)) return { ok: false, why: 'No room for another charm.' };
  if (!f.pick) return { ok: true };
  const h = activeHand(run);
  if (!h) return { ok: false, why: 'Use it at the table on cards in your hand.' };
  if (h.cards.length < f.need) return { ok: false, why: `Needs ${f.need} cards in your hand.` };
  return { ok: true };
}
export function useCons(run0: RunState, u: number, targets: number[] = []): RunState {
  const c = run0.cons.find((x) => x.uid === u);
  if (!c || !consUsable(run0, c).ok) return run0;
  let run: RunState = { ...clone(run0), cons: run0.cons.filter((x) => x.uid !== u) };
  if (c.kind === 'cocktail') return drink(run, c.id);
  const f = FORTUNES[c.id];
  if (f.pick) {
    const h = activeHand(run0)!;
    if (targets.length < f.need || targets.length > f.pick || !targets.every((t) => h.cards.some((x) => x.uid === t))) return run0;
  }
  run = applyFortune(run, c.id, targets);
  // a fortune can change your total mid-hand: keep the hand legal, then re-check for 21 or a bust
  if (run.table?.round?.phase === 'play') {
    const r = run.table.round;
    const h = r.hands[r.active];
    while (h && h.cards.length < 2 && run.table.deck.length + run.table.discard.length > 0) {
      if (!run.table.deck.length) { run.table.deck = shuffle(stream(run.seed, `refill:${run.nextUid}`), run.table.discard); run.table.discard = []; }
      h.cards.push(run.table.deck.pop()!);
    }
    run = settleAuto(run);
  }
  return run;
}

const FACES = ['J', 'Q', 'K'] as const;
export function applyFortune(run0: RunState, id: FortuneId, uids: number[]): RunState {
  const run = run0.table ? { ...run0, table: { ...run0.table, deck: [...run0.table.deck], discard: [...run0.table.discard], round: run0.table.round && { ...run0.table.round, hands: run0.table.round.hands.map((h) => ({ ...h, cards: [...h.cards] })) } } } : { ...run0 };
  const rng = stream(run.seed, `fortune:${id}:${run.nextUid}:${uids.join(',')}`);
  const find = (u: number) => run.deck.find((c) => c.uid === u) ?? run.pack?.cards.find((c) => c.uid === u);
  const setEnh = (e: Enh) => changeCards(run, uids, (c) => ({ ...c, enh: e }));
  switch (id) {
    case 'forger': changeCards(run, uids, (c) => ({ ...c, rank: 'A', enh: c.enh === 'stone' ? undefined : c.enh })); break;
    case 'shredder': destroyCards(run, uids); break;
    case 'royal': changeCards(run, uids, (c) => ({ ...c, rank: pickOne(rng, FACES), enh: c.enh === 'stone' ? undefined : c.enh })); break;
    case 'twin': {
      const src = find(uids[1]);
      if (src) changeCards(run, [uids[0]], (c) => ({ ...c, rank: src.rank, suit: src.suit, enh: src.enh }));
      break;
    }
    case 'painter': { const s = find(uids[0])?.suit; if (s) changeCards(run, uids.slice(1), (c) => ({ ...c, suit: s })); break; }
    case 'gilder': setEnh('gold'); break;
    case 'glazier': setEnh('glass'); break;
    case 'gambler': setEnh('lucky'); break;
    case 'trickster': setEnh('wild'); break;
    case 'banker': setEnh('bonus'); break;
    case 'mason': setEnh('stone'); break;
    case 'hermit': run.money += Math.min(run.money, 20); break;
    case 'patron': {
      const cid = rollCharm(run, rng, new Set(), 'common');
      if (cid && charmRoom(run)) run.charms = [...run.charms, { uid: uid(run), id: cid, counter: 0 }];
      break;
    }
    case 'bartender': {
      const add: Consumable[] = [];
      while (run.cons.length + add.length < run.consSlots && add.length < 2) add.push({ kind: 'cocktail', id: rollCocktail(rng), uid: uid(run) });
      run.cons = [...run.cons, ...add];
      break;
    }
  }
  return run;
}
export const enhName = (e: Enh) => ENH_INFO[e].name;

// --------------------------------------------------------------- leaderboard

export interface BoardEntry { seed: string; ante: number; won: boolean; endless: boolean; best: number; total: number; charms: string[]; date: string; daily: boolean; reason: string }
const RUN_KEY = 'bja.stakes.run', BOARD_KEY = 'bja.stakes.board', SETTINGS_KEY = 'bja.stakes.settings';
export interface StakesSettings { sound: boolean; music: boolean; speed: 1 | 2 | 3; seenHowTo: boolean }
export const DEFAULT_SETTINGS: StakesSettings = { sound: false, music: false, speed: 1, seenHowTo: false };
function read<T>(k: string): T | null { try { const raw = localStorage.getItem(k); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; } }
function write(k: string, v: unknown) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } }
export const loadRun = (): RunState | null => { const r = read<RunState>(RUN_KEY); return r && r.v === 1 && Array.isArray(r.deck) ? r : null; };
export const saveRun = (r: RunState | null) => write(RUN_KEY, r);
export const loadBoard = (): BoardEntry[] => read<BoardEntry[]>(BOARD_KEY) ?? [];
export const clearBoard = () => write(BOARD_KEY, null);
export const loadSettings = (): StakesSettings => ({ ...DEFAULT_SETTINGS, ...(read<Partial<StakesSettings>>(SETTINGS_KEY) ?? {}) });
export const saveSettings = (s: StakesSettings) => write(SETTINGS_KEY, s);
export const rankEntries = (a: BoardEntry, b: BoardEntry) => b.ante - a.ante || Number(b.won) - Number(a.won) || b.total - a.total;
export function recordRun(run: RunState): { board: BoardEntry[]; rank: number } {
  const board = loadBoard();
  if (!run.end) return { board, rank: 0 };
  const entry: BoardEntry = {
    seed: run.seedLabel, ante: run.ante, won: run.end.won, endless: run.endless, best: run.stats.bestHand, total: run.stats.total,
    charms: run.charms.map((c) => c.id), date: new Date().toISOString().slice(0, 10), daily: run.daily, reason: run.end.reason,
  };
  const all = [...board, entry].sort(rankEntries).slice(0, 25);
  write(BOARD_KEY, all);
  return { board: all, rank: all.indexOf(entry) + 1 };
}
export function dailySeed(d = new Date()) {
  return `STK${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}
export { stageOf };
