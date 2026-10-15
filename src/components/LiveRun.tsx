// The Monte Carlo visual: convergence of each strategy's mean and bankroll paths drawn as sessions finish
import type { ConvergencePoint, RunConfig } from '../engine/stats';
import { samplePoints } from '../engine/stats';
import { ChartCard } from '../charts/ChartCard';
import { LineChart } from '../charts/LineChart';
import { colorOf } from '../lib/registry';
import { compact, duration, money } from '../lib/format';
import type { Live } from '../lib/useSimulation';

interface Props {
  config: RunConfig;
  convergence: Record<string, ConvergencePoint[]>;
  paths: Record<string, number[][]>;
  live?: Live | null;

}

export function ConvergenceCharts({ config, convergence, paths }: Props) {
  const specs = config.strategies;
  const legend = specs.map((s) => ({ label: s.name, color: colorOf(s.slot) }));
  const xs = samplePoints(config.bank.rounds);
  const start = config.bank.start;
  const conv = specs.filter((s) => (convergence[s.id] || []).length);
  return (
    <div className="grid-2">
      <ChartCard title="Mean session result, converging" legend={legend}
        sub="Running average with its 95% confidence band. More sessions narrow each band around that strategy's true expectation."
        table={{
          columns: [{ label: 'Strategy' }, { label: 'Sessions', num: true }, { label: 'Mean net', num: true }, { label: '95% CI', num: true }],
          rows: conv.map((s) => { const c = convergence[s.id].at(-1)!; return [s.name, c[0].toLocaleString(), money(c[1], { cents: true }), `${money(c[2])} to ${money(c[3])}`]; }),
        }}>
        <LineChart ariaLabel="Mean session result converging as sessions accumulate" height={280} xLog
          xTitle="Sessions simulated per strategy (log scale)" yTitle="Mean net ($)"
          xFormat={(v) => compact(v)} yFormat={(v) => money(v)} hoverTitle={(x) => `After ${x.toLocaleString()} sessions`}
          valueFormat={(v) => money(v, { cents: true })} refLines={[{ axis: 'y', value: 0 }]}
          bands={conv.map((s) => ({ id: s.id, color: colorOf(s.slot), opacity: 0.12, points: convergence[s.id].map(([n, , lo, hi]) => [n, lo, hi] as [number, number, number]) }))}
          series={conv.map((s) => ({ id: s.id, name: s.name, color: colorOf(s.slot), points: convergence[s.id].map(([n, m]) => [n, m] as [number, number]) }))} />
      </ChartCard>
      <ChartCard title="Bankroll paths" legend={legend}
        sub="The first sessions of each strategy, drawn as they finish. Paths that touch $0 went broke."
        table={{
          columns: [{ label: 'Strategy' }, { label: 'Paths shown', num: true }, { label: 'Median final', num: true }, { label: 'Went broke', num: true }],
          rows: specs.map((s) => {
            const p = paths[s.id] || [];
            const finals = p.map((q) => q.at(-1)!).sort((a, b) => a - b);
            return [s.name, p.length, finals.length ? money(finals[Math.floor(finals.length / 2)]) : '-', finals.filter((v) => v <= 0).length];
          }),
        }}>
        <LineChart ariaLabel="Sample bankroll paths for each strategy" height={280} series={[]}
          xTitle="Hand number" yTitle="Bankroll ($)" yFormat={(v) => money(v)} yZero
          xDomain={[0, config.bank.rounds]} refLines={[{ axis: 'y', value: start, label: `Start ${money(start)}` }]}
          spaghetti={specs.map((s) => ({ id: s.id, color: colorOf(s.slot), opacity: 0.4, width: 1, lines: (paths[s.id] || []).map((p) => p.map((v, i) => [xs[i], v] as [number, number])) }))} />
      </ChartCard>
    </div>
  );
}

export function LiveRun({ live }: { live: Live }) {
  const frac = live.total ? live.done / live.total : 0;
  const rate = live.elapsedMs > 0 ? (live.hands / live.elapsedMs) * 1000 : 0;
  const left = frac > 0 ? (live.elapsedMs / frac) * (1 - frac) : NaN;
  const convergence: Record<string, ConvergencePoint[]> = {};
  for (const [id, p] of Object.entries(live.per)) convergence[id] = p.convergence;
  return (
    <section className="live-run">
      <div className="card run-progress">
        <div className="progress-top">
          <span className="pill running">Simulating</span>
          <span className="muted">{compact(live.hands)} hands dealt · {compact(rate)} hands/s · {duration(live.elapsedMs)} elapsed{Number.isFinite(left) ? ` · ${duration(left)} left` : ''}</span>
          <strong className="pct">{Math.floor(frac * 100)}%</strong>
        </div>
        <div className="bar"><i style={{ width: `${frac * 100}%` }} /></div>
        <div className="live-strats">
          {live.config.strategies.map((s) => {
            const p = live.per[s.id];
            return (
              <div key={s.id} className="live-strat">
                <span className="strat-cell"><i className="key rect" style={{ background: colorOf(s.slot) }} />{s.name}</span>
                <span className="muted">{p ? `${money(p.mean, { sign: true })} ± ${money(p.half)}` : '-'}</span>
              </div>
            );
          })}
        </div>
      </div>
      <ConvergenceCharts config={live.config} convergence={convergence} paths={live.paths} />
    </section>
  );
}

export function ModeSlider({ value, onChange }: { value: 'nobs' | 'indepth'; onChange: (v: 'nobs' | 'indepth') => void }) {
  return (
    <div className="mode-slider" role="radiogroup" aria-label="How much detail">
      <button type="button" role="radio" aria-checked={value === 'nobs'} onClick={() => onChange('nobs')}>
        <strong>No BS</strong><span>Just the ranking</span>
      </button>
      <button type="button" role="radio" aria-checked={value === 'indepth'} onClick={() => onChange('indepth')}>
        <strong>In-depth</strong><span>Every number</span>
      </button>
      <i className={`thumb ${value}`} aria-hidden="true" />
    </div>
  );
}
