// Create or edit a custom betting strategy, with a live preview and a quick test run
import { useEffect, useMemo, useState } from 'react';
import type { Adjust, Bankroll, CustomStrategy, Rules } from '../engine/types';
import { DEFAULT_OPTIONS, DEMO_OUTCOMES, demoBets, describeCustom, fmtUnits, newCustom, sanitizeCustom, TEMPLATES } from '../engine/strategies';
import { simulate } from '../engine/simulate';
import { money, pct, signClass } from '../lib/format';
import { Field, Modal, NumberField, Segmented } from './ui';

type Choice = 'reset' | 'keep' | 'multiply' | 'add' | 'subtract' | 'forward' | 'back';

const PROGRESSION: { value: Choice; label: string }[] = [
  { value: 'keep', label: 'Keep the same bet' }, { value: 'reset', label: 'Back to the starting bet' },
  { value: 'multiply', label: 'Multiply the bet by' }, { value: 'add', label: 'Add units' }, { value: 'subtract', label: 'Remove units' },
];
const SEQUENCE: { value: Choice; label: string }[] = [
  { value: 'keep', label: 'Stay on this step' }, { value: 'reset', label: 'Back to step 1' },
  { value: 'forward', label: 'Move forward' }, { value: 'back', label: 'Move back' },
];

function toChoice(a: Adjust): { choice: Choice; value: number } {
  if (a.kind === 'add') return a.value >= 0 ? { choice: 'add', value: a.value } : { choice: 'subtract', value: -a.value };
  if (a.kind === 'step') return a.value >= 0 ? { choice: 'forward', value: a.value } : { choice: 'back', value: -a.value };
  if (a.kind === 'multiply') return { choice: 'multiply', value: a.value };
  return { choice: a.kind, value: 1 };
}
function fromChoice(c: Choice, v: number): Adjust {
  switch (c) {
    case 'multiply': return { kind: 'multiply', value: v };
    case 'add': return { kind: 'add', value: v };
    case 'subtract': return { kind: 'add', value: -v };
    case 'forward': return { kind: 'step', value: Math.round(v) };
    case 'back': return { kind: 'step', value: -Math.round(v) };
    default: return { kind: c };
  }
}

function AdjustRow({ label, value, mode, onChange }: { label: string; value: Adjust; mode: CustomStrategy['mode']; onChange: (a: Adjust) => void }) {
  const { choice, value: n } = toChoice(value);
  const opts = mode === 'sequence' ? SEQUENCE : PROGRESSION;
  const needsNum = ['multiply', 'add', 'subtract', 'forward', 'back'].includes(choice);
  const unitWord = choice === 'multiply' ? '×' : choice === 'forward' || choice === 'back' ? 'steps' : 'units';
  return (
    <div className="adjust-row">
      <span className="adjust-label">{label}</span>
      <select value={choice} aria-label={label} onChange={(e) => {
        const c = e.target.value as Choice;
        onChange(fromChoice(c, c === 'multiply' ? 2 : c === 'back' && mode === 'sequence' ? 2 : 1));
      }}>
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {needsNum && (
        <span className="adjust-num">
          <NumberField value={n} integer={choice === 'forward' || choice === 'back'} min={choice === 'multiply' ? 0.1 : 1} max={choice === 'multiply' ? 10 : 1000}
            step={choice === 'multiply' ? 0.5 : 1} ariaLabel={`${label} amount`} onChange={(v) => v != null && onChange(fromChoice(choice, v))} />
          <em>{unitWord}</em>
        </span>
      )}
    </div>
  );
}

interface Props {
  initial: CustomStrategy | null;
  slot: number;
  rules: Rules;
  bank: Bankroll;
  onSave: (c: CustomStrategy) => void;
  onClose: () => void;
}

