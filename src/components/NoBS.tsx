// "No BS" mode: the ranking, a few numbers to back each place, and the bottom line
import type { RunResult, Weights } from '../engine/stats';
import { ChartCard } from '../charts/ChartCard';
import { DotRangeChart } from '../charts/BarCharts';
import { bottomLine, rank, verdict, why } from '../lib/insights';
import { colorOf } from '../lib/registry';
import { money, pct, signClass } from '../lib/format';
import { StrategyKey } from './ui';
import { StrategyName } from './StrategyName';

const WEIGHT_NAMES: Record<keyof Weights, string> = {
  meanNet: 'average result', evPerHand: 'EV per hand', stdNet: 'steadiness', riskOfRuin: 'risk of ruin',
  meanDrawdown: 'drawdown', winRate: 'win rate',
};

export function NoBS({ result, weights, onWatch }: { result: RunResult; weights: Weights; onWatch: (id: string, session: number) => void }) {
  const ranked = rank(result, weights);
  const v = verdict(result, ranked);
  const top = ranked[0];
  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const weightText = (Object.keys(weights) as (keyof Weights)[])
    .filter((k) => weights[k] > 0).sort((a, b) => weights[b] - weights[a])
    .map((k) => `${WEIGHT_NAMES[k]} ${Math.round((weights[k] / total) * 100)}%`).join(', ');

  return (
    <div className="nobs">
      <section className="card verdict" style={{ borderLeftColor: colorOf(top.slot) }}>
        <span className="eyebrow">The verdict</span>
        <h2><StrategyKey slot={top.slot} />{v.headline}</h2>
        <p>{v.body}</p>
      </section>

      <ol className="ranking" aria-label="Strategies ranked best to worst">
        {ranked.map((r) => (
          <li key={r.id} className="rank-card">
            <div className={`rank-num${r.liveRank === 1 ? ' first' : ''}`} aria-label={`Rank ${r.liveRank}`}>{r.liveRank}</div>
            <div className="rank-main">
              <div className="rank-name">
                <StrategyKey slot={r.slot} />
                <strong><StrategyName spec={r.spec} /></strong>
                <span className="score-bar" aria-hidden="true"><i style={{ width: `${Math.max(3, r.liveScore * 100)}%`, background: colorOf(r.slot) }} /></span>
                <span className="muted small">score {r.liveScore.toFixed(2)}</span>
              </div>
              <p className="why">{why(r, result.strategies)}</p>
            </div>
            <dl className="facts">
              <div><dt>Average session</dt><dd className={signClass(r.meanNet)}>{money(r.meanNet, { sign: true, cents: Math.abs(r.meanNet) < 10 })}</dd></div>
              <div><dt>Finish ahead</dt><dd>{pct(r.pProfit, 0)}</dd></div>
              <div><dt>Go broke</dt><dd className={r.riskOfRuin > 0 ? 'neg' : ''}>{pct(r.riskOfRuin, r.riskOfRuin > 0 && r.riskOfRuin < 0.01 ? 1 : 0)}</dd></div>
              <div><dt>Bad day (worst 5%)</dt><dd className={signClass(r.p05)}>{money(r.p05, { sign: true })}</dd></div>
            </dl>
            <button type="button" className="btn ghost small watch" onClick={() => onWatch(r.id, r.notable.typical.session)}>Watch a typical session</button>
          </li>
        ))}
      </ol>

      <ChartCard title="The bottom line"
        sub="Average result per session with its 95% confidence interval. Overlapping bars mean the difference could be luck."
        table={{
          columns: [{ label: 'Strategy' }, { label: 'Average session', num: true }, { label: '95% CI', num: true }, { label: 'Sessions', num: true }],
          rows: ranked.map((r) => [r.name, money(r.meanNet, { sign: true, cents: true }), `${money(r.ciLow)} to ${money(r.ciHigh)}`, r.sessions.toLocaleString()]),
        }}>
        <div className="bottom-line">
          <ul>{bottomLine(result).map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
        <DotRangeChart ariaLabel="Average session result with 95% confidence interval for each strategy" xTitle="Average session result ($)"
          xFormat={(v) => money(v)}
          rows={ranked.map((r) => ({
            label: r.name, color: colorOf(r.slot), value: r.meanNet, lo: r.ciLow, hi: r.ciHigh,
            tip: { title: r.name, rows: [{ label: 'average per session', value: money(r.meanNet, { sign: true, cents: true }), color: colorOf(r.slot), kind: 'dot' }, { label: '95% CI', value: `${money(r.ciLow)} to ${money(r.ciHigh)}` }] },
          }))} />
      </ChartCard>
      <p className="method">
        Ranked by a weighted score of {weightText}, each scaled across the strategies compared (the same method as <code>analyze.py</code>).
        Switch to In-depth to change the weights and see every chart.
      </p>
    </div>
  );
}
