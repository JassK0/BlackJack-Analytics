// Plain-English readings of a run's numbers (used by the No BS view and the KPI row)
import type { RunResult, StrategyResult, Weights } from '../engine/stats';
import { composite } from '../engine/stats';
import { money, num, pct } from './format';

export interface Ranked extends StrategyResult { liveScore: number; liveRank: number }

export function rank(res: RunResult, w: Weights): Ranked[] {
  const { scores, ranks } = composite(res.strategies, w);
  return res.strategies.map((s, i) => ({ ...s, liveScore: scores[i], liveRank: ranks[i] })).sort((a, b) => a.liveRank - b.liveRank || a.name.localeCompare(b.name));
}

/** The edge every strategy faces, read from flat betting when it's in the run. */
export function referenceEdge(res: RunResult) {
  const ref = res.strategies.find((s) => s.id === 'b:flat') || [...res.strategies].sort((a, b) => b.hands - a.hands)[0];
  return { edge: ref.edge, lo: ref.edgeLow, hi: ref.edgeHigh, name: ref.name };
}

export const meansOverlap = (rows: StrategyResult[]) =>
  Math.max(...rows.map((r) => r.ciLow)) <= Math.min(...rows.map((r) => r.ciHigh));

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function why(r: StrategyResult, all: StrategyResult[]): string {
  if (all.length < 2) return 'The only strategy in this comparison.';
  const max = (k: keyof StrategyResult) => Math.max(...all.map((x) => x[k] as number));
  const min = (k: keyof StrategyResult) => Math.min(...all.map((x) => x[k] as number));
  const good: string[] = [], bad: string[] = [];
  if (r.stdNet === min('stdNet')) good.push('smallest swings');
  if (r.riskOfRuin === 0 && max('riskOfRuin') > 0) good.push('never went broke');
  if (r.pProfit === max('pProfit')) good.push(`finishes ahead most often (${pct(r.pProfit, 0)})`);
  if (r.meanNet === max('meanNet')) good.push('best average result');
  if (r.riskOfRuin > 0.01 && (r.riskOfRuin === max('riskOfRuin') || r.riskOfRuin >= 0.1)) bad.push(`goes broke in ${pct(r.riskOfRuin, 0)} of sessions`);
  if (r.meanDrawdown === max('meanDrawdown')) bad.push('deepest drawdowns');
  if (all.length > 2 && r.meanNet === min('meanNet')) bad.push('worst average result');
  if (r.pProfit === min('pProfit') && !bad.length) bad.push(`finishes ahead least often (${pct(r.pProfit, 0)})`);
  if (r.stopped > 0) good.push(`walked away early in ${pct(r.stopped / r.sessions, 0)} of sessions`);
  const g = good.slice(0, 2), b = bad.slice(0, 2);
  if (!g.length && !b.length) return 'Middle of the pack on every measure.';
  if (!b.length) return cap(g.join(' and ')) + '.';
  if (!g.length) return cap(b.join(' and ')) + '.';
  return `${cap(g.join(' and '))}, but ${b.join(' and ')}.`;
}

export function verdict(res: RunResult, ranked: Ranked[]): { headline: string; body: string } {
  const top = ranked[0];
  let body = why(top, res.strategies);
  if (top.meanNet < 0) {
    body += ` It still loses ${money(-top.meanNet, { cents: true })} per session on average. No betting system turns a negative-edge game into a winning one.`;
  } else {
    body += ` Its average shows ${money(top.meanNet, { sign: true, cents: true })} per session, but the 95% range runs from ${money(top.ciLow)} to ${money(top.ciHigh)}: that's luck in this sample, not an edge.`;
  }
  return { headline: ranked.length > 1 ? `${top.name} comes out on top` : `${top.name} on its own`, body };
}

export function bottomLine(res: RunResult): string[] {
  const e = referenceEdge(res);
  const out: string[] = [];
  const cents = num(-e.edge * 100, 1);
  out.push(e.edge < 0
    ? `Every hand gives the house about ${cents}¢ of each $1 you bet (95% CI ${num(-e.hi * 100, 1)}¢ to ${num(-e.lo * 100, 1)}¢), whatever betting system you use.`
    : `This sample measured a small player edge of ${pct(e.edge, 2)} per $1, but its 95% CI (${pct(e.lo, 2)} to ${pct(e.hi, 2)}) includes a house edge. More sessions will settle it.`);
  if (meansOverlap(res.strategies)) out.push("Every strategy's average result overlaps with every other's. The systems differ in how risky the ride is, not in what you should expect to win.");
  else out.push('Some averages differ beyond their margin of error. That comes from bet size (bigger average bets lose more dollars at the same edge), not from beating the game.');
  const kelly = Math.max(...res.strategies.map((s) => s.kellyBet));
  out.push(kelly > 0 ? `Kelly sizing suggests up to ${money(kelly)} for a strategy whose measured edge is positive, but check its confidence interval before trusting it.`
    : 'The Kelly criterion says the growth-optimal bet is $0: with a negative edge, the best long-run move is not to play.');
  return out;
}