export function StrategyBuilder({ initial, slot, rules, bank, onSave, onClose }: Props) {
  const [d, setD] = useState<CustomStrategy>(() => initial ? { ...initial } : newCustom('dalembert', slot));
  const [seqText, setSeqText] = useState(() => d.sequence.map(fmtUnits).join(', '));
  const [quick, setQuick] = useState<null | { mine: { mean: number; ror: number; ahead: number; worst: number }; flat: { mean: number; ror: number; ahead: number; worst: number } }>(null);
  const set = (patch: Partial<CustomStrategy>) => setD((p) => sanitizeCustom({ ...p, ...patch }));
  const clean = useMemo(() => sanitizeCustom(d), [d]);
  const lines = describeCustom(clean);
  const bets = demoBets({ kind: 'custom', def: clean });
  const maxBet = Math.max(1, ...bets);

  // a quick 400-session test against flat betting, on the current rules, so changes have visible consequences
  useEffect(() => {
    const t = setTimeout(() => {
      const quickBank = { ...bank, sessions: 400, rounds: Math.min(bank.rounds, 100) };
      const res = simulate({
        rules, bank: quickBank, seed: 7, strategies: [
          { id: 'mine', name: clean.name, slot: clean.slot, def: { kind: 'custom', def: clean } },
          { id: 'flat', name: 'Flat', slot: 0, def: { kind: 'builtin', key: 'flat', options: DEFAULT_OPTIONS } },
        ],
      });
      const pick = (i: number) => { const r = res.strategies[i]; return { mean: r.meanNet, ror: r.riskOfRuin, ahead: r.pProfit, worst: r.p05 }; };
      setQuick({ mine: pick(0), flat: pick(1) });
    }, 250);
    return () => clearTimeout(t);
  }, [clean, rules, bank]);

  const applyTemplate = (key: string) => {
    const t = newCustom(key, d.slot);
    const next = { ...t, id: d.id };
    setD(next);
    setSeqText(next.sequence.map(fmtUnits).join(', '));
  };

  return (
    <Modal title={initial ? `Edit ${initial.name}` : 'Create a strategy'} onClose={onClose} footer={
      <>
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" onClick={() => onSave(clean)}>{initial ? 'Save changes' : 'Add strategy'}</button>
      </>
    }>
      <div className="builder">
        <div className="builder-form">
          {!initial && (
            <div className="field">
              <span className="label">Start from</span>
              <div className="chip-row">
                {TEMPLATES.map((t) => (
                  <button key={t.key} type="button" className="chip" title={t.blurb} onClick={() => applyTemplate(t.key)}>{t.name}</button>
                ))}
              </div>
            </div>
          )}
          <Field label="Name" htmlFor="b-name">
            <input id="b-name" type="text" value={d.name} maxLength={40} onChange={(e) => setD({ ...d, name: e.target.value })} />
          </Field>
          <Field label="How the bet moves">
            <Segmented label="How the bet moves" value={d.mode} onChange={(mode) => {
              const reset: Adjust = { kind: 'reset' }, keep: Adjust = { kind: 'keep' };
              set(mode === 'sequence'
                ? { mode, onWin: reset, onLoss: { kind: 'step', value: 1 }, onPush: keep }
                : { mode, onWin: reset, onLoss: { kind: 'multiply', value: 2 }, onPush: keep });
            }} options={[{ value: 'progression', label: 'Raise and lower' }, { value: 'sequence', label: 'Follow a sequence' }]} />
          </Field>
          {d.mode === 'progression' ? (
            <Field label="Starting bet (units)" htmlFor="b-start" help={`1 unit = ${money(bank.unit)} at your current settings.`}>
              <NumberField id="b-start" value={d.startUnits} integer={false} min={0.5} max={100000} step={0.5} onChange={(v) => v != null && set({ startUnits: v })} />
            </Field>
          ) : (
            <Field label="Sequence (units per step)" htmlFor="b-seq" help="Comma-separated, e.g. 1, 2, 3, 5, 8.">
              <input id="b-seq" type="text" value={seqText} onChange={(e) => {
                setSeqText(e.target.value);
                const nums = e.target.value.split(/[\s,;]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0);
                if (nums.length) set({ sequence: nums });
              }} />
              <Segmented label="Past the last step" size="small" value={d.sequenceEnd} onChange={(v) => set({ sequenceEnd: v })}
                options={[{ value: 'stay', label: 'Stay on the last step' }, { value: 'wrap', label: 'Start over' }]} />
            </Field>
          )}
          <div className="field">
            <span className="label">After each result</span>
            <AdjustRow label="Win" value={d.onWin} mode={d.mode} onChange={(a) => set({ onWin: a })} />
            <AdjustRow label="Loss" value={d.onLoss} mode={d.mode} onChange={(a) => set({ onLoss: a })} />
            <AdjustRow label="Push" value={d.onPush} mode={d.mode} onChange={(a) => set({ onPush: a })} />
          </div>
          <div className="grid-2-tight">
            <Field label="Smallest bet (units)" htmlFor="b-min">
              <NumberField id="b-min" value={d.minUnits} integer={false} min={0.5} max={100000} step={0.5} onChange={(v) => v != null && set({ minUnits: v })} />
            </Field>
            <Field label="Biggest bet (units, 0 = none)" htmlFor="b-max">
              <NumberField id="b-max" value={d.maxUnits} integer={false} min={0} max={1000000} onChange={(v) => v != null && set({ maxUnits: v })} />
            </Field>
            <Field label="Reset after wins in a row" htmlFor="b-rw" help="0 = never">
              <NumberField id="b-rw" value={d.resetAfterWins} min={0} max={50} onChange={(v) => v != null && set({ resetAfterWins: v })} />
            </Field>
            <Field label="Reset after losses in a row" htmlFor="b-rl" help="0 = never">
              <NumberField id="b-rl" value={d.resetAfterLosses} min={0} max={50} onChange={(v) => v != null && set({ resetAfterLosses: v })} />
            </Field>
            <Field label="Walk away when up (units)" htmlFor="b-sw" help="0 = play every hand">
              <NumberField id="b-sw" value={d.stopWin} integer={false} min={0} max={1000000} onChange={(v) => v != null && set({ stopWin: v })} />
            </Field>
            <Field label="Walk away when down (units)" htmlFor="b-sl" help="0 = play every hand">
              <NumberField id="b-sl" value={d.stopLoss} integer={false} min={0} max={1000000} onChange={(v) => v != null && set({ stopLoss: v })} />
            </Field>
          </div>
        </div>

        <aside className="builder-preview">
          <h3>In plain English</h3>
          <ul className="rules-list">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
          <h3>How it bets</h3>
          <div className="demo" role="img" aria-label={`Units bet per hand: ${bets.map(fmtUnits).join(', ')}`}>
            <div className="demo-bars">
              {bets.map((b, i) => (
                <span key={i} title={`Hand ${i + 1}: ${DEMO_OUTCOMES[i]}, ${fmtUnits(b)} units`}>
                  <i style={{ height: `${Math.max(4, (b / maxBet) * 100)}%`, background: `var(--s${clean.slot})` }} />
                  <em>{DEMO_OUTCOMES[i]}</em>
                </span>
              ))}
            </div>
            <span className="help">Units bet over a sample run of wins (W), losses (L) and pushes (P). Peak: {fmtUnits(maxBet)} units.</span>
          </div>
          <h3>Quick test</h3>
          {quick ? (
            <table className="data quick">
              <thead><tr><th /><th className="num">{clean.name}</th><th className="num">Flat</th></tr></thead>
              <tbody>
                <tr><td>Average session</td><td className={`num ${signClass(quick.mine.mean)}`}>{money(quick.mine.mean, { sign: true })}</td><td className={`num ${signClass(quick.flat.mean)}`}>{money(quick.flat.mean, { sign: true })}</td></tr>
                <tr><td>Finished ahead</td><td className="num">{pct(quick.mine.ahead, 0)}</td><td className="num">{pct(quick.flat.ahead, 0)}</td></tr>
                <tr><td>Went broke</td><td className="num">{pct(quick.mine.ror, 1)}</td><td className="num">{pct(quick.flat.ror, 1)}</td></tr>
                <tr><td>Bad day (worst 5%)</td><td className="num">{money(quick.mine.worst)}</td><td className="num">{money(quick.flat.worst)}</td></tr>
              </tbody>
            </table>
          ) : <p className="help">Testing...</p>}
          <p className="help">400 sessions of up to 100 hands on your current rules and bankroll. Add it to run the full comparison.</p>
        </aside>
      </div>
    </Modal>
  );
}
