// Count & Conquer: the blackjack table, where the counting happens
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Rank } from '../../engine/types';
import { handValue, HILO } from '../../engine/cards';
import { money } from '../../lib/format';
import { suitFor } from '../felt';
import { NPC_LINES } from '../../conquer/data';
import {
  answerCheck, bookMove, canDouble, canSurrender, canTip, concentrate, deviation, endRound, freeWatch, heatLevel, HOT_TC, COLD_TC, insure, isBJ,
  leaveTable, move, SIDE_PAYS, sideStake, sitDown, standUp, startRound, tableMax, tip, tipCost,
  type Move, type Outcome, type Round, type TableState,
} from '../../conquer/engine';
import { finishTable, updateTable, type RunState } from '../../conquer/run';
import { sound } from '../../conquer/audio';
import { Avatar, CameraDome, Icon, Neon, PitBoss } from './art';

type SetRun = (fn: (r: RunState) => RunState) => void;
const RED = new Set(['♥', '♦']);
const OUTCOME: Record<Outcome, string> = {
  blackjack: 'Blackjack!', win: 'You win', dealer_bust: 'Dealer busts', push: 'Push', lose: 'Dealer wins', bust: 'Bust',
  dealer_blackjack: 'Dealer blackjack', surrender: 'Surrendered',
};
const MOVE_TEXT: Record<Move, string> = { HIT: 'Hit', STAND: 'Stand', DOUBLE: 'Double', SURRENDER: 'Surrender' };
const CHIP_SETS: Record<number, number[]> = { 10: [10, 25, 50, 100], 20: [20, 50, 100, 200], 25: [25, 50, 100, 250], 50: [50, 100, 250, 500], 100: [100, 250, 500, 1000] };
const CHIP_COLOR: Record<number, string> = { 5: '#c3262b', 10: '#2f6fd6', 20: '#d6b42f', 25: '#17803d', 50: '#e07a1f', 100: '#262626', 200: '#1f9e9e', 250: '#d9468f', 500: '#6b3fb3', 1000: '#c8952b' };
const DENOMS = [1000, 500, 250, 100, 50, 25, 10, 5];
const DEAL_MS = [0, 330, 200, 120];
const PAUSE_MS = [0, 1500, 1000, 650];
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
const halves = (d: number) => { const w = Math.floor(d); return d - w >= 0.5 ? (w ? `${w}½` : '½') : `${w}`; };

function chipStack(amount: number) {
  const out: number[] = [];
  let left = amount;
  for (const d of DENOMS) while (left >= d && out.length < 9) { out.push(d); left -= d; }
  return out.reverse();
}

function Card({ rank, suitKey, down, i, from }: { rank: Rank; suitKey: string; down?: boolean; i: number; from: string }) {
  const h = [...suitKey].reduce((a, ch) => (Math.imul(a, 31) + ch.charCodeAt(0)) >>> 0, 7);
  const suit = suitFor(h, suitKey, i, rank);
  const face = rank === 'J' || rank === 'Q' || rank === 'K';
  return (
    <div className={`cq-card${RED.has(suit) ? ' red' : ''}${down ? ' down' : ''} from-${from}`} aria-label={down ? 'Face-down card' : `${rank}${suit}`}>
      <div className="cq-card-inner">
        <div className="cq-card-face front">
          <span className="corner tl">{rank}<i>{suit}</i></span>
          <span className={`pip${face ? ' face' : ''}`}>{face ? rank : suit}</span>
          <span className="corner br">{rank}<i>{suit}</i></span>
        </div>
        <div className="cq-card-face back" />
      </div>
    </div>
  );
}

function Total({ cards, hide }: { cards: Rank[]; hide?: boolean }) {
  if (!cards.length || hide) return null;
  const { total: v, soft } = handValue(cards);
  const bj = isBJ(cards);
  return <span className={`cq-total${bj ? ' bj' : v > 21 ? ' bust' : ''}`}>{bj ? 'BJ' : v > 21 ? 'Bust' : `${soft && v < 21 ? 'soft ' : ''}${v}`}</span>;
}

