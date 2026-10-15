// Slide-out explainer: how a strategy works, plus a mini table that plays it with coaching pop-ups
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Bankroll, CustomStrategy, HandLog, Rules, StrategySpec } from '../engine/types';
import { DEMO_OUTCOMES, demoBets, fmtUnits } from '../engine/strategies';
import { guideFor, pickDemo, quickTest, type QuickStats } from '../lib/guides';
import { describeStep, type CoachLine } from '../lib/coach';
import { colorOf } from '../lib/registry';
import { money, pct, signClass } from '../lib/format';
import { ABORT, Felt, type Hooks } from './felt';
import { Segmented, StrategyKey } from './ui';

const reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Kind = 'win' | 'lose' | 'push' | 'info';

interface Props {
  spec: StrategySpec | null;
  rules: Rules;
  bank: Bankroll;
  selected: boolean;
  canSelect: boolean;
  onToggle: (id: string, on: boolean) => void;
  onWatch: (spec: StrategySpec, seed: number) => void;
  onEdit: (c: CustomStrategy) => void;
  onClose: () => void;
}

export function StrategyDrawer(p: Props) {
  // keep the last strategy mounted while the drawer slides closed
  const [shown, setShown] = useState<StrategySpec | null>(p.spec);
  const [open, setOpen] = useState(false);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (p.spec) {
      if (!shown) returnFocus.current = document.activeElement as HTMLElement | null;
      setShown(p.spec);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
      return () => cancelAnimationFrame(raf);
    }
    if (shown) {
      setOpen(false);
      const t = setTimeout(() => { setShown(null); returnFocus.current?.focus(); }, 340);
      return () => clearTimeout(t);
    }
  }, [p.spec]);

  useEffect(() => {
    if (!shown) return;
    closeBtn.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') p.onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [shown?.id]);

  if (!shown) return null;
  const spec = shown;
  const custom = spec.def.kind === 'custom' ? spec.def.def : null;
  return (
    <>
      <div className={`drawer-backdrop${open ? ' open' : ''}`} onMouseDown={p.onClose} />
      <aside className={`drawer${open ? ' open' : ''}`} role="dialog" aria-modal="true" aria-labelledby="drawer-title" style={{ borderTopColor: colorOf(spec.slot) }}>
        <header className="drawer-head">
          <div>
            <span className="eyebrow">{custom ? 'Your strategy' : 'Betting strategy'}</span>
            <h2 id="drawer-title"><StrategyKey slot={spec.slot} />{spec.name}</h2>
          </div>
          <button ref={closeBtn} type="button" className="icon-btn close" aria-label="Close" onClick={p.onClose}>
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <DrawerBody key={spec.id} spec={spec} rules={p.rules} bank={p.bank} open={open} />
        <footer className="drawer-foot">
          {custom && <button type="button" className="btn ghost" onClick={() => p.onEdit(custom)}>Edit strategy</button>}
          <button type="button" className="btn" disabled={!p.selected && !p.canSelect} onClick={() => p.onToggle(spec.id, !p.selected)}
            title={!p.selected && !p.canSelect ? 'Untick a strategy first: up to 8 at once' : undefined}>
            {p.selected ? 'Remove from comparison' : 'Add to comparison'}
          </button>
          <button type="button" className="btn primary" onClick={() => p.onWatch(spec, pickDemo(spec.def, p.rules, p.bank).seed)}>Watch a full session</button>
        </footer>
      </aside>
    </>
  );
}

function DrawerBody({ spec, rules, bank, open }: { spec: StrategySpec; rules: Rules; bank: Bankroll; open: boolean }) {
  const guide = useMemo(() => guideFor(spec.def), [spec]);
  const bets = useMemo(() => demoBets(spec.def), [spec]);
  const peak = Math.max(1, ...bets);
  const [quick, setQuick] = useState<{ mine: QuickStats; flat: QuickStats } | null>(null);
  useEffect(() => {
    // after the slide-in, so the animation stays smooth
    const t = setTimeout(() => setQuick(quickTest(spec.def, rules, bank)), 380);
    return () => clearTimeout(t);
  }, [spec, rules, bank]);
  const isFlat = spec.def.kind === 'builtin' && spec.def.key === 'flat';
  return (
    <div className="drawer-body">
      <p className="drawer-summary">{guide.summary}</p>

      <MiniTable spec={spec} rules={rules} bank={bank} start={open} />

      <section className="drawer-section">
        <h3>How it plays</h3>
        <dl className="how">
          {guide.how.map((r) => <div key={r.when}><dt>{r.when}</dt><dd>{r.then}</dd></div>)}
        </dl>
        {guide.notes.length > 0 && <ul className="rules-list">{guide.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      </section>

      <section className="drawer-section">
        <h3>Bet pattern</h3>
        <div className="demo" role="img" aria-label={`Units bet over a sample run: ${bets.map(fmtUnits).join(', ')}`}>
          <div className="demo-bars">
            {bets.map((b, i) => (
              <span key={i} title={`Hand ${i + 1}: ${DEMO_OUTCOMES[i]}, ${fmtUnits(b)} units`}>
                <i style={{ height: `${Math.max(4, (b / peak) * 100)}%`, background: colorOf(spec.slot) }} />
                <em>{DEMO_OUTCOMES[i]}</em>
              </span>
            ))}
          </div>
          <span className="help">Units bet over a sample run of wins (W), losses (L) and pushes (P). Peak: {fmtUnits(peak)} units.</span>
        </div>
      </section>

      <div className="pros-cons">
        <section className="pros"><h3>Why people like it</h3><ul>{guide.likes.map((l) => <li key={l}>{l}</li>)}</ul></section>
        <section className="cons"><h3>The catch</h3><ul>{guide.catches.map((l) => <li key={l}>{l}</li>)}</ul></section>
      </div>

      <section className="drawer-section">
        <h3>Quick test on your settings</h3>
        {quick ? (
          <table className="data quick">
            <thead><tr><th /><th className="num">{spec.name}</th>{!isFlat && <th className="num">Flat</th>}</tr></thead>
            <tbody>
              <tr><td>Average session</td><td className={`num ${signClass(quick.mine.mean)}`}>{money(quick.mine.mean, { sign: true, cents: Math.abs(quick.mine.mean) < 10 })}</td>
                {!isFlat && <td className={`num ${signClass(quick.flat.mean)}`}>{money(quick.flat.mean, { sign: true, cents: Math.abs(quick.flat.mean) < 10 })}</td>}</tr>
              <tr><td>Finished ahead</td><td className="num">{pct(quick.mine.ahead, 0)}</td>{!isFlat && <td className="num">{pct(quick.flat.ahead, 0)}</td>}</tr>
              <tr><td>Went broke</td><td className="num">{pct(quick.mine.ror, 1)}</td>{!isFlat && <td className="num">{pct(quick.flat.ror, 1)}</td>}</tr>
              <tr><td>Bad day (worst 5%)</td><td className="num">{money(quick.mine.worst)}</td>{!isFlat && <td className="num">{money(quick.flat.worst)}</td>}</tr>
            </tbody>
          </table>
        ) : <p className="help">Testing...</p>}
        <p className="help">400 sessions of up to 100 hands with your current rules, {money(bank.start)} bankroll and {money(bank.unit)} unit.</p>
      </section>
    </div>
  );
}

type Pace = 1 | 2 | 'learn';
const animSpeed = (p: Pace) => (p === 2 ? 2.5 : 1.25);

function MiniTable({ spec, rules, bank, start }: { spec: StrategySpec; rules: Rules; bank: Bankroll; start: boolean }) {
  const feltRef = useRef<HTMLDivElement>(null);
  const felt = useRef<Felt | null>(null);
  const demo = useMemo(() => pickDemo(spec.def, rules, bank), [spec, rules, bank]);
  const [run, setRun] = useState(0);
  const [paused, setPaused] = useState(false);
  const [pace, setPace] = useState<Pace>(reducedMotion ? 'learn' : 1);
  const [waiting, setWaiting] = useState(false);
  const [stepNo, setStepNo] = useState(0);
  const [status, setStatus] = useState({ hand: 0, bankroll: bank.start, bet: demo.hands[0]?.stake ?? bank.unit, done: false });
  const [tips, setTips] = useState<{ n: number; title: string; text: string; kind: Kind }[]>([]);
  const pausedRef = useRef(paused);
  const paceRef = useRef(pace);
  const release = useRef<(() => void) | null>(null);
  const tipId = useRef(0);

  // learning mode: each step waits here until "Next step"
  const next = useCallback(() => {
    const r = release.current;
    release.current = null;
    setWaiting(false);
    r?.();
  }, []);

  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => {
    paceRef.current = pace;
    if (felt.current) felt.current.speed = animSpeed(pace);
    feltRef.current?.classList.toggle('learning', pace === 'learn');
    if (pace !== 'learn') next();          // leaving learning mode lets the demo carry on by itself
  }, [pace, next]);

  useEffect(() => {
    if (pace !== 'learn') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, select, textarea, [role="radio"]')) return;
      if ((e.key === ' ' || e.key === 'Enter') && t.closest('button, a')) return;
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); next(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pace, next]);

  useEffect(() => {
    if (!start || !feltRef.current) return;
    const f = new Felt(feltRef.current);
    felt.current = f;
    f.setRules(rules);
    f.speed = animSpeed(paceRef.current);
    feltRef.current.classList.toggle('learning', paceRef.current === 'learn');
    let alive = true;
    const t = { get aborted() { return !alive; } };
    const nap = async (ms: number) => { await sleep(ms); if (!alive) throw ABORT; };
    const hold = async () => { while (pausedRef.current && paceRef.current !== 'learn') await nap(120); };
    const addTip = (line: CoachLine) => setTips((ts) => [{ n: ++tipId.current, ...line }, ...ts].slice(0, 5));
    /** In learning mode: show the explanation and wait. Returns false when the demo runs by itself. */
    const stop = async (line: CoachLine) => {
      if (paceRef.current !== 'learn') return false;
      f.coach(line.text, line.kind, line.title);
      addTip(line);
      setStepNo((n) => n + 1);
      await new Promise<void>((res) => { release.current = res; setWaiting(true); });
      if (!alive) throw ABORT;
      return true;
    };
    let current: HandLog | null = null;
    let betReason = '';
    const hooks: Hooks = {
      bet: (b) => setStatus((s) => ({ ...s, bet: b })), dealt: () => {}, revealed: () => {}, decision: () => {},
      gate: async (s) => { if (current) await stop(describeStep(s, current, rules, betReason)); },
    };
    setTips([]);
    setStepNo(0);
    setStatus({ hand: 0, bankroll: bank.start, bet: demo.hands[0]?.stake ?? bank.unit, done: false });
    (async () => {
      try {
        const first = demo.hands[0];
        betReason = `Every session opens with ${money(first?.stake ?? bank.unit)}${first && first.stake !== bank.unit ? ` (${fmtUnits(first.stake / bank.unit)} units)` : ''}.`;
        if (paceRef.current !== 'learn') {
          f.coach(betReason, 'info', 'Opening bet');
          addTip({ title: 'Opening bet', text: betReason, kind: 'info' });
          await nap(1700);
        }
        for (let i = 0; i < demo.hands.length; i++) {
          await hold();
          const h = demo.hands[i];
          current = h;
          f.speed = animSpeed(paceRef.current);
          await f.clearTable(t);
          f.coach(null);
          setStatus((s) => ({ ...s, hand: i + 1, bankroll: h.before, bet: h.stake }));
          await f.playHand(h, i, hooks, t);
          setStatus((s) => ({ ...s, bankroll: h.after, bet: h.nextBet }));
          const kind: Kind = h.profit > 0 ? 'win' : h.profit < 0 ? 'lose' : 'push';
          const last = i === demo.hands.length - 1 || h.after <= 0;
          const line: CoachLine = { title: `${f.resultText(h)[0]} · ${last ? 'demo over' : `next bet ${money(h.nextBet)}`}`, text: h.reason, kind };
          if (!(await stop(line))) {
            f.coach(line.text, line.kind, line.title);
            addTip(line);
            await nap(Math.max(1400, 2800 / (paceRef.current === 2 ? 2 : 1)));
          }
          const nextStake = demo.hands[i + 1]?.stake;
          betReason = nextStake == null ? h.reason : `${spec.name} puts ${money(nextStake)} down: the bet it picked after the last hand${nextStake === bank.unit ? '' : ` (${fmtUnits(nextStake / bank.unit)} units)`}. Watch what happens to it.`;
          if (h.after <= 0) break;
        }
        const end = demo.hands[demo.hands.length - 1];
        f.coach(null);
        f.message('Demo over', `${money(end?.after ?? bank.start)} after ${demo.hands.length} hands · press Replay`);
        setStatus((s) => ({ ...s, done: true }));
      } catch (e) {
        if (e !== ABORT) console.error(e);
      }
    })();
    return () => { alive = false; release.current?.(); release.current = null; setWaiting(false); f.reset(); };
  }, [demo, run, start]);

  const learning = pace === 'learn';
  const restart = () => { setPaused(false); setRun((r) => r + 1); };
  return (
    <section className="mini-table">
      <div className="felt-wrap"><div className="felt" ref={feltRef} role="img" aria-label={`Mini table playing ${spec.name}`} /></div>
      <div className="mini-strip">
        <span className="mini-status">
          Hand <strong>{status.hand}</strong> of {demo.hands.length} · Bankroll <strong className={signClass(status.bankroll - bank.start)}>{money(status.bankroll)}</strong> · Bet <strong>{money(status.bet)}</strong>
        </span>
        <span className="mini-controls">
          {learning && !status.done ? (
            <button type="button" className="btn primary small next-step" disabled={!waiting} onClick={next} aria-keyshortcuts="ArrowRight">
              Next step <span aria-hidden="true">→</span>
            </button>
          ) : (
            <button type="button" className="btn small" onClick={() => (status.done ? restart() : setPaused(!paused))}>
              {status.done ? 'Replay' : paused ? 'Play' : 'Pause'}
            </button>
          )}
          {!status.done && <button type="button" className="btn ghost small" onClick={restart}>Restart</button>}
          <Segmented label="Pace" size="small" value={pace} onChange={(v) => { if (v === 'learn') setPaused(false); setPace(v); }}
            options={[{ value: 1, label: '1×' }, { value: 2, label: '2×' }, { value: 'learn', label: 'Learn' }]} />
        </span>
      </div>
      {learning && !status.done && (
        <p className="learn-hint">
          <strong>Learning mode</strong> · step {stepNo}: read the bubble on the table, then press <kbd>Next step</kbd> or <kbd>→</kbd>.
          Each hand stops at the bet, the deal, every decision, the dealer&apos;s turn and the result.
        </p>
      )}
      <ol className="coach-log" aria-live="polite" aria-label="What the strategy is doing">
        {tips.map((t) => (
          <li key={t.n} className={t.kind}>
            <strong>{t.title}</strong>
            <span>{t.text}</span>
          </li>
        ))}
      </ol>
      <p className="help">A {demo.hands.length}-hand demo (seed {demo.seed}) on your current rules and bankroll, picked because it shows how {spec.name} reacts to winning and losing runs.</p>
    </section>
  );
}
