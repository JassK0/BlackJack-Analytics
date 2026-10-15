import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { CustomStrategy, StrategySpec } from './engine/types';
import type { RunResult, Weights } from './engine/stats';
import { DEFAULT_WEIGHTS } from './engine/stats';
import { DEFAULT_BANKROLL, DEFAULT_RULES, MAX_TOTAL_HANDS, rulesShort, sanitizeBankroll, sanitizeRules } from './engine/rules';
import { DEFAULT_OPTIONS, sanitizeCustom } from './engine/strategies';
import { randomSeed } from './engine/rng';
import { allSpecs, builtinId, MAX_COMPARE, nextCustomSlot, withSlots } from './lib/registry';
import { load, saveHistory, usePersisted } from './lib/storage';
import { useSimulation } from './lib/useSimulation';
import { compact, dateTime, duration, money } from './lib/format';
import { ConfigPanel, type Settings } from './components/ConfigPanel';
import { StrategyBuilder } from './components/StrategyBuilder';
import { LiveRun, ModeSlider } from './components/LiveRun';
import { NoBS } from './components/NoBS';
import { InDepth } from './components/InDepth';
import { TableView, type ReplayRequest } from './components/TableView';
import { History } from './components/History';
import { StrategyDrawer } from './components/StrategyDrawer';
import { ExplainContext } from './components/StrategyName';
import { DailyShoe } from './components/DailyShoe';
import { playedToday } from './game/daily';

// the roguelite is its own little app, so it only loads when someone opens its tab
const Conquer = lazy(() => import('./components/conquer/Conquer'));
const Stakes = lazy(() => import('./components/stakes/Stakes'));

const HANDS_PER_SECOND = 1_200_000;      // measured in Node; browsers land in the same range
const HISTORY_KEY = 'bja.history';

const DEFAULT_SETTINGS: Settings = {
  rules: DEFAULT_RULES, bank: DEFAULT_BANKROLL, seed: 42,
  selected: ['flat', 'martingale', 'paroli', '1326', 'oscars_grind'].map((k) => builtinId(k as never)),
  options: DEFAULT_OPTIONS,
};

function cleanSettings(s: Settings): Settings {
  return {
    rules: sanitizeRules(s?.rules || {}),
    bank: sanitizeBankroll(s?.bank || {}),
    seed: s?.seed == null || !Number.isFinite(Number(s.seed)) ? null : Math.round(Number(s.seed)),
    selected: Array.isArray(s?.selected) ? s.selected.filter((x) => typeof x === 'string').slice(0, MAX_COMPARE) : DEFAULT_SETTINGS.selected,
    options: { ...DEFAULT_OPTIONS, ...(s?.options || {}) },
  };
}

const cleanWeights = (w: Weights): Weights => {
  const out = { ...DEFAULT_WEIGHTS };
  for (const k of Object.keys(out) as (keyof Weights)[]) if (w && Number.isFinite(w[k])) out[k] = Math.max(0, Math.min(1, w[k]));
  return out;
};

type Tab = 'results' | 'table' | 'history' | 'daily' | 'conquer' | 'stakes';

