// "In-depth" mode: KPIs, tunable leaderboard, comparison charts and a per-strategy breakdown
import { useState } from 'react';
import type { RunResult, StrategyResult, Weights, WeightKey } from '../engine/stats';
import { DEFAULT_WEIGHTS, STAKE_BUCKETS } from '../engine/stats';
import { HEAT_ROWS, UPCARDS } from '../engine/cards';
import { BUILTINS, DEMO_OUTCOMES, demoBets, describeCustom, fmtUnits } from '../engine/strategies';
import { rulesShort } from '../engine/rules';
import { ChartCard } from '../charts/ChartCard';
import { LineChart } from '../charts/LineChart';
import { BoxChart, ColumnChart, DotRangeChart, Heatmap, HeatLegend, ScatterChart, StackedBarChart } from '../charts/BarCharts';
import { rank, referenceEdge, type Ranked } from '../lib/insights';
import { colorOf } from '../lib/registry';
import { compact, duration, money, num, pct, signClass } from '../lib/format';
import { ConvergenceCharts } from './LiveRun';
import { Segmented, StrategyKey } from './ui';
import { StrategyName } from './StrategyName';

interface Props {
  result: RunResult;
  weights: Weights;
  setWeights: (w: Weights) => void;
  onWatch: (id: string, session: number) => void;
}

export function InDepth({ result, weights, setWeights, onWatch }: Props) {
  const ranked = rank(result, weights);
  const [focus, setFocus] = useState<string>(ranked[0].id);
  const focused = result.strategies.find((s) => s.id === focus) || result.strategies[0];
  const conv: Record<string, StrategyResult['convergence']> = {};
  const paths: Record<string, number[][]> = {};
  for (const s of result.strategies) { conv[s.id] = s.convergence; paths[s.id] = s.paths; }
  return (
    <div className="indepth">
      <Kpis result={result} ranked={ranked} />
      <Leaderboard ranked={ranked} weights={weights} setWeights={setWeights} />
      <h2 className="section-title">Across strategies</h2>
      <AcrossCharts result={result} />
      <h2 className="section-title">Strategy breakdown</h2>
      <div className="filter-row">
        <Segmented label="Strategy to break down" value={focused.id} onChange={setFocus}
          options={result.strategies.map((s) => ({ value: s.id, label: <><i className="key line" style={{ background: colorOf(s.slot) }} />{s.name}</> }))} />
      </div>
      <DeepDive r={focused} result={result} onWatch={onWatch} />
      <h2 className="section-title">How the simulation converged</h2>
      <ConvergenceCharts config={result.config} convergence={conv} paths={paths} />
    </div>
  );
}

// ------------------------------------------------------------------ KPIs

