// The live table: deal or replay a session and watch it hand by hand
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Bankroll, Decision, HandLog, Rank, Rules, StrategySpec } from '../engine/types';
import type { RunConfig } from '../engine/stats';
import { runSession } from '../engine/session';
import { HILO, handLabel } from '../engine/cards';
import { randomSeed } from '../engine/rng';
import { rulesShort } from '../engine/rules';
import { BUILTINS, describeCustom } from '../engine/strategies';
import { ChartCard } from '../charts/ChartCard';
import { LineChart } from '../charts/LineChart';
import { ColumnChart } from '../charts/BarCharts';
import { colorOf } from '../lib/registry';
import { money, signClass } from '../lib/format';
import { ABORT, Felt, type Hooks, type Token } from './felt';
import { NumberField, Segmented, StrategyKey, Switch } from './ui';
import { StrategyName } from './StrategyName';

export interface ReplayRequest { config: RunConfig; specId: string; session: number; nonce: number; origin?: 'results' | 'explainer' }

interface Prepared extends HandLog {
  rcStart: number; rcEnd: number; shoeEnd: number;
  stats: { w: number; l: number; p: number; bj: number; peak: number; dd: number; wagered: number; shuffles: number };
}
interface TableSession {
  spec: StrategySpec; rules: Rules; bank: Bankroll; seed: number; index: number; source: 'live' | 'replay';
  hands: Prepared[]; compare: { spec: StrategySpec; series: number[] }[]; continuous: boolean;
}
type Speed = 0.5 | 1 | 2 | 4 | 'turbo';
interface LiveState { rc: number; remaining: number; bet: number | null; decision: (Decision & { up: Rank }) | null }

const reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_TABLE_HANDS = 2000;      // longer sessions are cut short at the table

function prepare(spec: StrategySpec, rules: Rules, bank: Bankroll, seed: number, index: number, source: TableSession['source'], others: StrategySpec[]): TableSession {
  const b = { ...bank, sessions: 1 };
  const { hands } = runSession(spec.def, rules, b, seed, index, { log: true });
  const compare = others.filter((o) => o.id !== spec.id).map((o) => {
    const series: number[] = [];
    runSession(o.def, rules, b, seed, index, { onHand: (_h, _i, _before, after) => series.push(after) });
    return { spec: o, series };
  });
  let rc = 0, shuffles = 0, w = 0, l = 0, p = 0, bj = 0, peak = bank.start, dd = 0, wagered = 0;
  const continuous = rules.cutCard >= rules.decks * 52;
  const out: Prepared[] = hands.map((h, i) => {
    if (h.reshuffled) { rc = 0; if (i > 0 && !continuous) shuffles++; }
    const rcStart = rc;
    for (const c of [...h.player, ...h.dealer]) rc += HILO[c];
    if (h.outcome === 'W') w++; else if (h.outcome === 'L') l++; else p++;
    if (h.result === 'blackjack') bj++;
    wagered += h.bet;
    peak = Math.max(peak, h.after);
    dd = Math.max(dd, peak - h.after);
    return { ...h, reshuffled: h.reshuffled && i > 0 && !continuous, rcStart, rcEnd: rc, shoeEnd: h.shoeBefore - h.player.length - h.dealer.length,
      stats: { w, l, p, bj, peak, dd, wagered, shuffles } };
  });
  return { spec, rules, bank, seed, index, source, hands: out, compare, continuous };
}

interface Props {
  active: boolean;
  specs: StrategySpec[];
  selectedIds: string[];
  rules: Rules;
  bank: Bankroll;
  request: ReplayRequest | null;
}

