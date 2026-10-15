// Twenty-One Stakes: the sidebar and the charm/consumable row, shared by every in-run screen
import { createContext, useContext, useEffect, useState, type CSSProperties } from 'react';
import { BOSSES, STAGE_INFO, STAGES, WIN_ANTE, type Consumable } from '../../stakes/data';
import { bossFor, targetFor, type RunState } from '../../stakes/engine';
import { moveCharm, sellCharm, sellCons, sellValue } from '../../stakes/run';
import { stakesSound } from '../../stakes/audio';
import { CharmCard, ConsCard, type Pop } from './Cards';

export const StakesUI = createContext<{ openInfo: () => void; openOptions: () => void }>({ openInfo: () => {}, openOptions: () => {} });
export interface Live { label: string; level: number | null; chips: number; mult: number; hot: boolean; hint?: string }

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : Math.round(n).toLocaleString('en-US'));
const fmtMult = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(n < 10 ? 2 : 1).replace(/0+$/, '').replace(/\.$/, ''));

/** Numbers that tick up toward their target instead of jumping. */
function useTicker(value: number) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (shown === value) return;
    const from = shown, start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / 420);
      setShown(Math.round(from + (value - from) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return shown;
}

export function Sidebar({ run, live, roundScore }: { run: RunState; live?: Live; roundScore?: number }) {
  const ui = useContext(StakesUI);
  // the finished table stays in view at cash out; elsewhere the sidebar previews the next table
  const t = run.screen === 'table' || run.screen === 'cashout' ? run.table : null;
  const playing = run.screen === 'table';
  const stage = t ? t.stage : STAGES[Math.min(2, run.stage)];
  const boss = stage === 'boss' ? BOSSES[t?.boss ?? bossFor(run, run.ante)] : null;
  const target = t ? t.target : targetFor(run.ante, stage);
  const score = useTicker(roundScore ?? (t ? t.score : 0));
  const title = run.screen === 'won' ? 'Victory!' : run.screen === 'shop' ? 'The Shop' : run.screen === 'select' ? 'Choose a table' : run.screen === 'cashout' ? 'Cash out' : boss ? boss.name : STAGE_INFO[stage].name;
  const color = boss ? boss.color : stage === 'high' ? '#3c7bff' : '#2fa36b';
  return (
    <aside className="sk-side" style={{ '--sc': color } as CSSProperties}>
      <div className="sk-side-head">
        <span className="sk-side-title">{boss && t ? <span aria-hidden="true">{boss.icon} </span> : null}{title}</span>
        {t ? (
          <div className="sk-target">
            <span>Score at least</span>
            <b>{fmt(target)}</b>
            <small>Reward: {'$'.repeat(STAGE_INFO[stage].reward)}</small>
          </div>
        ) : run.screen === 'won' ? <div className="sk-target"><span>You cleared</span><b>Ante {run.ante}</b><small>Every table beaten</small></div> : <div className="sk-target"><span>Next table</span><b>{fmt(target)}</b><small>{STAGE_INFO[stage].name}{boss ? ` · ${boss.name}` : ''}</small></div>}
        {boss && t && <p className="sk-side-boss">{boss.text}</p>}
      </div>
      {t && (
        <div className="sk-roundscore"><span>Round score</span><b>{fmt(score)}</b></div>
      )}
      {t && playing && (
        <div className={`sk-handbox${live?.hot ? ' hot' : ''}`}>
          <div className="sk-handname">{live?.label ? <>{live.label}{live.level ? <small> lvl.{live.level}</small> : null}{live.hint ? <em> {live.hint}</em> : null}</> : <span className="sk-dim">Deal to play</span>}</div>
          <div className="sk-cm">
            <span className="sk-chips">{fmt(live?.chips ?? 0)}</span>
            <span className="sk-x">×</span>
            <span className="sk-mult">{fmtMult(live?.mult ?? 0)}</span>
          </div>
        </div>
      )}
      <div className="sk-stats">
        {t && playing && <div className="sk-stat blue"><span>Hands</span><b>{t.handsLeft}</b></div>}
        {t && playing && <div className="sk-stat red"><span>Redraws</span><b>{t.redrawsLeft}</b></div>}
        <div className="sk-stat money wide"><span>Money</span><b>${run.money}</b></div>
        <div className="sk-stat"><span>Ante</span><b>{run.ante}<small>/{WIN_ANTE}</small></b></div>
        <div className="sk-stat"><span>Table</span><b>{Math.min(3, (t ? STAGES.indexOf(t.stage) : run.stage) + 1)}<small>/3</small></b></div>
      </div>
      <div className="sk-side-btns">
        <button type="button" className="sk-btn red small" onClick={ui.openInfo}>Run info</button>
        <button type="button" className="sk-btn orange small" onClick={ui.openOptions}>Options</button>
      </div>
    </aside>
  );
}

export function Inventory({ run, setRun, charmPop, offUid, onUse, usable, targeting }: {
  run: RunState; setRun: (fn: (r: RunState) => RunState) => void; charmPop?: (uid: number) => (Pop | null); offUid?: number | null;
  onUse: (c: Consumable) => void; usable: (c: Consumable) => { ok: boolean; why?: string }; targeting?: number | null;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const close = () => setOpen(null);
  useEffect(() => {
    if (open == null) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open]);
  return (
    <div className="sk-inv">
      <div className="sk-charms" aria-label="Charms">
        <div className="sk-slots">
          {run.charms.map((c, i) => {
            const p = charmPop?.(c.uid) ?? null;
            return (
              <CharmCard key={c.uid} c={c} i={i} active={open === c.uid} pop={p} jiggle={p ? p.key : undefined} off={offUid === c.uid} sell={sellValue(c)}
                onClick={() => { setOpen(open === c.uid ? null : c.uid); stakesSound.play('select'); }}>
                {open === c.uid && (
                  <div className="sk-actions-pop">
                    <button type="button" className="sk-btn small grey" onClick={() => { setRun((r) => moveCharm(r, c.uid, -1)); }} disabled={i === 0} aria-label="Move left">◀</button>
                    <button type="button" className="sk-btn small green" onClick={() => { setRun((r) => sellCharm(r, c.uid)); stakesSound.play('money'); close(); }}>Sell ${sellValue(c)}</button>
                    <button type="button" className="sk-btn small grey" onClick={() => { setRun((r) => moveCharm(r, c.uid, 1)); }} disabled={i === run.charms.length - 1} aria-label="Move right">▶</button>
                  </div>
                )}
              </CharmCard>
            );
          })}
          {Array.from({ length: Math.max(0, run.charmSlots - run.charms.length) }, (_, i) => <span key={`e${i}`} className="sk-empty-slot" aria-hidden="true" />)}
        </div>
        <span className="sk-slot-count">{run.charms.length}/{run.charmSlots} charms{run.charms.length > 1 ? ' · left to right' : ''}</span>
      </div>
      <div className="sk-cons" aria-label="Consumables">
        <div className="sk-slots">
          {run.cons.map((c, i) => {
            const u = usable(c);
            return (
              <ConsCard key={c.uid} c={c} i={i} active={open === c.uid || targeting === c.uid} onClick={() => { setOpen(open === c.uid ? null : c.uid); stakesSound.play('select'); }}>
                {open === c.uid && (
                  <div className="sk-actions-pop">
                    <button type="button" className="sk-btn small orange" disabled={!u.ok} title={u.why} onClick={() => { onUse(c); close(); }}>Use</button>
                    <button type="button" className="sk-btn small green" onClick={() => { setRun((r) => sellCons(r, c.uid)); stakesSound.play('money'); close(); }}>Sell $1</button>
                    {!u.ok && u.why && <span className="sk-why">{u.why}</span>}
                  </div>
                )}
              </ConsCard>
            );
          })}
          {Array.from({ length: Math.max(0, run.consSlots - run.cons.length) }, (_, i) => <span key={`c${i}`} className="sk-empty-slot small" aria-hidden="true" />)}
        </div>
        <span className="sk-slot-count">{run.cons.length}/{run.consSlots}</span>
      </div>
    </div>
  );
}

export { fmt, fmtMult };