export default function App() {
  const [theme, setTheme] = usePersisted<'light' | 'dark' | null>('bja.theme', null);
  const [settings, setSettings] = usePersisted<Settings>('bja.settings', DEFAULT_SETTINGS, cleanSettings);
  const [customs, setCustoms] = usePersisted<CustomStrategy[]>('bja.custom', [], (l) => (Array.isArray(l) ? l.map(sanitizeCustom) : []));
  const [mode, setMode] = usePersisted<'nobs' | 'indepth'>('bja.mode', 'nobs');
  const [weights, setWeights] = usePersisted<Weights>('bja.weights', DEFAULT_WEIGHTS, cleanWeights);
  const [tab, setTab] = useState<Tab>('results');
  const [history, setHistory] = useState<RunResult[]>(() => { const h = load<RunResult[]>(HISTORY_KEY, []); return Array.isArray(h) ? h : []; });
  const [builder, setBuilder] = useState<{ editing: CustomStrategy | null } | null>(null);
  const [replay, setReplay] = useState<ReplayRequest | null>(null);
  const [tableOpened, setTableOpened] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [explaining, setExplaining] = useState<StrategySpec | null>(null);
  const [dailyDone, setDailyDone] = useState(() => playedToday());
  const onDailyStatus = useCallback((done: boolean) => setDailyDone(done), []);

  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
  }, [theme]);

  const onDone = useCallback((r: RunResult) => setHistory((h) => saveHistory(HISTORY_KEY, [r, ...h.filter((x) => x.id !== r.id)], 6)), []);
  const sim = useSimulation(onDone);

  const specs = useMemo(() => allSpecs(settings.options, customs), [settings.options, customs]);
  const selected = useMemo(() => withSlots(specs.filter((s) => settings.selected.includes(s.id))), [specs, settings.selected]);
  const listSpecs = useMemo(() => specs.map((s) => selected.find((x) => x.id === s.id) ?? s), [specs, selected]);
  const totalHands = settings.bank.sessions * settings.bank.rounds * selected.length;

  const problems: string[] = [];
  if (!selected.length) problems.push('Pick at least one strategy to compare.');
  if (settings.bank.unit > settings.bank.start) problems.push("The base unit can't be bigger than the bankroll.");
  if (settings.rules.tableMax != null && settings.rules.tableMax < settings.bank.unit) problems.push("The table max can't be below the base unit.");
  if (totalHands > MAX_TOTAL_HANDS) problems.push(`That's ${compact(totalHands)} hands; keep a run under ${compact(MAX_TOTAL_HANDS)}.`);

  const configKey = JSON.stringify([settings.rules, settings.bank, settings.seed, selected]);
  // a run matches the settings when everything but a random seed is the same
  const matchesSettings = (r: RunResult) =>
    JSON.stringify([r.config.rules, r.config.bank, settings.seed == null ? null : r.config.seed, r.config.strategies]) === configKey;

  const run = () => {
    if (problems.length) return;
    sim.run({ rules: settings.rules, bank: settings.bank, seed: settings.seed ?? randomSeed(), strategies: selected });
  };

  // show the latest saved result straight away
  useEffect(() => { if (history[0]) sim.show(history[0]); }, []);

  const update = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));

  const saveCustom = (c: CustomStrategy) => {
    const exists = customs.some((x) => x.id === c.id);
    setCustoms(exists ? customs.map((x) => (x.id === c.id ? c : x)) : [...customs, c]);
    const id = `c:${c.id}`;
    if (!settings.selected.includes(id) && settings.selected.length < MAX_COMPARE) update({ selected: [...settings.selected, id] });
    setBuilder(null);
  };
  const deleteCustom = (c: CustomStrategy) => {
    if (!confirm(`Delete "${c.name}"? This can't be undone.`)) return;
    setCustoms(customs.filter((x) => x.id !== c.id));
    update({ selected: settings.selected.filter((x) => x !== `c:${c.id}`) });
  };

  const toggleSelected = (id: string, on: boolean) => {
    const set = new Set(settings.selected);
    if (on && set.size >= MAX_COMPARE) return;
    if (on) set.add(id); else set.delete(id);
    update({ selected: specs.map((x) => x.id).filter((x) => set.has(x)) });
  };

  // the drawer explains the strategy as it's defined now (a result's snapshot if it no longer exists)
  const explained = explaining ? listSpecs.find((s) => s.id === explaining.id) ?? explaining : null;
  const watchDemo = (spec: StrategySpec, seed: number) => {
    const others = selected.filter((s) => s.id !== spec.id);
    setReplay({ config: { rules: settings.rules, bank: settings.bank, seed, strategies: withSlots([spec, ...others]) },
      specId: spec.id, session: 0, nonce: Date.now(), origin: 'explainer' });
    setExplaining(null);
    setTab('table');
    setTableOpened(true);
    window.scrollTo({ top: 0 });
  };

  const watch = (result: RunResult) => (id: string, session: number) => {
    setReplay({ config: result.config, specId: id, session, nonce: Date.now(), origin: 'results' });
    setTab('table');
    setTableOpened(true);
    window.scrollTo({ top: 0 });
  };

  const result = sim.result;
  const running = sim.status === 'running';
  const showLive = running && sim.live && (!result || sim.live.elapsedMs > 350);
  // results only change when you press Run; until then, flag that they're from older settings
  const stale = !!result && !running && !matchesSettings(result);
  const estimateMs = (totalHands / HANDS_PER_SECOND) * 1000;
  const effectiveTheme = theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  return (
    <ExplainContext.Provider value={setExplaining}>
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32"><rect x="4" y="3" width="19" height="26" rx="3" /><path d="M13.5 9c2.8 3.6 5.5 4.7 5.5 7.4a2.8 2.8 0 0 1-4.6 2.1l.9 3.8h-3.6l.9-3.8A2.8 2.8 0 0 1 8 16.4C8 13.7 10.7 12.6 13.5 9z" /></svg>
          </span>
          <span className="brand-text"><strong>Blackjack Analytics</strong><span>Monte Carlo strategy simulator</span></span>
        </div>
        <nav className="tabs" aria-label="Views">
          {([['results', 'Results'], ['table', 'Live table'], ['history', 'History'], ['daily', 'Daily Shoe'], ['conquer', 'Count & Conquer'], ['stakes', 'Twenty-One Stakes']] as const).map(([k, l]) => (
            <button key={k} type="button" className={tab === k ? 'active' : ''} aria-current={tab === k ? 'page' : undefined}
              onClick={() => { setTab(k); if (k === 'table') setTableOpened(true); }}>
              {l}{k === 'daily' && !dailyDone && <i className="tab-dot" aria-label="today's shoe is waiting" />}
            </button>
          ))}
        </nav>
        <button type="button" className="btn ghost small theme" aria-label={`Switch to ${effectiveTheme === 'dark' ? 'light' : 'dark'} mode`}
          onClick={() => setTheme(effectiveTheme === 'dark' ? 'light' : 'dark')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
          <span className="theme-label">{effectiveTheme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>
      </header>

      <div className={`layout${tab === 'daily' || tab === 'conquer' || tab === 'stakes' ? ' solo' : ''}`}>
        {tab !== 'daily' && tab !== 'conquer' && tab !== 'stakes' && <aside className={`side${panelOpen ? ' open' : ''}`}>
          <button type="button" className="side-toggle" aria-expanded={panelOpen} onClick={() => setPanelOpen(!panelOpen)}>
            <span><strong>Settings</strong>{` ${selected.length} strateg${selected.length === 1 ? 'y' : 'ies'} · ${rulesShort(settings.rules)}`}</span>
            <i aria-hidden="true" />
          </button>
          <ConfigPanel settings={settings} update={update} specs={listSpecs} customs={customs}
            onNew={() => setBuilder({ editing: null })} onEdit={(c) => setBuilder({ editing: c })} onDelete={deleteCustom}
            onRun={() => { run(); setTab('results'); }} onCancel={sim.cancel} running={running}
            progress={sim.live && sim.live.total ? sim.live.done / sim.live.total : 0}
            problems={problems} totalHands={totalHands} estimateMs={estimateMs} stale={stale || (!result && !running)} />
        </aside>}

        <main className="main">
          {tab === 'results' && (
            <div className="results">
              <aside className="disclaimer" aria-label="Disclaimer">
                <span className="disclaimer-tag">TL;DR</span>
                <p>
                  <strong>The house always wins.</strong> These systems don't beat blackjack; they just pick how you lose: slowly, all at once,
                  or after a really fun hour. Not financial advice. If it were, the advice would be "don't."
                </p>
              </aside>
              <div className="results-head">
                <div>
                  <h1>Which betting strategy holds up?</h1>
                  <p className="sub">
                    {result
                      ? `${result.strategies.length} strategies · ${rulesShort(result.config.rules)} · ${money(result.config.bank.start)} bankroll, ${money(result.config.bank.unit)} unit · ${result.config.bank.sessions.toLocaleString()} sessions × ${result.config.bank.rounds} hands · seed ${result.config.seed} · ${compact(result.totalHands)} hands in ${duration(result.elapsedMs)} · ${dateTime(result.createdAt)}`
                      : 'Pick strategies and rules on the left. Results appear here as soon as the simulation finishes.'}
                  </p>
                </div>
                <ModeSlider value={mode} onChange={setMode} />
              </div>
              {stale && (
                <p className="notice">
                  You've changed the settings since this run, so these results are from the old ones.{' '}
                  <button type="button" className="link-btn" onClick={run} disabled={problems.length > 0}>Run simulation</button> to update them.
                </p>
              )}
              {sim.error && <p className="notice error" role="alert">The simulation failed: {sim.error}</p>}
              {showLive && sim.live && <LiveRun live={sim.live} />}
              {result ? (
                <div className={running ? 'stale-frame' : ''}>
                  {mode === 'nobs'
                    ? <NoBS result={result} weights={weights} onWatch={watch(result)} />
                    : <InDepth result={result} weights={weights} setWeights={setWeights} onWatch={watch(result)} />}
                </div>
              ) : !running && (
                <div className="empty-state card">
                  <h2>No results yet</h2>
                  <p>Pick a few strategies and press Run simulation.</p>
                  <button type="button" className="btn primary" onClick={run} disabled={problems.length > 0}>Run simulation</button>
                </div>
              )}
            </div>
          )}

          <div hidden={tab !== 'table'}>
            {tableOpened && (
              <TableView active={tab === 'table'} specs={listSpecs} selectedIds={settings.selected} rules={settings.rules}
                bank={settings.bank} request={replay} />
            )}
          </div>

          {tab === 'daily' && <DailyShoe onStatus={onDailyStatus} />}

          {tab === 'conquer' && (
            <Suspense fallback={<div className="empty-state card"><p>Shuffling up…</p></div>}>
              <Conquer />
            </Suspense>
          )}

          {tab === 'stakes' && (
            <Suspense fallback={<div className="empty-state card"><p>Shuffling up…</p></div>}>
              <Stakes />
            </Suspense>
          )}

          {tab === 'history' && (
            <History runs={history} current={result?.id ?? null}
              onOpen={(r) => { sim.show(r); setTab('results'); }}
              onDelete={(r) => setHistory((h) => saveHistory(HISTORY_KEY, h.filter((x) => x.id !== r.id), 6))}
              onClear={() => { if (confirm('Delete every saved run from this browser?')) setHistory(saveHistory(HISTORY_KEY, [], 6)); }} />
          )}
        </main>
      </div>

      {builder && (
        <StrategyBuilder initial={builder.editing} slot={builder.editing?.slot ?? nextCustomSlot(customs)} rules={settings.rules} bank={settings.bank}
          onSave={saveCustom} onClose={() => setBuilder(null)} />
      )}
      <StrategyDrawer spec={explained} rules={settings.rules} bank={settings.bank}
        selected={!!explained && settings.selected.includes(explained.id)} canSelect={settings.selected.length < MAX_COMPARE}
        onToggle={toggleSelected} onWatch={watchDemo} onClose={() => setExplaining(null)}
        onEdit={(c) => { setExplaining(null); setBuilder({ editing: c }); }} />
    </div>
    </ExplainContext.Provider>
  );
}