export function TableView({ active, specs, selectedIds, rules, bank, request }: Props) {
  const feltRef = useRef<HTMLDivElement>(null);
  const felt = useRef<Felt | null>(null);
  const [session, setSession] = useState<TableSession | null>(null);
  const [pos, setPos] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState<Speed>(reducedMotion ? 'turbo' : 1);
  const [live, setLive] = useState<LiveState>({ rc: 0, remaining: 0, bet: null, decision: null });
  const [counter, setCounter] = useState(0);
  const [form, setForm] = useState({ specId: '', seed: null as number | null, compare: true });
  const ctl = useRef({ gen: 0, busy: false, playing: false, pos: -1, queued: false, speed: speed as Speed, session: null as TableSession | null });

  useEffect(() => { if (feltRef.current && !felt.current) felt.current = new Felt(feltRef.current); }, []);

  const rounds = Math.max(1, Math.min(MAX_TABLE_HANDS, bank.rounds));
  const settingsKey = (specId: string) => JSON.stringify([specId, rules, bank.start, bank.unit, rounds, form.compare,
    selectedIds, specs.map((s) => [s.id, s.def])]);
  const builtWith = useRef('');

  const total = session ? session.rules.decks * 52 : 312;
  const N = session ? session.hands.length : 0;

  const setPlay = (on: boolean) => { ctl.current.playing = on; setPlaying(on); };
  const setPosBoth = (i: number) => { ctl.current.pos = i; setPos(i); };

  const showEndMessage = useCallback(() => {
    const s = ctl.current.session;
    if (!s || !s.hands.length || !felt.current) return;
    const last = s.hands[s.hands.length - 1];
    setTimeout(() => {
      const c = ctl.current;
      if (c.pos === s.hands.length - 1 && !c.playing && !c.busy && c.session === s) {
        felt.current!.message(last.after <= 0 ? 'Broke: session over' : 'Session complete',
          `Final ${money(last.after)} (${money(last.after - s.bank.start, { sign: true })}) after ${s.hands.length} hands`);
      }
    }, ctl.current.speed === 'turbo' ? 50 : 900);
  }, []);

  const load = (s: TableSession, autoplay: boolean, key: string) => {
    builtWith.current = key;
    const c = ctl.current;
    c.gen++; c.busy = false; c.queued = false; c.session = s;
    const f = felt.current!;
    f.reset();
    f.setRules(s.rules);
    f.setDiscards(0);
    f.setShoe(s.rules.decks * 52, s.rules.decks * 52);
    f.message(`${s.spec.name}: ${s.hands.length} hand${s.hands.length === 1 ? '' : 's'}`, `Starting bankroll ${money(s.bank.start)}`);
    setSession(s);
    setForm((fm) => ({ ...fm, specId: s.spec.id }));
    setPosBoth(-1);
    setLive({ rc: 0, remaining: s.rules.decks * 52, bet: s.hands[0]?.stake ?? null, decision: null });
    if (autoplay) setTimeout(() => play(), 60);
  };

  // ----------------------------------------------------------- playback

  const playOne = async (i: number, my: number) => {
    const c = ctl.current, s = c.session!, h = s.hands[i], f = felt.current!;
    const t: Token = { get aborted() { return my !== ctl.current.gen; } };
    setLive({ rc: h.rcStart, remaining: h.shoeBefore, bet: h.stake, decision: null });
    setCounter(i + 1);
    if (c.speed === 'turbo') {
      f.showStatic(h, i);
      f.setDiscards(total - h.shoeBefore);
      f.setShoe(h.shoeEnd, total);
      const last = h.decisions[h.decisions.length - 1];
      setLive({ rc: h.rcEnd, remaining: h.shoeEnd, bet: s.hands[i + 1]?.stake ?? null, decision: last ? { ...last, up: h.dealer[0] } : null });
      setPosBoth(i);
      await sleep(s.hands.length > 300 ? 25 : 90);
      if (t.aborted) throw ABORT;
      return;
    }
    f.speed = c.speed;
    await f.clearTable(t);
    if (h.reshuffled) await f.shuffle(t);
    let rc = h.rcStart, remaining = h.shoeBefore;
    const hooks: Hooks = {
      bet: (amount) => setLive((l) => ({ ...l, bet: amount })),
      dealt: () => { remaining--; setLive((l) => ({ ...l, remaining })); f.setShoe(remaining, total); },
      revealed: (r) => { rc += HILO[r]; setLive((l) => ({ ...l, rc })); },
      decision: (d, up) => setLive((l) => ({ ...l, decision: { ...d, up } })),
    };
    await f.playHand(h, i, hooks, t);
    if (t.aborted) throw ABORT;
    setPosBoth(i);
    await f.wait(700, t);
  };

  const runLoop = async (limit: number) => {
    const c = ctl.current;
    if (c.busy || !c.session) return;
    c.busy = true;
    const my = ++c.gen;
    let done = 0;
    try {
      while (my === c.gen && c.pos < c.session.hands.length - 1 && done < limit && (c.playing || limit === 1)) {
        await playOne(c.pos + 1, my);
        done++;
      }
    } catch (e) {
      if (e !== ABORT) console.error(e);
    } finally {
      if (my === c.gen) {
        c.busy = false;
        if (c.session && c.pos >= c.session.hands.length - 1) { setPlay(false); showEndMessage(); }
        else if (c.queued && !c.playing) { c.queued = false; runLoop(1); }
      }
    }
  };

  const seek = (i: number) => {
    const c = ctl.current, s = c.session, f = felt.current;
    if (!s || !f) return;
    i = Math.max(-1, Math.min(s.hands.length - 1, i));
    c.gen++; c.busy = false; c.queued = false;
    f.cancelAll();
    setPosBoth(i);
    setCounter(i + 1);
    if (i >= 0) {
      const h = s.hands[i];
      f.showStatic(h, i);
      f.setDiscards(total - h.shoeBefore);
      f.setShoe(h.shoeEnd, s.rules.decks * 52);
      setLive({ rc: h.rcEnd, remaining: h.shoeEnd, bet: s.hands[i + 1]?.stake ?? null, decision: h.decisions.length ? { ...h.decisions[h.decisions.length - 1], up: h.dealer[0] } : null });
    } else {
      f.reset();
      f.setDiscards(0);
      f.setShoe(s.rules.decks * 52, s.rules.decks * 52);
      f.message(`${s.spec.name}: ${s.hands.length} hands`, `Starting bankroll ${money(s.bank.start)}`);
      setLive({ rc: 0, remaining: s.rules.decks * 52, bet: s.hands[0]?.stake ?? null, decision: null });
    }
    if (c.playing) runLoop(Infinity);
  };

  const play = () => {
    const c = ctl.current;
    if (!c.session) return;
    if (c.pos >= c.session.hands.length - 1) seek(-1);
    setPlay(true);
    runLoop(Infinity);
  };
  const pause = () => setPlay(false);
  const toggle = () => (ctl.current.playing ? pause() : play());
  const step = () => {
    const c = ctl.current;
    if (!c.session) return;
    if (c.playing) { pause(); return; }
    if (c.busy) c.queued = true; else runLoop(1);
  };
  const setSpeed = (v: Speed) => { ctl.current.speed = v; if (felt.current) felt.current.speed = v === 'turbo' ? 50 : v; setSpeedState(v); };

  // ---------------------------------------------------------- sources

  const specFor = (id: string) => specs.find((s) => s.id === id) || specs[0];
  /** Build a session from the current settings panel: same table, bankroll and hand count everywhere. */
  const build = (specId: string, seed: number, index: number) => {
    const spec = specFor(specId);
    const others = form.compare ? specs.filter((s) => selectedIds.includes(s.id)) : [];
    return { session: prepare(spec, rules, { ...bank, rounds }, seed, index, 'live', others), key: settingsKey(spec.id) };
  };
  const dealLive = () => {
    pause();
    const { session: s, key } = build(form.specId || selectedIds[0] || specs[0].id, form.seed ?? randomSeed(), 0);
    load(s, true, key);
  };

  // settings changed (bankroll, unit, hands, rules, options, strategy picked): re-deal the same cards with them
  const wantedKey = settingsKey(specFor(form.specId || session?.spec.id || selectedIds[0] || specs[0]?.id).id);
  useEffect(() => {
    const s = ctl.current.session;
    if (!s || !felt.current || wantedKey === builtWith.current) return;
    const t = setTimeout(() => {
      const cur = ctl.current.session;
      if (!cur) return;
      const wasPlaying = ctl.current.playing;
      pause();
      const { session: next, key } = build(form.specId || cur.spec.id, cur.seed, cur.index);
      load(next, wasPlaying, key);
    }, 250);
    return () => clearTimeout(t);
  }, [wantedKey]);

  useEffect(() => {
    if (!request || !felt.current) return;
    const spec = request.config.strategies.find((s) => s.id === request.specId);
    if (!spec) return;
    pause();
    const replayRounds = Math.min(request.config.bank.rounds, MAX_TABLE_HANDS);
    // the replay keeps the run's own settings until something in the settings panel changes
    load(prepare(spec, request.config.rules, { ...request.config.bank, rounds: replayRounds }, request.config.seed, request.session, request.origin === 'explainer' ? 'live' : 'replay', request.config.strategies),
      true, settingsKey(spec.id));
  }, [request]);

  useEffect(() => {
    if (!active) { pause(); return; }
    if (!ctl.current.session && !request) dealLive();
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.drawer.open')) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, select, textarea, [role="radio"], .modal')) return;
      if (t.closest('button, a') && !t.closest('.pb-buttons')) return;
      const map: Record<string, () => void> = {
        ' ': toggle, ArrowRight: step, ArrowLeft: () => { pause(); seek(ctl.current.pos - 1); },
        Home: () => { pause(); seek(-1); }, End: () => { pause(); seek((ctl.current.session?.hands.length ?? 0) - 1); },
      };
      if (map[e.key]) { e.preventDefault(); map[e.key](); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  // ------------------------------------------------------------ render

  const h = session && pos >= 0 ? session.hands[pos] : null;
  const st = h ? h.stats : { w: 0, l: 0, p: 0, bj: 0, peak: session?.bank.start ?? 0, dd: 0, wagered: 0, shuffles: 0 };
  const bankroll = h ? h.after : session?.bank.start ?? 0;
  const delta = session ? bankroll - session.bank.start : 0;
  const meta = session && session.spec.def.kind === 'builtin' ? BUILTINS.find((b) => b.key === (session.spec.def as { key: string }).key) : null;
  const about = session ? (meta ? `${meta.summary} ${meta.detail}` : session.spec.def.kind === 'custom' ? describeCustom(session.spec.def.def).slice(0, 4).join(' ') : '') : '';
  const tc = live.rc / Math.max(0.25, live.remaining / 52);

  const chartData = useMemo(() => {
    if (!session) return null;
    const shown = session.hands.slice(0, pos + 1);
    const start = session.bank.start;
    return {
      shown,
      main: [[0, start] as [number, number], ...shown.map((x, i) => [i + 1, x.after] as [number, number])],
      others: session.compare.map((c) => ({ spec: c.spec, points: [[0, start] as [number, number], ...c.series.slice(0, pos + 1).map((v, i) => [i + 1, v] as [number, number])] })),
    };
  }, [session, pos]);

  return (
    <div className="table-view">
      <div className="card controls-bar">
        <div className="controls">
          <label>Strategy
            <select value={form.specId || selectedIds[0] || specs[0]?.id} onChange={(e) => setForm({ ...form, specId: e.target.value })}>
              {specs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label>Seed <NumberField value={form.seed} min={0} max={2 ** 31 - 1} allowEmpty placeholder="random" onChange={(v) => setForm({ ...form, seed: v })} ariaLabel="Seed" /></label>
          <Switch checked={form.compare} onChange={(v) => setForm({ ...form, compare: v })}>Compare the strategies you picked, on the same cards</Switch>
          <button type="button" className="btn primary" onClick={dealLive}>Deal a new session</button>
        </div>
        {session && (
          <p className="rules-line">
            {session.source === 'replay' ? `Replaying session #${session.index + 1} from your results` : `Session #${session.index + 1}, seed ${session.seed}`}
            {` · ${rulesShort(session.rules)} · ${money(session.bank.start)} bankroll, ${money(session.bank.unit)} unit · ${session.hands.length < session.bank.rounds ? `${session.hands.length} of ` : ''}${session.bank.rounds.toLocaleString()} hands`}
            <span className="muted">{bank.rounds > MAX_TABLE_HANDS ? ` (the table plays at most ${MAX_TABLE_HANDS.toLocaleString()})` : ''}. Bankroll, hands and rules come from the settings panel.</span>
          </p>
        )}
      </div>

      <div className="table-layout">
        <div className="table-col">
          <div className="felt-wrap"><div className="felt" ref={feltRef} role="img" aria-label="Animated blackjack table" /></div>

          <div className="card playback">
            <div className="pb-buttons">
              <button type="button" className="icon-btn" title="First hand (Home)" aria-label="Restart" onClick={() => { pause(); seek(-1); }}><svg viewBox="0 0 24 24"><path d="M6 5v14M19 5l-9 7 9 7z" /></svg></button>
              <button type="button" className="icon-btn" title="Previous hand (Left arrow)" aria-label="Previous hand" onClick={() => { pause(); seek(pos - 1); }}><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg></button>
              <button type="button" className={`icon-btn primary${playing ? ' playing' : ''}`} title="Play or pause (Space)" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}>
                {playing ? <svg viewBox="0 0 24 24"><path d="M7 4h4v16H7zM14 4h4v16h-4z" /></svg> : <svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z" /></svg>}
              </button>
              <button type="button" className="icon-btn" title="Next hand (Right arrow)" aria-label="Next hand" onClick={step}><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg></button>
              <button type="button" className="icon-btn" title="Last hand (End)" aria-label="Last hand" onClick={() => { pause(); seek(N - 1); }}><svg viewBox="0 0 24 24"><path d="M18 5v14M5 5l9 7-9 7z" /></svg></button>
            </div>
            <input type="range" className="scrub" min={0} max={N} value={pos + 1} aria-label="Hand" onChange={(e) => { pause(); seek(Number(e.target.value) - 1); }} />
            <span className="pb-count">Hand {Math.max(counter, pos + 1)} / {N}</span>
            <Segmented label="Speed" size="small" value={speed} onChange={setSpeed}
              options={[{ value: 0.5, label: '0.5×' }, { value: 1, label: '1×' }, { value: 2, label: '2×' }, { value: 4, label: '4×' }, { value: 'turbo', label: 'Turbo' }]} />
          </div>

          {session && chartData && (
            <>
              <ChartCard title="Bankroll, hand by hand" sub="Click anywhere on the chart to jump to that hand."
                legend={[{ label: `${session.spec.name} (on the table)`, color: colorOf(session.spec.slot) }, ...chartData.others.map((o) => ({ label: o.spec.name, color: colorOf(o.spec.slot), opacity: 0.8 }))]}
                note={session.compare.length ? 'The others played the same seed and session, so they saw (nearly) the same cards. Only their bet sizes differ.' : undefined}
                table={{ columns: [{ label: 'Hand', num: true }, { label: 'Bankroll', num: true }, { label: 'Result', num: true }], rows: chartData.shown.map((x, i) => [i + 1, money(x.after), money(x.profit, { sign: true })]) }}>
                <LineChart ariaLabel="Bankroll after each hand" height={240} xTitle="Hand number" yTitle="Bankroll ($)" yFormat={(v) => money(v)} yZero
                  xDomain={[0, Math.max(1, N)]} hoverTitle={(x) => `Hand ${x}`} onClickX={(x) => { pause(); seek(Math.round(x) - 1); }}
                  refLines={[{ axis: 'y', value: session.bank.start }]}
                  series={[
                    ...chartData.others.map((o) => ({ id: o.spec.id, name: o.spec.name, color: colorOf(o.spec.slot), width: 1.5, opacity: 0.8, points: o.points })),
                    { id: 'main', name: session.spec.name, color: colorOf(session.spec.slot), width: 2.5, endDot: true, points: chartData.main },
                  ]} />
              </ChartCard>
              <ChartCard title="Bet size" sub="What the strategy wagered each hand, including doubles."
                legend={[{ label: 'Won', color: colorOf(session.spec.slot), kind: 'rect' }, { label: 'Lost', color: colorOf(session.spec.slot), kind: 'rect', opacity: 0.45 }, { label: 'Push', color: 'var(--neutral-mark)', kind: 'rect' }]}
                table={{ columns: [{ label: 'Hand', num: true }, { label: 'Bet', num: true }, { label: 'Doubled' }, { label: 'Result', num: true }], rows: chartData.shown.map((x, i) => [i + 1, money(x.bet), x.doubled ? 'yes' : '', money(x.profit, { sign: true })]) }}>
                <ColumnChart ariaLabel="Bet size each hand" height={200} yTitle="Bet ($)" xTitle="Hand number" yFormat={(v) => money(v)}
                  categories={session.hands.map((_, i) => String(i + 1))}
                  values={session.hands.map((x, i) => (i <= pos ? x.bet : null))}
                  colors={session.hands.map((x) => (x.profit > 0 ? colorOf(session.spec.slot) : x.profit < 0 ? `color-mix(in oklab, ${colorOf(session.spec.slot)} 45%, var(--surface))` : 'var(--neutral-mark)'))}
                  tips={session.hands.map((x, i) => ({ title: `Hand ${i + 1}`, rows: [{ label: x.doubled ? 'bet (doubled)' : 'bet', value: money(x.bet) }, { label: 'result', value: money(x.profit, { sign: true }) }] }))} />
              </ChartCard>
            </>
          )}
        </div>

        <aside className="table-side">
          <div className="card side-bankroll">
            <span className="eyebrow">Bankroll</span>
            <div className="big-number">{money(bankroll)}</div>
            <div className={`delta ${signClass(delta)}`}>{delta === 0 ? 'Even with the start' : `${delta > 0 ? '▲' : '▼'} ${money(delta, { sign: true })} vs start`}</div>
            <div className="mini-grid">
              <div><span>Bet</span><strong>{live.bet == null ? (session && pos >= N - 1 ? 'Done' : '-') : money(live.bet)}</strong></div>
              <div><span>Peak</span><strong>{money(st.peak)}</strong></div>
              <div><span>Max drawdown</span><strong>{money(st.dd)}</strong></div>
              <div><span>Wagered</span><strong>{money(st.wagered)}</strong></div>
            </div>
          </div>
          {session && (
            <div className="card side-strategy">
              <div className="side-head"><StrategyKey slot={session.spec.slot} /><strong><StrategyName spec={session.spec} /></strong></div>
              <p className="muted small">{about}</p>
              <div className="reason">
                <strong>{!h ? 'First bet' : pos >= N - 1 ? (h.after <= 0 ? 'Session over' : 'After the last hand') : `Next bet: ${money(h.nextBet)}`}</strong>
                {!h ? `${money(session.hands[0]?.stake ?? session.bank.unit)} to start.` : h.reason}
              </div>
            </div>
          )}
          <div className="card">
            <span className="eyebrow">Player decision</span>
            <div className="decision">
              {live.decision ? (
                <>{`${live.decision.soft && live.decision.total < 21 ? 'Soft' : 'Hard'} ${live.decision.total} vs ${live.decision.up}`}
                  <span className="act">{live.decision.action === 'DOUBLE' ? 'Double' : live.decision.action === 'HIT' ? 'Hit' : 'Stand'}</span></>
              ) : h && !h.decisions.length ? (h.phase === 'player_blackjack' ? 'Natural blackjack: no decision' : 'Dealer blackjack: no decision') : 'Waiting for the deal'}
            </div>
            {live.decision?.note && <p className="muted small">Wanted to double, but {live.decision.note}.</p>}
            <p className="muted small">Every strategy plays the same fixed basic strategy (no splits or surrender). Only bet sizing differs.</p>
          </div>
          <div className="card">
            <span className="eyebrow">Results so far</span>
            <div className="wlp">
              {([['Wins', st.w], ['Losses', st.l], ['Pushes', st.p], ['Blackjacks', st.bj]] as const).map(([l, v]) => <div key={l}><strong>{v}</strong><span>{l}</span></div>)}
            </div>
          </div>
          <div className="card">
            <span className="eyebrow">Shoe</span>
            <div className="shoe-meter"><i style={{ width: `${(live.remaining / total) * 100}%` }} /></div>
            <div className="mini-grid">
              <div><span>Cards left</span><strong>{live.remaining} of {total}</strong></div>
              <div><span>Hi-Lo running</span><strong>{live.rc > 0 ? '+' : ''}{live.rc}</strong></div>
              <div><span>True count</span><strong>{tc > 0 ? '+' : ''}{tc.toFixed(1)}</strong></div>
              <div><span>Reshuffles</span><strong>{session?.continuous ? 'every hand' : st.shuffles}</strong></div>
            </div>
            <p className="muted small">The count is shown for learning only; the simulated player ignores it.</p>
          </div>
          <div className="card history-card">
            <span className="eyebrow">Hand history</span>
            <ol className="history">
              {!session || pos < 0 ? <li className="muted empty">No hands played yet</li> : session.hands.slice(Math.max(0, pos - 199), pos + 1).reverse().map((x) => {
                const i = x.index - 1;
                return (
                  <li key={i} className={i === pos ? 'current' : ''} title={`${handLabel(x.player.slice(0, 2))} vs ${x.dealer[0]}`}>
                    <button type="button" onClick={() => { pause(); seek(i); }}>
                      <span className="hn">#{i + 1}</span>
                      <span className="cards">{x.player.join(' ')}  vs  {x.dealer.join(' ')}{x.doubled ? '  (double)' : ''}</span>
                      <span className={`res ${signClass(x.profit)}`}>{x.profit === 0 ? 'push' : money(x.profit, { sign: true })}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