interface View { player: Rank[]; dealer: Rank[]; npcs: Rank[][]; holeDown: boolean; rc: number; pos: number; dealt: number; complete: boolean; shuffling: boolean }
/** What has been dealt on screen so far, and the count a player could have kept from it. */
function viewOf(t: TableState, r: Round | null, shown: number): View {
  if (!r) return { player: [], dealer: [], npcs: [], holeDown: false, rc: t.rc, pos: t.pos, dealt: t.dealt, complete: true, shuffling: false };
  const player: Rank[] = [], dealer: Rank[] = [];
  const npcs: Rank[][] = r.npcs.map(() => []);
  let holeDown = false, hiddenRc = 0, hiddenCards = 0, shuffling = false;
  r.seq.forEach((e, i) => {
    const vis = i < shown;
    if (e.kind === 'card') {
      if (vis) { (e.seat === 'P' ? player : e.seat === 'D' ? dealer : npcs[e.seat]).push(e.card); if (e.hole) holeDown = true; }
      else { hiddenCards += 1; if (!e.hole) hiddenRc += HILO[e.card]; }
    } else if (e.kind === 'reveal') {
      if (vis) holeDown = false; else hiddenRc += HILO[r.dealer[1]];
    } else if (vis && i === shown - 1) shuffling = true;
  });
  return { player, dealer, npcs, holeDown, rc: t.rc - hiddenRc, pos: t.pos - hiddenCards, dealt: t.dealt - hiddenCards, complete: shown >= r.seq.length, shuffling };
}
const decksFrom = (t: TableState, pos: number) => Math.max(0.5, Math.round((t.shoe.length - pos) / 26) / 2);

interface Floater { id: number; text: string; tone: 'heat' | 'cool' | 'good' | 'bad' | 'hot' }