function Kpi({ label, value, sub, slot }: { label: string; value: string; sub?: string; slot?: number }) {
  return (
    <div className="kpi">
      <span className="label">{label}</span>
      <span className="value">{slot != null && <StrategyKey slot={slot} />}{value}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

function Kpis({ result, ranked }: { result: RunResult; ranked: Ranked[] }) {
  const e = referenceEdge(result);
  const top = ranked[0];
  const riskiest = [...result.strategies].sort((a, b) => b.riskOfRuin - a.riskOfRuin)[0];
  const kelly = Math.max(...result.strategies.map((s) => s.kellyBet));
  return (
    <div className="kpi-row">
      <Kpi label="Hands simulated" value={compact(result.totalHands)} sub={`${result.totalSessions.toLocaleString()} sessions in ${duration(result.elapsedMs)}`} />
      <Kpi label="House edge" value={pct(-e.edge, 2)} sub={`per $1 bet (${e.name.toLowerCase()}) · 95% CI ${pct(-e.hi, 1)} to ${pct(-e.lo, 1)}`} />
      <Kpi label="Top ranked" value={top.name} slot={top.slot} sub={`score ${top.liveScore.toFixed(2)} · ${money(top.meanNet, { sign: true })} per session`} />
      {riskiest.riskOfRuin > 0
        ? <Kpi label="Most likely to go broke" value={riskiest.name} slot={riskiest.slot} sub={`${pct(riskiest.riskOfRuin)} of sessions lost everything`} />
        : <Kpi label="Went broke" value="Never" sub="no session lost the whole bankroll" />}
      <Kpi label="Kelly-optimal bet" value={money(kelly)} sub={kelly > 0 ? 'a measured edge is positive (check its CI)' : 'every edge is negative'} />
    </div>
  );
}

// ------------------------------------------------------------ leaderboard

const WEIGHT_LABELS: Record<WeightKey, [string, string]> = {
  meanNet: ['Mean net', 'higher is better'], evPerHand: ['EV per hand', 'higher is better'],
  stdNet: ['Volatility', 'lower is better'], riskOfRuin: ['Risk of ruin', 'lower is better'],
  meanDrawdown: ['Avg drawdown', 'lower is better'], winRate: ['Win rate', 'higher is better'],
};

type Col = { key: string; label: string; num?: boolean; val: (r: Ranked) => number | string; cell: (r: Ranked) => React.ReactNode; asc?: boolean };
const COLS: Col[] = [
  { key: 'rank', label: 'Rank', num: true, val: (r) => r.liveRank, asc: true, cell: (r) => <span className={`rank-badge${r.liveRank === 1 ? ' first' : ''}`}>{r.liveRank}</span> },
  { key: 'name', label: 'Strategy', val: (r) => r.name, asc: true, cell: (r) => <span className="strat-cell"><StrategyKey slot={r.slot} /><StrategyName spec={r.spec} /></span> },
  { key: 'score', label: 'Score', val: (r) => r.liveScore, cell: (r) => <span className="score-cell"><span className="mini-bar"><i style={{ width: `${Math.max(2, r.liveScore * 100)}%`, background: colorOf(r.slot) }} /></span>{r.liveScore.toFixed(3)}</span> },
  { key: 'mean', label: 'Mean net', num: true, val: (r) => r.meanNet, cell: (r) => <><span className={signClass(r.meanNet)}>{money(r.meanNet, { sign: true })}</span><span className="ci">± {money((r.ciHigh - r.ciLow) / 2)}</span></> },
  { key: 'median', label: 'Median', num: true, val: (r) => r.medianNet, cell: (r) => <span className={signClass(r.medianNet)}>{money(r.medianNet, { sign: true })}</span> },
  { key: 'std', label: 'Std dev', num: true, val: (r) => r.stdNet, asc: true, cell: (r) => money(r.stdNet) },
  { key: 'win', label: 'Win rate', num: true, val: (r) => r.winRate, cell: (r) => pct(r.winRate) },
  { key: 'ahead', label: 'Ahead', num: true, val: (r) => r.pProfit, cell: (r) => pct(r.pProfit) },
  { key: 'ror', label: 'Risk of ruin', num: true, val: (r) => r.riskOfRuin, asc: true, cell: (r) => <span className={r.riskOfRuin > 0 ? 'neg' : ''}>{pct(r.riskOfRuin)}</span> },
  { key: 'dd', label: 'Avg drawdown', num: true, val: (r) => r.meanDrawdown, asc: true, cell: (r) => money(r.meanDrawdown) },
  { key: 'ev', label: 'EV / hand', num: true, val: (r) => r.evPerHand, cell: (r) => <span className={signClass(r.evPerHand)}>{money(r.evPerHand, { sign: true, cents: true })}</span> },
  { key: 'edge', label: 'Edge / $1', num: true, val: (r) => r.edge, cell: (r) => <span className={signClass(r.edge)}>{pct(r.edge, 2, { sign: true })}</span> },
  { key: 'stake', label: 'Avg bet', num: true, val: (r) => r.avgStake, cell: (r) => money(r.avgStake) },
];

function Leaderboard({ ranked, weights, setWeights }: { ranked: Ranked[]; weights: Weights; setWeights: (w: Weights) => void }) {
  const [sort, setSort] = useState<{ key: string; asc: boolean }>({ key: 'rank', asc: true });
  const [open, setOpen] = useState(false);
  const col = COLS.find((c) => c.key === sort.key) || COLS[0];
  const rows = [...ranked].sort((a, b) => {
    const x = col.val(a), y = col.val(b);
    return (x < y ? -1 : x > y ? 1 : 0) * (sort.asc ? 1 : -1);
  });
  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const click = (c: Col) => setSort(sort.key === c.key ? { key: c.key, asc: !sort.asc } : { key: c.key, asc: !!c.asc });
  return (
    <section className="card">
      <div className="card-head row">
        <div>
          <h3>Leaderboard</h3>
          <p>Ranked by a weighted, min-max scaled composite (as <code>analyze.py</code> does). Click a column to sort.</p>
        </div>
        <button type="button" className="btn ghost small" aria-expanded={open} onClick={() => setOpen(!open)}>Tune weights</button>
      </div>
      {open && (
        <div className="weights">
          {(Object.keys(WEIGHT_LABELS) as WeightKey[]).map((k) => (
            <div className="w" key={k}>
              <label htmlFor={`w-${k}`}>{WEIGHT_LABELS[k][0]}<output>{Math.round((weights[k] / total) * 100)}%</output></label>
              <input id={`w-${k}`} type="range" min={0} max={100} step={5} value={Math.round(weights[k] * 100)}
                onChange={(e) => setWeights({ ...weights, [k]: Number(e.target.value) / 100 })} />
              <span className="dir">{WEIGHT_LABELS[k][1]}</span>
            </div>
          ))}
          <div className="foot">
            <span>Weights are normalized to 100%. The No BS ranking uses the same weights.</span>
            <button type="button" className="btn ghost small" onClick={() => setWeights({ ...DEFAULT_WEIGHTS })}>Reset to defaults</button>
          </div>
        </div>
      )}
      <div className="table-wrap">
        <table className="data leaderboard">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} className={`sortable${c.num ? ' num' : ''}`} aria-sort={sort.key === c.key ? (sort.asc ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => click(c)}>{c.label}{sort.key === c.key ? (sort.asc ? ' ↑' : ' ↓') : ''}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => <tr key={r.id}>{COLS.map((c) => <td key={c.key} className={c.num ? 'num' : ''}>{c.cell(r)}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------- comparisons

function AcrossCharts({ result }: { result: RunResult }) {
  const S = result.strategies;
  const legend = S.map((s) => ({ label: s.name, color: colorOf(s.slot) }));
  const h = result.hist;
  const anyBust = S.some((s) => s.riskOfRuin > 0);
  const edgeOverlap = Math.max(...S.map((s) => s.edgeLow)) <= Math.min(...S.map((s) => s.edgeHigh));
  return (
    <div className="grid-2">
      <ChartCard title="Distribution of session results" legend={legend}
        sub="Share of sessions by net win or loss. Progressive systems trade many small wins for rare big losses."
        table={{ columns: [{ label: 'Net (bin centre)', num: true }, ...S.map((s) => ({ label: s.name, num: true }))], rows: h.centers.map((c, i) => [money(c), ...S.map((s) => pct(h.series[s.id][i]))]) }}>
        <LineChart ariaLabel="Distribution of session results by strategy" height={290} xTitle="Session net result ($)" yTitle="Share of sessions (%)"
          xFormat={(v) => money(v)} yFormat={(v) => `${v}%`} valueFormat={(v) => `${v.toFixed(1)}%`} hoverTitle={(x) => `Net about ${money(x)}`} yZero
          refLines={[{ axis: 'x', value: 0, label: 'break even' }]}
          series={S.map((s) => ({ id: s.id, name: s.name, color: colorOf(s.slot), step: true, points: h.centers.map((c, i) => [c, h.series[s.id][i] * 100] as [number, number]) }))} />
      </ChartCard>

      <ChartCard title="Risk vs return" sub="Average session result (with 95% CI) against volatility. Up and to the left is better."
        table={{ columns: [{ label: 'Strategy' }, { label: 'Mean net', num: true }, { label: '95% CI', num: true }, { label: 'Std dev', num: true }, { label: 'Risk of ruin', num: true }],
          rows: S.map((s) => [s.name, money(s.meanNet, { sign: true, cents: true }), `${money(s.ciLow)} to ${money(s.ciHigh)}`, money(s.stdNet), pct(s.riskOfRuin)]) }}>
        <ScatterChart ariaLabel="Mean session result against volatility" height={290} xTitle="Volatility: std dev of session result ($)" yTitle="Mean net ($)"
          xFormat={(v) => money(v)} yFormat={(v) => money(v)}
          points={S.map((s) => ({
            label: s.name, color: colorOf(s.slot), x: s.stdNet, y: s.meanNet, yLo: s.ciLow, yHi: s.ciHigh,
            tip: { title: s.name, rows: [{ label: 'mean per session', value: money(s.meanNet, { sign: true, cents: true }) }, { label: 'std dev', value: money(s.stdNet) }, { label: 'risk of ruin', value: pct(s.riskOfRuin) }] },
          }))} />
      </ChartCard>

      <ChartCard title="Still in the game" legend={legend} sub="Share of sessions with money left at each hand."
        note={anyBust ? undefined : 'No session went broke, so every line stays at 100%.'}
        table={{ columns: [{ label: 'Hand', num: true }, ...S.map((s) => ({ label: s.name, num: true }))], rows: result.xs.map((x, i) => [x, ...S.map((s) => pct(s.traj.survival[i]))]) }}>
        <LineChart ariaLabel="Share of sessions still solvent by hand" height={270} xTitle="Hand number" yTitle="Still solvent (%)"
          yDomain={[0, 100]} yFormat={(v) => `${v}%`} valueFormat={(v) => `${v.toFixed(1)}%`} hoverTitle={(x) => `Hand ${x}`}
          series={S.map((s) => ({ id: s.id, name: s.name, color: colorOf(s.slot), points: result.xs.map((x, i) => [x, s.traj.survival[i] * 100] as [number, number]) }))} />
      </ChartCard>

      <ChartCard title="Edge per $1 staked" sub="Each strategy's measured edge with its 95% CI. Kelly sizing is based on this."
        note={edgeOverlap ? 'The intervals overlap: bet sizing reshapes risk, not the per-dollar edge.' : 'Some intervals separate slightly; capped or all-in bets can tilt the per-dollar edge a little.'}
        table={{ columns: [{ label: 'Strategy' }, { label: 'Edge per $1', num: true }, { label: '95% CI', num: true }, { label: 'Kelly fraction', num: true }, { label: 'Kelly bet', num: true }],
          rows: S.map((s) => [s.name, pct(s.edge, 2, { sign: true }), `${pct(s.edgeLow, 2)} to ${pct(s.edgeHigh, 2)}`, num(s.kellyFraction, 4), money(s.kellyBet)]) }}>
        <DotRangeChart ariaLabel="Edge per dollar staked with 95% CI" xTitle="Player edge per $1 (%)" xFormat={(v) => `${num(v, Math.abs(v) < 1 && v !== 0 ? 1 : 0)}%`}
          rows={S.map((s) => ({
            label: s.name, color: colorOf(s.slot), value: s.edge * 100, lo: s.edgeLow * 100, hi: s.edgeHigh * 100,
            tip: { title: s.name, rows: [{ label: 'per $1 staked', value: pct(s.edge, 2, { sign: true }) }, { label: '95% CI', value: `${pct(s.edgeLow, 2)} to ${pct(s.edgeHigh, 2)}` }, { label: 'hands', value: s.hands.toLocaleString() }] },
          }))} />
      </ChartCard>

      <ChartCard title="Max drawdown" sub="Biggest peak-to-trough drop within a session. The box is the middle 50%; the line is the median."
        table={{ columns: [{ label: 'Strategy' }, { label: 'Median', num: true }, { label: 'Middle 50%', num: true }, { label: 'Mean', num: true }, { label: 'Worst', num: true }],
          rows: S.map((s) => [s.name, money(s.drawdown.median), `${money(s.drawdown.q1)} to ${money(s.drawdown.q3)}`, money(s.drawdown.mean), money(s.drawdown.max)]) }}>
        <BoxChart ariaLabel="Max drawdown distribution by strategy" xTitle="Max drawdown ($)" xFormat={(v) => money(v)}
          rows={S.map((s) => ({
            label: s.name, color: colorOf(s.slot), ...s.drawdown,
            tip: { title: s.name, rows: [{ label: 'median', value: money(s.drawdown.median) }, { label: 'middle 50%', value: `${money(s.drawdown.q1)} to ${money(s.drawdown.q3)}` }, { label: 'worst', value: money(s.drawdown.max) }] },
          }))} />
      </ChartCard>

      <ChartCard title="Hand outcomes" sub="Share of hands won, pushed and lost. The cards are shared, so these barely differ."
        legend={[{ label: 'Win', color: 'var(--good)', kind: 'rect' }, { label: 'Push', color: 'var(--neutral-mark)', kind: 'rect' }, { label: 'Loss', color: 'var(--critical)', kind: 'rect' }]}
        table={{ columns: [{ label: 'Strategy' }, { label: 'Win', num: true }, { label: 'Push', num: true }, { label: 'Loss', num: true }, { label: 'Blackjacks', num: true }],
          rows: S.map((s) => { const t = s.hands || 1; return [s.name, pct(s.wins / t), pct(s.pushes / t), pct(s.losses / t), s.blackjacks.toLocaleString()]; }) }}>
        <StackedBarChart ariaLabel="Share of hands won, pushed and lost" xTitle="Share of hands"
          rows={S.map((s) => {
            const t = s.hands || 1;
            return {
              label: s.name,
              parts: [{ value: s.wins / t, color: 'var(--good)', label: 'Win' }, { value: s.pushes / t, color: 'var(--neutral-mark)', label: 'Push' }, { value: s.losses / t, color: 'var(--critical)', label: 'Loss' }],
              tip: { title: s.name, rows: [{ label: 'win', value: pct(s.wins / t), color: 'var(--good)', kind: 'rect' }, { label: 'push', value: pct(s.pushes / t), color: 'var(--neutral-mark)', kind: 'rect' }, { label: 'loss', value: pct(s.losses / t), color: 'var(--critical)', kind: 'rect' }] },
            };
          })} />
      </ChartCard>
    </div>
  );
}

// ------------------------------------------------------------ deep dive

function DeepDive({ r, result, onWatch }: { r: StrategyResult; result: RunResult; onWatch: (id: string, session: number) => void }) {
  const c = colorOf(r.slot);
  const def = r.spec.def;
  const about = def.kind === 'builtin' ? (() => { const b = BUILTINS.find((x) => x.key === def.key)!; return [b.summary, b.detail]; })() : describeCustom(def.def);
  const bets = demoBets(def);
  const start = result.config.bank.start;
  const t = r.traj;
  const xs = result.xs;
  const notable = ([['best', 'Best'], ['typical', 'Typical'], ['worst', 'Worst'], ['drawdown', 'Deepest drawdown'], ['bust', 'First bust']] as const)
    .map(([k, label]) => ({ k, label, n: r.notable[k] }));
  const upVals = r.upcards.map((u) => (u.ev == null ? null : u.ev * 100));
  return (
    <div className="deep">
      <section className="card about" style={{ borderTopColor: c }}>
        <div className="about-head">
          <h3><StrategyKey slot={r.slot} /><StrategyName spec={r.spec} /></h3>
          <span className="muted small">{rulesShort(result.config.rules)}</span>
        </div>
        <ul className="rules-list">{about.map((l) => <li key={l}>{l}</li>)}</ul>
        <dl className="stat-grid">
          <div><dt>Average session</dt><dd className={signClass(r.meanNet)}>{money(r.meanNet, { sign: true, cents: true })}</dd><span>95% CI {money(r.ciLow)} to {money(r.ciHigh)}</span></div>
          <div><dt>Median session</dt><dd className={signClass(r.medianNet)}>{money(r.medianNet, { sign: true })}</dd><span>half the sessions did better</span></div>
          <div><dt>Middle 90%</dt><dd>{money(r.p05)} to {money(r.p95, { sign: true })}</dd><span>worst / best: {money(r.minNet)} / {money(r.maxNet, { sign: true })}</span></div>
          <div><dt>Finished ahead</dt><dd>{pct(r.pProfit)}</dd><span>behind: {pct(r.pLoss)}</span></div>
          <div><dt>Went broke</dt><dd className={r.riskOfRuin > 0 ? 'neg' : ''}>{pct(r.riskOfRuin)}</dd><span>{r.busts.toLocaleString()} of {r.sessions.toLocaleString()} sessions</span></div>
          <div><dt>Average bet</dt><dd>{money(r.avgStake)}</dd><span>biggest: {money(r.maxStake)}{r.tableMaxRate > 0 ? ` · at max ${pct(r.tableMaxRate)} of hands` : ''}</span></div>
          <div><dt>Hands per session</dt><dd>{r.avgRounds.toFixed(1)}</dd><span>{r.stopped ? `walked away early in ${pct(r.stopped / r.sessions, 0)}` : 'played to the end or until broke'}</span></div>
          <div><dt>Edge per $1</dt><dd className={signClass(r.edge)}>{pct(r.edge, 2, { sign: true })}</dd><span>{r.doubles.toLocaleString()} doubles · {r.blackjacks.toLocaleString()} blackjacks</span></div>
        </dl>
      </section>

      <div className="grid-2">
        <ChartCard title="How it bets" sub="Units bet over a sample run of wins (W), losses (L) and pushes (P), with no caps."
          table={{ columns: [{ label: 'Hand', num: true }, { label: 'Result' }, { label: 'Units bet', num: true }], rows: bets.map((b, i) => [i + 1, DEMO_OUTCOMES[i], fmtUnits(b)]) }}>
          <ColumnChart ariaLabel="Units bet over a sample sequence of results" height={230} yTitle="Units" yFormat={(v) => fmtUnits(v)}
            categories={bets.map((_, i) => DEMO_OUTCOMES[i])} values={bets} colors={c}
            tips={bets.map((b, i) => ({ title: `Hand ${i + 1}: ${DEMO_OUTCOMES[i] === 'W' ? 'win' : DEMO_OUTCOMES[i] === 'L' ? 'loss' : 'push'}`, rows: [{ label: 'units bet', value: fmtUnits(b) }] }))} />
        </ChartCard>
        <ChartCard title="Bet sizes it actually used" sub="Share of hands at each bet size, in units of the base bet."
          table={{ columns: [{ label: 'Units' }, { label: 'Share of hands', num: true }], rows: STAKE_BUCKETS.map((b, i) => [b, pct(r.stakeHist[i])]) }}>
          <ColumnChart ariaLabel="Share of hands at each bet size" height={230} yTitle="Share of hands (%)" xTitle="Bet size (units)" yFormat={(v) => `${v}%`}
            categories={STAKE_BUCKETS} values={r.stakeHist.map((v) => v * 100)} colors={c}
            tips={STAKE_BUCKETS.map((b, i) => ({ title: `${b} unit${b === '1' ? '' : 's'}`, rows: [{ label: 'of hands', value: pct(r.stakeHist[i]) }] }))} />
        </ChartCard>

        <div className="wide">
          <ChartCard title={`Bankroll over a session: ${r.name}`} wide
            legend={[{ label: 'Median', color: c }, { label: 'Middle 50% of sessions', color: c, kind: 'rect', opacity: 0.35 }, { label: 'Middle 90%', color: c, kind: 'rect', opacity: 0.15 }, { label: 'Sample sessions', color: c, opacity: 0.4 }]}
            sub="Median bankroll with the middle 50% and 90% of sessions, plus individual sessions."
            note={t.used < r.sessions ? `Bands use the first ${t.used.toLocaleString()} of ${r.sessions.toLocaleString()} sessions; the mean and survival use all of them.` : undefined}
            table={{ columns: ['Hand', '5th pct', '25th', 'Median', '75th', '95th', 'Mean', 'Solvent'].map((l, i) => ({ label: l, num: i !== -1 })),
              rows: xs.map((x, i) => [x, money(t.p5[i]), money(t.p25[i]), money(t.p50[i]), money(t.p75[i]), money(t.p95[i]), money(t.mean[i]), pct(t.survival[i])]) }}>
            <LineChart ariaLabel={`Bankroll percentiles over a session for ${r.name}`} height={340} xTitle="Hand number" yTitle="Bankroll ($)" yFormat={(v) => money(v)} yZero
              hoverTitle={(x) => `Hand ${x}`} refLines={[{ axis: 'y', value: start, label: `Start ${money(start)}` }]}
              spaghetti={[{ id: 'samples', color: c, opacity: 0.22, lines: r.paths.slice(0, 30).map((p) => p.map((v, i) => [xs[i], v] as [number, number])) }]}
              bands={[
                { id: 'p90', color: c, opacity: 0.1, points: xs.map((x, i) => [x, t.p5[i], t.p95[i]] as [number, number, number]) },
                { id: 'p50', color: c, opacity: 0.22, points: xs.map((x, i) => [x, t.p25[i], t.p75[i]] as [number, number, number]) },
              ]}
              series={[
                { id: 'p95', name: '95th percentile', color: c, opacity: 0, width: 0, points: xs.map((x, i) => [x, t.p95[i]] as [number, number]) },
                { id: 'p75', name: '75th percentile', color: c, opacity: 0, width: 0, points: xs.map((x, i) => [x, t.p75[i]] as [number, number]) },
                { id: 'p50', name: 'median', color: c, points: xs.map((x, i) => [x, t.p50[i]] as [number, number]) },
                { id: 'p25', name: '25th percentile', color: c, opacity: 0, width: 0, points: xs.map((x, i) => [x, t.p25[i]] as [number, number]) },
                { id: 'p5', name: '5th percentile', color: c, opacity: 0, width: 0, points: xs.map((x, i) => [x, t.p5[i]] as [number, number]) },
              ]} />
          </ChartCard>
        </div>

        <ChartCard title="Edge by dealer upcard" sub="Average result per $1 bet, grouped by the dealer's face-up card."
          table={{ columns: [{ label: 'Dealer shows' }, { label: 'Hands', num: true }, { label: 'Edge per $1', num: true }, { label: 'Win', num: true }, { label: 'Loss', num: true }],
            rows: r.upcards.map((u) => [u.up, u.hands.toLocaleString(), u.ev == null ? '-' : pct(u.ev, 1, { sign: true }), pct(u.win), pct(u.lose)]) }}>
          <ColumnChart ariaLabel="Player edge by dealer upcard" height={260} xTitle="Dealer upcard" yTitle="Player edge per $1 (%)" yFormat={(v) => `${v}%`}
            categories={UPCARDS} values={upVals} colors={upVals.map((v) => (v != null && v >= 0 ? 'var(--div-pos)' : 'var(--div-neg)'))}
            tips={r.upcards.map((u) => ({ title: `Dealer shows ${u.up}`, rows: [{ label: 'per $1 bet', value: u.ev == null ? '-' : pct(u.ev, 1, { sign: true }) }, { label: 'hands', value: u.hands.toLocaleString() }, { label: 'won', value: pct(u.win, 0) }] }))} />
        </ChartCard>
        <ChartCard title="Starting hand vs dealer upcard" sub="Average result per $1 for each two-card start. Blank cells had fewer than 20 hands."
          table={{ columns: [{ label: 'Hand' }, ...UPCARDS.map((u) => ({ label: u, num: true }))], rows: HEAT_ROWS.map((row, i) => [row, ...r.heat.ev[i].map((v) => (v == null ? '' : pct(v, 0, { sign: true })))]) }}>
          <HeatLegend limitLabel="100%" />
          <Heatmap ariaLabel="Average result per dollar by starting hand and dealer upcard" rows={HEAT_ROWS} cols={UPCARDS} values={r.heat.ev} xTitle="Dealer upcard"
            tips={(i, j) => ({ title: `${HEAT_ROWS[i]} vs ${UPCARDS[j]}`, rows: [{ label: 'per $1 bet', value: r.heat.ev[i][j] == null ? 'too few hands' : pct(r.heat.ev[i][j]!, 0, { sign: true }) }, { label: 'hands', value: r.heat.n[i][j].toLocaleString() }] })} />
        </ChartCard>
      </div>

      <section className="card">
        <div className="card-head"><h3>Watch it at the table</h3><p>Replay any of these sessions card by card. They're re-simulated from the run's seed, so nothing had to be stored.</p></div>
        <div className="chip-row">
          {notable.map(({ k, label, n }) => n ? (
            <button key={k} type="button" className="chip" onClick={() => onWatch(r.id, n.session)}>
              {label} <span className="muted">#{n.session + 1}</span><strong className={signClass(n.net)}>{money(n.net, { sign: true })}</strong>
            </button>
          ) : <span key={k} className="chip static">{label}: none</span>)}
        </div>
      </section>
    </div>
  );
}
