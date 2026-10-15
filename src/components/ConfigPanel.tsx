// Left-hand settings: which strategies to compare, house rules, bankroll and run size
import { useState } from 'react';
import type { Bankroll, BuiltinOptions, CustomStrategy, Rules, StrategySpec } from '../engine/types';
import { BUILTIN_OPTION_FIELDS, BUILTINS, summarize } from '../engine/strategies';
import { PRESETS, rulesMatch, SIZES } from '../engine/rules';
import { MAX_COMPARE } from '../lib/registry';
import { compact, duration, money } from '../lib/format';
import { Field, NumberField, Segmented, StrategyKey, Switch } from './ui';
import { StrategyName } from './StrategyName';

export interface Settings {
  rules: Rules;
  bank: Bankroll;
  seed: number | null;
  selected: string[];
  options: BuiltinOptions;
}

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  specs: StrategySpec[];
  customs: CustomStrategy[];
  onNew: () => void;
  onEdit: (c: CustomStrategy) => void;
  onDelete: (c: CustomStrategy) => void;
  onRun: () => void;
  onCancel: () => void;
  running: boolean;
  progress: number;
  problems: string[];
  totalHands: number;
  estimateMs: number;
  stale: boolean;
}

export function ConfigPanel(p: Props) {
  const { settings: s, update } = p;
  const [openOpts, setOpenOpts] = useState<string | null>(null);
  const rules = (patch: Partial<Rules>) => {
    const next = { ...s.rules, ...patch };
    next.cutCard = Math.min(next.cutCard, next.decks * 52);
    update({ rules: next });
  };
  const bank = (patch: Partial<Bankroll>) => update({ bank: { ...s.bank, ...patch } });
  const toggle = (id: string, on: boolean) => {
    const set = new Set(s.selected);
    if (on) set.add(id); else set.delete(id);
    update({ selected: p.specs.map((x) => x.id).filter((x) => set.has(x)) });
  };
  const full = s.selected.length >= MAX_COMPARE;
  const pen = 1 - s.rules.cutCard / (s.rules.decks * 52);

  return (
    <div className="config">
      <details className="panel-section" open>
        <summary><h2>Compare strategies</h2><span className="count">{s.selected.length} of {p.specs.length}</span></summary>
        <p className="help list-hint">Tick to compare. Click a name to see how it plays.</p>
        <ul className="strategy-list">
          {p.specs.map((spec) => {
            const on = s.selected.includes(spec.id);
            const builtin = spec.def.kind === 'builtin' ? spec.def.key : null;
            const opts = builtin ? BUILTIN_OPTION_FIELDS.filter((f) => f.strategy === builtin) : [];
            const custom = spec.def.kind === 'custom' ? spec.def.def : null;
            return (
              <li key={spec.id} className={on ? 'on' : ''}>
                <div className="pick">
                  <label className="pick-check">
                    <input type="checkbox" checked={on} disabled={!on && full} aria-label={`Compare ${spec.name}`} onChange={(e) => toggle(spec.id, e.target.checked)} />
                    <StrategyKey slot={spec.slot} />
                  </label>
                  <span className="pick-text">
                    <strong><StrategyName spec={spec} />{custom && <em className="tag">custom</em>}</strong>
                    <span>{builtin ? BUILTINS.find((b) => b.key === builtin)!.summary : summarize(spec.def)}</span>
                  </span>
                </div>
                <div className="pick-actions">
                  {opts.length > 0 && (
                    <button type="button" className="link-btn" aria-expanded={openOpts === spec.id} onClick={() => setOpenOpts(openOpts === spec.id ? null : spec.id)}>Options</button>
                  )}
                  {custom && <button type="button" className="link-btn" onClick={() => p.onEdit(custom)}>Edit</button>}
                  {custom && <button type="button" className="link-btn danger" onClick={() => p.onDelete(custom)}>Delete</button>}
                </div>
                {openOpts === spec.id && (
                  <div className="pick-opts">
                    {opts.map((f) => f.type === 'bool' ? (
                      <Switch key={f.key} checked={!!s.options[f.key]} onChange={(v) => update({ options: { ...s.options, [f.key]: v } })}>{f.label}</Switch>
                    ) : (
                      <label key={f.key} className="inline-num">{f.label}
                        <NumberField value={Number(s.options[f.key])} min={f.min!} max={f.max!} onChange={(v) => v != null && update({ options: { ...s.options, [f.key]: v } })} />
                      </label>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {full && <p className="help">Up to {MAX_COMPARE} at once, one colour each. Untick one to add another.</p>}
        <button type="button" className="btn create" onClick={p.onNew}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Create your own strategy
        </button>
      </details>

      <details className="panel-section" open>
        <summary><h2>House rules</h2></summary>
        <div className="chip-row">
          {PRESETS.map((pr) => {
            const active = rulesMatch(pr.rules, s.rules);
            return (
              <button key={pr.key} type="button" className={`chip${active ? ' active' : ''}`} aria-pressed={active} title={pr.blurb}
                onClick={() => update({ rules: { ...pr.rules }, ...(pr.bankroll ? { bank: { ...s.bank, ...pr.bankroll } } : {}) })}>
                {pr.name}
              </button>
            );
          })}
        </div>
        <Field label="Decks" output={s.rules.decks} htmlFor="f-decks">
          <input id="f-decks" type="range" min={1} max={8} value={s.rules.decks} onChange={(e) => rules({ decks: Number(e.target.value) })} />
        </Field>
        <Field label="Reshuffle at (cards left)" output={pen > 0 ? `${Math.round(pen * 100)}% dealt` : 'every hand'} htmlFor="f-cut">
          <NumberField id="f-cut" value={s.rules.cutCard} min={20} max={s.rules.decks * 52} onChange={(v) => v != null && rules({ cutCard: v })} />
        </Field>
        <Field label="Dealer on soft 17">
          <Segmented label="Dealer on soft 17" value={s.rules.hitSoft17 ? 'h' : 's'} onChange={(v) => rules({ hitSoft17: v === 'h' })}
            options={[{ value: 's', label: 'Stands' }, { value: 'h', label: 'Hits' }]} />
        </Field>
        <Field label="Hole card">
          <Segmented label="Hole card" value={s.rules.holeCard ? 'peek' : 'enhc'} onChange={(v) => rules({ holeCard: v === 'peek' })}
            options={[{ value: 'peek', label: 'US peek' }, { value: 'enhc', label: 'No hole card' }]} />
        </Field>
        <Field label="Blackjack pays">
          <Segmented label="Blackjack pays" value={s.rules.blackjackPays} onChange={(v) => rules({ blackjackPays: v })}
            options={[{ value: 1.5, label: '3:2' }, { value: 1.2, label: '6:5' }, { value: 1, label: '1:1' }]} />
        </Field>
        <Switch checked={s.rules.allowDouble} onChange={(v) => rules({ allowDouble: v })}>Double down allowed</Switch>
        <Field label="Table max bet ($)" htmlFor="f-tmax">
          <div className="inline">
            <NumberField id="f-tmax" value={s.rules.tableMax} min={1} max={1e9} disabled={s.rules.tableMax == null}
              onChange={(v) => v != null && rules({ tableMax: v })} />
            <Switch checked={s.rules.tableMax == null} onChange={(v) => rules({ tableMax: v ? null : 500 })}>No limit</Switch>
          </div>
        </Field>
      </details>

      <details className="panel-section" open>
        <summary><h2>Bankroll and size</h2></summary>
        <div className="grid-2-tight">
          <Field label="Bankroll ($)" htmlFor="f-start">
            <NumberField id="f-start" value={s.bank.start} min={1} max={1e9} onChange={(v) => v != null && bank({ start: v })} />
          </Field>
          <Field label="Base unit ($)" htmlFor="f-unit">
            <NumberField id="f-unit" value={s.bank.unit} min={1} max={1e8} onChange={(v) => v != null && bank({ unit: v })} />
          </Field>
          <Field label="Hands / session" htmlFor="f-rounds">
            <NumberField id="f-rounds" value={s.bank.rounds} min={1} max={5000} onChange={(v) => v != null && bank({ rounds: v })} />
          </Field>
          <Field label="Sessions each" htmlFor="f-sessions">
            <NumberField id="f-sessions" value={s.bank.sessions} min={1} max={200000} onChange={(v) => v != null && bank({ sessions: v })} />
          </Field>
        </div>
        <div className="chip-row">
          {SIZES.map((z) => {
            const active = z.sessions === s.bank.sessions && z.rounds === s.bank.rounds;
            return (
              <button key={z.label} type="button" className={`chip${active ? ' active' : ''}`} aria-pressed={active}
                onClick={() => bank({ sessions: z.sessions, rounds: z.rounds })}>
                <strong>{z.label}</strong> {compact(z.sessions)} × {z.rounds}
              </button>
            );
          })}
        </div>
        <Field label="Seed" htmlFor="f-seed" help="Same seed, same cards. Empty = new random cards every run.">
          <div className="inline">
            <NumberField id="f-seed" value={s.seed} min={0} max={2 ** 31 - 1} allowEmpty placeholder="random" onChange={(v) => update({ seed: v })} />
            <button type="button" className="btn ghost small" onClick={() => update({ seed: Math.floor(Math.random() * 1e6) })}>New</button>
          </div>
        </Field>
      </details>

      <div className="run-box">
        <div className="estimate">
          <strong>{compact(p.totalHands)} hands</strong>
          <span>{`${s.selected.length} strateg${s.selected.length === 1 ? 'y' : 'ies'} · about ${duration(p.estimateMs)} · ${money(s.bank.start)} bankroll`}</span>
        </div>
        {p.problems.length > 0 && <p className="form-error" role="alert">{p.problems.join(' ')}</p>}
        {p.stale && !p.running && p.problems.length === 0 && <p className="pending"><i aria-hidden="true" />Settings changed. Run to update the results.</p>}
        {p.running ? (
          <div className="running">
            <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.progress * 100)}>
              <i style={{ width: `${p.progress * 100}%` }} />
            </div>
            <button type="button" className="btn" onClick={p.onCancel}>Cancel</button>
          </div>
        ) : (
          <button type="button" className="btn primary big" disabled={p.problems.length > 0} onClick={p.onRun}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" /></svg>
            Run simulation
          </button>
        )}
        <p className="help">Runs in your browser. Results are kept only in this browser's local storage.</p>
      </div>
    </div>
  );
}