export function CasinoTable({ run, setRun, speed }: { run: RunState; setRun: SetRun; speed: 1 | 2 | 3 }) {
  const t = run.table!;
  const spec = t.spec;
  const has = (id: string) => t.relics.includes(id as never);
  const act = (fn: (x: TableState) => TableState) => setRun((r) => updateTable(r, fn));

  // dealing animation: reveal the round's events one at a time
  const roundKey = t.round ? `${t.hands}:${t.watched}` : null;
  const [anim, setAnim] = useState<{ key: string | null; shown: number }>(() => ({ key: roundKey, shown: t.round?.seq.length ?? 0 }));
  const shown = anim.key === roundKey ? anim.shown : 0;
  const [last, setLast] = useState<Round | null>(null);
  const [sweep, setSweep] = useState<Round | null>(null);
  // 0 means "the table minimum"; chips add on top
  const [bet, setBet] = useState(0);
  const [side, setSide] = useState(false);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [flash, setFlash] = useState<number | null>(null);
  const [checkClock, setCheckClock] = useState<{ key: string; left: number } | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const live = t.round;
  const disp = live ?? last;
  const view = viewOf(t, live, shown);
  const dview = live ? view : last ? viewOf(t, last, last.seq.length) : view;
  const busy = !!live && !view.complete;
  const decks = decksFrom(t, view.pos);
  const tc = view.rc / decks;
  const tcStr = (Math.round(tc * 10) / 10).toFixed(1);
  const done = !!live && view.complete && live.phase === 'done';

  useEffect(() => {
    const r = t.round;
    if (!r) return;
    if (anim.key !== roundKey) { setAnim({ key: roundKey, shown: 0 }); return; }
    if (anim.shown >= r.seq.length) return;
    const e = r.seq[anim.shown];
    const prev = r.seq[anim.shown - 1];
    const base = DEAL_MS[speed];
    const delay = anim.shown === 0 ? base + (sweep ? 260 : 0) : prev?.kind === 'shuffle' ? 1100 : e.kind === 'reveal' ? base * 1.5 : base;
    const id = window.setTimeout(() => {
      sound.play(e.kind === 'card' ? 'card' : e.kind === 'reveal' ? 'flip' : 'shuffle');
      setAnim((a) => ({ ...a, shown: a.shown + 1 }));
    }, delay);
    return () => window.clearTimeout(id);
  }, [t.round, anim, roundKey, speed, sweep]);

  // once a hand has played out, pause on the result, then clear the table
  useEffect(() => {
    if (!done || t.over) return;
    const r = t.round!;
    const id = window.setTimeout(() => { setLast(r); act(endRound); }, PAUSE_MS[speed] + (r.sitOut ? 0 : 250));
    return () => window.clearTimeout(id);
  }, [done, t.over, speed]);

  // sounds and floating numbers when a hand settles
  const settledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!done || !live || settledRef.current === roundKey) return;
    settledRef.current = roundKey;
    if (live.sitOut) return;
    const delta = live.profit + live.insuranceProfit + live.sideProfit;
    const add: Floater[] = [];
    if (delta) add.push({ id: Math.random(), text: money(delta, { sign: true }), tone: delta > 0 ? 'good' : 'bad' });
    if (live.hotDelta) add.push({ id: Math.random(), text: `${live.hotDelta > 0 ? '+' : '−'}${money(Math.abs(live.hotDelta))} ${live.hotDelta > 0 ? 'hot' : 'cold'} money`, tone: live.hotDelta > 0 ? 'hot' : 'cool' });
    if (add.length) setFloaters((f) => [...f, ...add]);
    sound.play(live.result === 'blackjack' || delta >= spec.minBet * 6 ? 'big' : delta > 0 ? 'win' : delta < 0 ? 'lose' : 'push');
  }, [done, live, roundKey, spec.minBet]);

  // heat changes float up from the meter; crossing a threshold sounds a warning
  const heatRef = useRef(t.heat);
  useEffect(() => {
    const d = Math.round((t.heat - heatRef.current) * 10) / 10;
    const before = heatRef.current;
    heatRef.current = t.heat;
    if (Math.abs(d) >= 1) setFloaters((f) => [...f, { id: Math.random(), text: `${d > 0 ? '+' : '−'}${Math.abs(Math.round(d))} heat`, tone: d > 0 ? 'heat' : 'cool' }]);
    if (before < 80 && t.heat >= 80) sound.play('alarm');
    else if ((before < 50 && t.heat >= 50) || (before < 25 && t.heat >= 25)) sound.play('heat');
  }, [t.heat]);
  useEffect(() => {
    if (!floaters.length) return;
    const id = window.setTimeout(() => setFloaters((f) => f.slice(1)), 1700);
    return () => window.clearTimeout(id);
  }, [floaters]);

  // Card Sense: the running count flashes every 15 cards
  const senseRef = useRef(Math.floor(t.dealt / 15));
  useEffect(() => {
    if (!has('card_sense')) return;
    const n = Math.floor(view.dealt / 15);
    if (n > senseRef.current) {
      senseRef.current = n;
      setFlash(view.rc);
      const id = window.setTimeout(() => setFlash(null), 2200);
      return () => window.clearTimeout(id);
    }
    senseRef.current = n;
  }, [view.dealt]);

  // the small-talk count check has a clock on it
  const checkKey = t.check ? `${t.hands}-${t.check.answer}-${t.checksTotal}` : null;
  useEffect(() => {
    if (!checkKey) { setCheckClock(null); return; }
    setCheckClock({ key: checkKey, left: 12 });
    const id = window.setInterval(() => setCheckClock((c) => (c && c.key === checkKey ? { ...c, left: c.left - 1 } : c)), 1000);
    return () => window.clearInterval(id);
  }, [checkKey]);
  const checkLeft = checkClock && checkClock.key === checkKey ? checkClock.left : 12;
  useEffect(() => {
    if (!checkClock || checkClock.key !== checkKey || checkClock.left > 0) return;
    // ran out of time: that counts as losing the count
    act((x) => (x.check ? answerCheck(x, x.check.answer + 99) : x));
    sound.play('heat');
  }, [checkClock]);

  const overKey = t.over ? t.over.reason : null;
  useEffect(() => {
    if (!t.over) return;
    sound.play(t.over.reason === 'backed_off' ? 'backoff' : t.over.cleared ? 'cleared' : 'fail');
  }, [overKey]);

  // ---------------------------------------------------------------- betting
  const chips = CHIP_SETS[spec.minBet] ?? [spec.minBet, spec.minBet * 2.5, spec.minBet * 5, spec.minBet * 10];
  const maxNow = tableMax(t);
  const sideCost = side ? sideStake(t) : 0;
  const cap = Math.min(maxNow, t.bankroll - sideCost);
  const canBetMin = t.bankroll >= spec.minBet;
  const betNow = Math.max(spec.minBet, Math.min(bet, Math.max(spec.minBet, cap)));
  const tooPoor = !canBetMin || (side && t.bankroll < spec.minBet + sideCost);

  const deal = () => {
    if (t.round || t.over || t.check) return;
    if (last) { setSweep(last); setLast(null); window.setTimeout(() => setSweep(null), 480); }
    if (!t.seated) { act((x) => startRound(x, 0)); return; }
    if (tooPoor) return;
    sound.play('chip');
    act((x) => startRound(x, betNow, { side }));
  };
  const addChip = (v: number) => { sound.play('chip'); setBet((b) => Math.min(Math.max(spec.minBet, cap), b + v)); };
  const doMove = (m: Move) => { if (!busy) act((x) => move(x, m)); };
  const doInsure = (take: boolean) => { if (!busy) act((x) => insure(x, take)); };
  const leave = () => {
    const unfinished = t.hot < spec.target;
    if (unfinished && !confirmLeave) { setConfirmLeave(true); return; }
    setConfirmLeave(false);
    act(leaveTable);
  };
  useEffect(() => { if (confirmLeave) { const id = window.setTimeout(() => setConfirmLeave(false), 3500); return () => window.clearTimeout(id); } }, [confirmLeave]);

  const book = live && view.complete && live.phase === 'play' ? bookMove(t) : null;
  const dev = live && view.complete && live.phase === 'play' && has('notes') ? deviation(live.player, live.dealer[0], tc) : null;
  const insureHint = has('notes') && live?.phase === 'insurance' ? (tc >= 3 ? 'Count is +3 or more: insurance is a good bet.' : 'Count is under +3: decline insurance.') : null;
  const showTC = t.assisted || has('earpiece') || t.peeking;
  const showRC = t.assisted;
  const spotter = has('spotter') && !live && tc >= HOT_TC;
  const level = heatLevel(t.heat);
  const cleared = t.hot >= spec.target;

  // keyboard: the same keys every blackjack game uses
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (t.over) { if (k === 'enter') { e.preventDefault(); setRun(finishTable); } return; }
    if (t.check) { const i = Number(k) - 1; if (i >= 0 && i < t.check.options.length) act((x) => (x.check ? answerCheck(x, x.check.options[i]) : x)); return; }
    if (live) {
      if (busy) return;
      if (live.phase === 'done' && k === 'enter') { e.preventDefault(); setLast(live); act(endRound); return; }
      if (live.phase === 'insurance') { if (k === 'y' || k === 'i') doInsure(true); if (k === 'n') doInsure(false); return; }
      if (live.phase === 'play') {
        if (k === 'h') doMove('HIT'); else if (k === 's') doMove('STAND'); else if (k === 'd' && canDouble(t)) doMove('DOUBLE'); else if (k === 'r' && canSurrender(t)) doMove('SURRENDER');
        return;
      }
      return;
    }
    if (k === 'enter') { e.preventDefault(); deal(); return; }
    if (!t.seated) { if (k === 's') act(sitDown); return; }
    const ci = Number(k) - 1;
    if (ci >= 0 && ci < chips.length) addChip(chips[ci]);
    else if (k === 'backspace') setBet(0);
    else if (k === 'x') setBet((b) => Math.min(Math.max(spec.minBet, cap), Math.max(b, spec.minBet) * 2));
    else if (k === 'l') setSide((s) => !s);
    else if (k === 't' && canTip(t)) act(tip);
    else if (k === 'f') act(concentrate);
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // ------------------------------------------------------------------ layout
  const npcSeats = (disp?.npcs ?? spec.npcs.map((name, i) => ({ name, first: i === 0, cards: [] as Rank[], result: null, style: 'book' as const })));
  const right = npcSeats.map((n, i) => ({ n, i })).filter((x) => x.n.first);
  const left = npcSeats.map((n, i) => ({ n, i })).filter((x) => !x.n.first);
  const dHole = live ? view.holeDown : false;
  const showResults = !!disp && (live ? view.complete && live.phase === 'done' : true);
  const handNo = `${t.hands}:${t.watched}`;
  const discards = Math.max(0, dview.pos - dview.player.length - dview.dealer.length - dview.npcs.reduce((a, c) => a + c.length, 0));
  const shoeFrac = Math.max(0, 1 - view.pos / t.shoe.length);
  const cutFrac = 1 - t.cut / t.shoe.length;
  const rules = `BLACKJACK PAYS ${spec.bjPays === 1.5 ? '3 TO 2' : '6 TO 5'} · DEALER ${spec.h17 ? 'HITS SOFT 17' : 'STANDS ON ALL 17s'}`;
  const watchLeft = freeWatch(spec) - t.watched;

  const npcSeat = ({ n, i }: { n: typeof npcSeats[number]; i: number }) => {
    const cards = (live ? view.npcs[i] : dview.npcs[i]) ?? [];
    const res = showResults ? n.result : null;
    const lines = res ? NPC_LINES[res] : null;
    const line = lines && live ? lines[(t.hands + t.watched + i) % lines.length] : null;
    return (
      <div key={n.name} className={`cq-seat npc${n.first ? ' first' : ' third'}`}>
        <div className="cq-hand">
          {cards.map((c, j) => <Card key={j} rank={c} suitKey={`${handNo}n${i}`} i={j} from={n.first ? 'right' : 'left'} />)}
          <Total cards={cards} />
        </div>
        <div className="cq-npc-tag">
          <Avatar name={n.name} mood={res === 'win' || res === 'blackjack' ? 'win' : res === 'lose' || res === 'bust' ? 'lose' : null} />
          <span>{n.name}<small>{n.first ? 'acts before you' : 'acts after you'}</small></span>
        </div>
        {line && <div className={`cq-bubble ${res}`} key={`${handNo}-${i}`}>{line}</div>}
      </div>
    );
  };

  const r = disp;
  const pCards = live ? view.player : dview.player;
  const delta = r && showResults && !r.sitOut ? r.profit + r.insuranceProfit + r.sideProfit : 0;

  return (
    <div className={`cq-casino heat-${level}${spec.tier === 'boss' ? ' boss' : ''}`} style={{ '--heat': t.heat / 100 } as CSSProperties}>
      <header className="cq-casino-head">
        <div className="cq-marquee">
          <Neon text={spec.name} tone={spec.tier === 'boss' ? 'red' : spec.tier === 'elite' ? 'gold' : 'pink'} as="h2" dying={spec.name.length > 6 ? (spec.name.length * 7) % spec.name.length : undefined} />
          <p>
            {spec.decks === 1 ? 'Single deck' : `${spec.decks} decks`} · {money(spec.minBet)}–{money(maxNow)} limits
            {spec.npcs.length ? ` · ${spec.npcs.length === 1 ? 'one regular' : 'two regulars'} at the table` : ''}
            {spec.special && <> · <strong className="cq-special">{spec.blurb}</strong></>}
          </p>
        </div>
        <CameraDome heat={t.heat} />
      </header>

      <div className="cq-hud">
        <div className="cq-stat">
          <span className="cq-label">Bankroll</span>
          <strong className="cq-money">{money(t.bankroll)}</strong>
          <small className={t.net > 0 ? 'pos' : t.net < 0 ? 'neg' : ''}>{money(t.net, { sign: true })} here</small>
        </div>
        <div className={`cq-stat cq-job${cleared ? ' done' : ''}`}>
          <span className="cq-label"><Icon name="flame" size={14} /> The job <em>bet {money(spec.target)} at a true count of +{HOT_TC} or better</em></span>
          <div className="cq-bar" role="progressbar" aria-valuemin={0} aria-valuemax={spec.target} aria-valuenow={Math.max(0, t.hot)} aria-label="Hot money">
            <i style={{ width: `${Math.max(0, Math.min(100, (100 * t.hot) / spec.target))}%` }} />
          </div>
          <small>{cleared ? 'Job done. Cash out whenever you like.' : `${money(t.hot)} of ${money(spec.target)} hot money`}</small>
        </div>
        <div className={`cq-stat cq-heat ${level}`}>
          <span className="cq-label">Heat <em>{level}</em></span>
          <div className="cq-heatbar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(t.heat)} aria-label="Heat">
            <i style={{ '--w': `${t.heat}%` } as CSSProperties} />
            <b style={{ left: '25%' }} /><b style={{ left: '50%' }} /><b style={{ left: '80%' }} />
          </div>
          <small>{t.heat >= 80 ? 'Max bet halved. One more push and you\'re out.' : t.heat >= 50 ? 'Watched: early shuffles on good counts.' : t.heat >= 25 ? 'The pit boss has noticed you.' : 'Nobody is looking at you.'}</small>
          <div className="cq-floaters" aria-hidden="true">
            {floaters.filter((f) => f.tone === 'heat' || f.tone === 'cool').slice(-2).map((f) => <span key={f.id} className={`cq-float ${f.tone}`}>{f.text}</span>)}
          </div>
        </div>
        <div className="cq-stat">
          <span className="cq-label">{t.seated ? 'Hands left' : 'Watching'}</span>
          <strong>{t.seated ? spec.hands - t.hands : watchLeft > 0 ? `${watchLeft} free` : 'Lurking'}</strong>
          <small className="cq-focus" title="Focus: spend one to see the exact true count for a hand">
            {Array.from({ length: t.maxFocus }, (_, i) => <i key={i} className={i < t.focus ? 'on' : ''} />)} Focus
          </small>
        </div>
      </div>

      <div className="cq-room">
        <PitBoss heat={t.heat} />
        <div className="cq-felt">
          <svg className="cq-print" viewBox="0 0 1000 435" preserveAspectRatio="xMidYMin meet" aria-hidden="true">
            <path id="cq-arc1" d="M150 95 Q 500 205 850 95" fill="none" />
            <path id="cq-arc2" d="M300 150 Q 500 230 700 150" fill="none" />
            <text><textPath href="#cq-arc1" startOffset="50%">{rules}</textPath></text>
            <text className="small"><textPath href="#cq-arc2" startOffset="50%">INSURANCE PAYS {has('agent') ? '3' : '2'} TO 1</textPath></text>
          </svg>

          <div className="cq-shoe" title={`About ${halves(decks)} decks left in the shoe`}>
            <div className="cq-shoe-box"><i style={{ height: `${shoeFrac * 100}%` }} /><b style={{ bottom: `${cutFrac * 100}%` }} /></div>
            <span>{halves(decks)} {decks <= 1 ? 'deck' : 'decks'} left</span>
          </div>
          <div className="cq-tray" title="Discard tray">
            <div className="cq-tray-box"><i style={{ height: `${Math.min(100, (discards / t.shoe.length) * 100)}%` }} /></div>
            <span>Discards</span>
          </div>
          {view.shuffling && <div className="cq-shuffle">Shuffling…</div>}

          <div className="cq-dealer">
            <div className="cq-hand">
              {(live ? view.dealer : dview.dealer).map((c, j) => <Card key={j} rank={c} suitKey={`${handNo}d`} i={j} down={j === 1 && dHole} from="dealer" />)}
              <Total cards={live ? view.dealer : dview.dealer} hide={dHole} />
            </div>
          </div>

          {sweep && (
            <div className="cq-sweep" aria-hidden="true">
              {[...sweep.dealer, ...sweep.player, ...sweep.npcs.flatMap((n) => n.cards)].slice(0, 14).map((_, j) => <span key={j} className="cq-ghost" style={{ '--i': j } as CSSProperties} />)}
            </div>
          )}

          <div className="cq-seats">
            {left.map(npcSeat)}
            <div className={`cq-seat you${!t.seated && !live ? ' empty' : ''}${r?.sitOut ? ' watching' : ''}`}>
              <div className="cq-hand">
                {pCards.map((c, j) => <Card key={j} rank={c} suitKey={`${handNo}p`} i={j} from="you" />)}
                <Total cards={pCards} />
              </div>
              <div className="cq-circles">
                <div className="cq-betcircle" aria-label={`Bet ${money(r && !r.sitOut ? r.bet : t.seated ? betNow : 0)}`}>
                  {(r && !r.sitOut ? chipStack(r.bet * (r.doubled ? 2 : 1)) : !live && t.seated ? chipStack(betNow) : []).map((v, j) => (
                    <span key={`${j}-${v}`} className="cq-chip" style={{ '--c': CHIP_COLOR[v] ?? '#555', '--j': j } as CSSProperties} />
                  ))}
                  {(r && !r.sitOut) || t.seated ? <em>{r && !r.sitOut ? money(r.bet * (r.doubled ? 2 : 1)) : money(betNow)}</em> : null}
                </div>
                <button type="button" className={`cq-sidecircle${(live ? live.side : side) ? ' on' : ''}`} disabled={!!live || !t.seated}
                  onClick={() => { setSide((s) => !s); sound.play('chip'); }} aria-pressed={side} title={`Lucky 20: your first two cards total 20. Pays ${SIDE_PAYS} to 1.`}>
                  <b>LUCKY 20</b><small>{SIDE_PAYS} TO 1</small>
                </button>
              </div>
              {!t.seated && !live && <div className="cq-rail-tag">You're watching from the rail</div>}
              {r && showResults && !r.sitOut && r.result && (
                <div className={`cq-result ${delta > 0 ? 'good' : delta < 0 ? 'bad' : 'even'}${live ? '' : ' settled'}`} key={`res-${r.seq.length}-${r.bet}-${r.tcAtBet}`}>
                  {OUTCOME[r.result]}<small>{money(delta, { sign: true })}{r.hotDelta ? ` · ${r.hotDelta > 0 ? '🔥' : '❄'} ${money(Math.abs(r.hotDelta))} ${r.hotDelta > 0 ? 'hot' : 'cold'}` : ''}</small>
                </div>
              )}
              {live && live.sideProfit > 0 && view.player.length >= 2 && <div className="cq-lucky">LUCKY 20!</div>}
            </div>
            {right.map(npcSeat)}
          </div>

          <div className="cq-count-panel" aria-live="polite">
            {showRC && <span><small>Running</small>{signed(view.rc)}</span>}
            {showTC && <span className={tc >= HOT_TC ? 'hot' : tc < COLD_TC ? 'cold' : ''}><small>True</small>{tc > 0 ? '+' : ''}{tcStr.replace('-', '−')}</span>}
            {flash != null && !showRC && <span className="flash"><small>Card sense</small>{signed(flash)}</span>}
            {t.peeking && !t.assisted && !has('earpiece') && <span className="peek-tag">Focused</span>}
          </div>
          {has('spotter') && <div className={`cq-spotter${spotter ? ' signal' : ''}`} title="Lucky Lou scratches his ear when the true count is +2 or better"><Icon name="spotter" size={18} /> {spotter ? 'Lou scratches his ear' : 'Lou is watching'}</div>}

          <div className="cq-floaters table" aria-hidden="true">
            {floaters.filter((f) => f.tone !== 'heat' && f.tone !== 'cool').slice(-2).map((f) => <span key={f.id} className={`cq-float ${f.tone}`}>{f.text}</span>)}
          </div>
        </div>
        <div className="cq-haze" aria-hidden="true" />
      </div>

      <div className="cq-controls">
        {t.over ? null : t.check ? null : live ? (
          busy ? <p className="cq-wait">{live.sitOut ? 'Watching the hand…' : 'Dealing…'}</p>
            : live.phase === 'insurance' ? (
              <div className="cq-row">
                <p className="cq-prompt">Dealer shows an ace. Insurance costs {money(Math.floor(live.bet / 2))} and pays {has('agent') ? '3' : '2'} to 1 if the dealer has blackjack.</p>
                <button type="button" className="cq-btn" onClick={() => doInsure(true)} disabled={t.bankroll < live.bet + live.side + Math.floor(live.bet / 2)}>Insure <kbd>Y</kbd></button>
                <button type="button" className="cq-btn primary" onClick={() => doInsure(false)}>No thanks <kbd>N</kbd></button>
                {insureHint && <p className="cq-hint"><Icon name="notes" size={14} /><span>{insureHint}</span></p>}
              </div>
            ) : live.phase === 'play' ? (
              <div className="cq-row">
                {(['HIT', 'STAND', 'DOUBLE', 'SURRENDER'] as Move[]).filter((m) => m !== 'SURRENDER' || t.relics.includes('surrender')).map((m) => (
                  <button key={m} type="button" className={`cq-btn act${(dev?.move ?? (has('cheat_sheet') ? book : null)) === m ? ' suggest' : ''}`}
                    disabled={(m === 'DOUBLE' && !canDouble(t)) || (m === 'SURRENDER' && !canSurrender(t))} onClick={() => doMove(m)}>
                    {MOVE_TEXT[m]} <kbd>{m === 'SURRENDER' ? 'R' : m[0]}</kbd>
                  </button>
                ))}
                {(dev || (has('cheat_sheet') && book)) && (
                  <p className="cq-hint">
                    {dev ? <><Icon name="notes" size={14} /><span>{dev.text}</span></> : <><Icon name="cheat_sheet" size={14} /><span>The book says <strong>{MOVE_TEXT[book!].toLowerCase()}</strong>.</span></>}
                  </p>
                )}
              </div>
            ) : <p className="cq-wait">{live.sitOut ? 'Hand over.' : ''}</p>
        ) : !t.seated ? (
          <div className="cq-row">
            <button type="button" className="cq-btn primary" onClick={deal}>Watch a hand <kbd>Enter</kbd></button>
            <button type="button" className="cq-btn gold" onClick={() => act(sitDown)} disabled={t.bankroll < spec.minBet}>Sit down <kbd>S</kbd></button>
            <p className="cq-prompt">
              {watchLeft > 0 ? `Count from the rail for free: ${watchLeft} more hand${watchLeft === 1 ? '' : 's'} before security wonders why you're hovering.` : 'Security is eyeing you. Every hand you watch now adds heat.'}
              {' '}Sitting down into a hot shoe looks suspicious, so get in before the count peaks.
            </p>
          </div>
        ) : (
          <>
            <div className="cq-row bet">
              <div className="cq-betamount"><span className="cq-label">Bet</span><strong>{money(betNow)}</strong><small>{money(spec.minBet)} to {money(maxNow)}{t.heat >= 80 ? ' (halved)' : ''}</small></div>
              <div className="cq-chipbtns">
                {chips.map((v, i) => (
                  <button key={v} type="button" className="cq-chipbtn" style={{ '--c': CHIP_COLOR[v] ?? '#555' } as CSSProperties} onClick={() => addChip(v)} disabled={cap < v} aria-label={`Add ${money(v)}`} title={`Key ${i + 1}`}>
                    {v >= 1000 ? `${v / 1000}K` : v}
                  </button>
                ))}
              </div>
              <div className="cq-betquick">
                <button type="button" className="cq-btn ghost small" onClick={() => setBet(0)}>Min</button>
                <button type="button" className="cq-btn ghost small" onClick={() => setBet((b) => Math.min(Math.max(spec.minBet, cap), Math.max(b, spec.minBet) * 2))}>×2 <kbd>X</kbd></button>
                <button type="button" className="cq-btn ghost small" onClick={() => setBet(Math.max(spec.minBet, cap))}>Max</button>
              </div>
              <button type="button" className="cq-btn primary big" onClick={deal} disabled={tooPoor}>Deal <kbd>Enter</kbd></button>
            </div>
            <div className="cq-row tools">
              <button type="button" className={`cq-btn ghost small${side ? ' on' : ''}`} onClick={() => setSide((s) => !s)} aria-pressed={side}>
                Lucky 20 side bet {money(sideStake(t))} <kbd>L</kbd>
              </button>
              <button type="button" className="cq-btn ghost small" onClick={() => act(tip)} disabled={!canTip(t)} title="Tipping the dealer lowers Heat by 10">
                Tip the dealer {tipCost(t) ? money(tipCost(t)) : '(free)'}{t.tipWait ? ` · ${t.tipWait}` : ''} <kbd>T</kbd>
              </button>
              <button type="button" className="cq-btn ghost small" onClick={() => act(concentrate)} disabled={t.focus <= 0 || t.peeking} title="See the exact true count for the next hand">
                <Icon name="focus" size={14} /> {t.peeking ? 'Focused' : 'Focus'} <kbd>F</kbd>
              </button>
              <button type="button" className="cq-btn ghost small" onClick={() => act(standUp)}>Stand up and watch</button>
              <span className="cq-spacer" />
              <button type="button" className={`cq-btn small ${cleared ? 'gold' : confirmLeave ? 'danger' : 'ghost'}`} onClick={leave}>
                {cleared ? 'Cash out · job done' : confirmLeave ? (spec.tier === 'boss' ? 'Really? Failing the boss can end the run' : 'Leave without finishing the job?') : 'Leave'}
              </button>
            </div>
            {tooPoor && <p className="cq-hint bad">{t.bankroll < spec.minBet ? 'You can\'t cover the minimum bet. Time to leave.' : 'Not enough for the side bet as well.'}</p>}
          </>
        )}
        {!live && !t.over && !t.check && t.seated && (
          <p className="cq-hint dim">
            Hi-Lo: 2–6 count +1, 7–9 count 0, tens and aces count −1. True count = running count ÷ decks left.
            Bets at +{HOT_TC} or better are hot money; big bets below +{COLD_TC} set the job back.
          </p>
        )}
        <ul className="cq-log" aria-live="polite">
          {t.log.slice(0, 3).map((l, i) => <li key={`${t.log.length}-${i}`} className={l.tone}>{l.text}</li>)}
        </ul>
      </div>

      {t.check && (
        <div className="cq-modal" role="dialog" aria-modal="true" aria-labelledby="cq-check-title">
          <div className="cq-modal-card check">
            <div className="cq-modal-icon"><PitBoss heat={100} /></div>
            <h3 id="cq-check-title">Small talk</h3>
            <p>The pit boss drifts over and asks where you're from, how the buffet was, whether you like the Raiders. He wants to knock you off your count.</p>
            <p className="cq-q">Keep it straight. What's the running count?</p>
            <div className="cq-options">
              {t.check.options.map((v, i) => (
                <button key={v} type="button" className="cq-btn big" onClick={() => act((x) => answerCheck(x, v))}>{signed(v)} <kbd>{i + 1}</kbd></button>
              ))}
            </div>
            <div className="cq-timer" aria-label={`${checkLeft} seconds left`}><i style={{ width: `${(checkLeft / 12) * 100}%` }} /></div>
          </div>
        </div>
      )}

      {t.over && (
        <div className="cq-modal" role="dialog" aria-modal="true" aria-labelledby="cq-over-title">
          <div className={`cq-modal-card over ${t.over.cleared ? 'win' : 'lose'}`}>
            <Neon as="h2" text={t.over.cleared ? 'JOB DONE' : t.over.reason === 'backed_off' ? 'BACKED OFF' : t.over.reason === 'broke' ? 'TAPPED OUT' : 'JOB UNFINISHED'}
              tone={t.over.cleared ? 'gold' : 'red'} className="cq-over-title" />
            <p id="cq-over-title" className="cq-over-sub">
              {t.over.reason === 'backed_off' ? (t.over.cleared ? 'You got the job done, but security walks you to the door. +1 notoriety star.' : 'Security walks you to the door. +1 notoriety star.') : t.over.reason === 'closed' ? 'The table closes for the night.' : t.over.reason === 'broke' ? 'Your bankroll can\'t cover the minimum.' : 'You cash out and head for the exit.'}
              {!t.over.cleared && spec.tier === 'boss' ? ' The boss job failed.' : ''}
            </p>
            <dl className="cq-over-stats">
              <div><dt>Hot money</dt><dd className={t.over.cleared ? 'pos' : ''}>{money(t.hot)} <small>of {money(spec.target)}</small></dd></div>
              <div><dt>Won here</dt><dd className={t.net > 0 ? 'pos' : t.net < 0 ? 'neg' : ''}>{money(t.net, { sign: true })}</dd></div>
              <div><dt>Hands</dt><dd>{t.hands}<small> + {t.watched} watched</small></dd></div>
              <div><dt>Count checks</dt><dd>{t.checksTotal ? `${t.checksRight} of ${t.checksTotal}` : 'None'}</dd></div>
              <div><dt>Peak heat</dt><dd>{Math.round(t.heatPeak)}</dd></div>
            </dl>
            <button type="button" className="cq-btn primary big" onClick={() => setRun(finishTable)} autoFocus>Continue <kbd>Enter</kbd></button>
          </div>
        </div>
      )}
    </div>
  );
}
