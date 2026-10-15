// Streaming statistics per strategy, finalized into a compact, JSON-safe result
import type { Bankroll, Hand, Rules, SessionSummary, StrategySpec } from './types';
import { heatRow, HEAT_ROWS, upcardIndex, UPCARDS } from './cards';

export interface RunConfig {
  rules: Rules;
  bank: Bankroll;
  seed: number;
  strategies: StrategySpec[];
}

export interface Box { q1: number; median: number; q3: number; lo: number; hi: number; mean: number; min: number; max: number }
export interface Notable { session: number; net: number }
export type ConvergencePoint = [n: number, mean: number, lo: number, hi: number];

export interface StrategyResult {
  id: string; name: string; slot: number; spec: StrategySpec;
  sessions: number; hands: number; avgRounds: number;
  meanNet: number; ciLow: number; ciHigh: number; medianNet: number; stdNet: number;
  p05: number; p25: number; p75: number; p95: number; minNet: number; maxNet: number;
  winRate: number; pProfit: number; pLoss: number;
  riskOfRuin: number; busts: number; stopped: number;
  meanDrawdown: number; drawdown: Box;
  wins: number; losses: number; pushes: number; blackjacks: number; doubles: number;
  avgStake: number; maxStake: number; tableMaxRate: number;
  evPerHand: number;
  edge: number; edgeLow: number; edgeHigh: number; kellyFraction: number; kellyBet: number;
  traj: { p5: number[]; p25: number[]; p50: number[]; p75: number[]; p95: number[]; mean: number[]; survival: number[]; used: number };
  upcards: { up: string; hands: number; ev: number | null; win: number; lose: number; push: number }[];
  heat: { ev: (number | null)[][]; n: number[][] };
  stakeHist: number[];
  notable: { best: Notable; worst: Notable; typical: Notable; drawdown: Notable; bust: Notable | null };
  convergence: ConvergencePoint[];
  paths: number[][];
  score: number; rank: number;
}

export interface RunResult {
  id: string;
  createdAt: number;
  config: RunConfig;
  elapsedMs: number;
  totalHands: number;
  totalSessions: number;
  xs: number[];
  hist: { centers: number[]; width: number; series: Record<string, number[]> };
  strategies: StrategyResult[];
}

export interface StrategyProgress {
  id: string; done: number; mean: number; half: number; busts: number;
  convergence: ConvergencePoint[]; newPaths: number[][];
}
export interface Progress { done: number; total: number; hands: number; elapsedMs: number; per: StrategyProgress[] }

export const STAKE_BUCKETS = ['<1', '1', '2', '3-4', '5-8', '9-16', '17-32', '33-64', '65+'];
const BAND_SESSIONS = 4000;
const SAMPLE_PATHS = 40;
const HEAT_MIN = 20;

export function samplePoints(rounds: number, max = 121): number[] {
  const n = Math.min(rounds + 1, max);
  const out = new Set<number>();
  for (let i = 0; i < n; i++) out.add(Math.round((i * rounds) / (n - 1 || 1)));
  return [...out].sort((a, b) => a - b);
}

function checkpoints(sessions: number): Set<number> {
  const out = new Set<number>();
  const n = Math.min(sessions, 160);
  for (let i = 0; i < n; i++) out.add(Math.max(1, Math.round(Math.exp((Math.log(sessions) * i) / Math.max(1, n - 1)))));
  out.add(sessions);
  return out;
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

export function quantile(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length;
  if (!n) return NaN;
  const pos = q * (n - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function box(values: Float64Array): Box {
  const s = Float64Array.from(values).sort();
  const q1 = quantile(s, 0.25), median = quantile(s, 0.5), q3 = quantile(s, 0.75);
  const iqr = q3 - q1;
  let lo = s[s.length - 1], hi = s[0], sum = 0;
  for (const v of s) {
    sum += v;
    if (v >= q1 - 1.5 * iqr && v < lo) lo = v;
    if (v <= q3 + 1.5 * iqr && v > hi) hi = v;
  }
  return { q1, median, q3, lo, hi, mean: sum / s.length, min: s[0], max: s[s.length - 1] };
}

/** Collects everything for one strategy while sessions stream through. */
export class Accumulator {
  readonly nets: Float64Array;
  private dds: Float64Array;
  private winRates: Float64Array;
  private xs: number[];
  private kOfHand: Int32Array;
  private band: Float32Array;
  private bandUsed: number;
  private sumAt: Float64Array;
  private solventAt: Float64Array;
  private cur: Float64Array;
  private lastK = 0;
  private up = new Float64Array(10 * 5);          // per upcard: n, sum of return, W, L, P
  private heatN = new Float64Array(HEAT_ROWS.length * 10);
  private heatSum = new Float64Array(HEAT_ROWS.length * 10);
  private stakes = new Float64Array(STAKE_BUCKETS.length);
  private checkpoints: Set<number>;
  convergence: ConvergencePoint[] = [];
  paths: number[][] = [];
  private pathsSent = 0;
  done = 0;
  hands = 0;
  busts = 0;
  private stopped = 0;
  private wins = 0; private losses = 0; private pushes = 0; private blackjacks = 0; private doubles = 0;
  private stakeSum = 0; private maxStake = 0; private tmHits = 0; private profitSum = 0;
  private rSum = 0; private rSq = 0; private rN = 0;
  private netSum = 0; private netSq = 0;
  private best = 0; private worst = 0; private ddIdx = 0; private firstBust = -1;

  constructor(readonly spec: StrategySpec, private cfg: RunConfig) {
    const { sessions, rounds } = cfg.bank;
    this.nets = new Float64Array(sessions);
    this.dds = new Float64Array(sessions);
    this.winRates = new Float64Array(sessions);
    this.xs = samplePoints(rounds);
    this.kOfHand = new Int32Array(rounds + 1).fill(-1);
    this.xs.forEach((x, k) => { this.kOfHand[x] = k; });
    this.bandUsed = Math.min(sessions, BAND_SESSIONS);
    this.band = new Float32Array(this.bandUsed * this.xs.length);
    this.sumAt = new Float64Array(this.xs.length);
    this.solventAt = new Float64Array(this.xs.length);
    this.cur = new Float64Array(this.xs.length);
    this.checkpoints = checkpoints(sessions);
  }

  beginSession() {
    this.cur[0] = this.cfg.bank.start;
    this.lastK = 0;
  }

  onHand = (h: Hand, index: number, _before: number, after: number) => {
    const r = h.profit / h.stake;
    this.rSum += r; this.rSq += r * r; this.rN++;
    this.profitSum += h.profit;
    const ui = upcardIndex(h.dealer[0]);
    const u = ui * 5;
    this.up[u]++; this.up[u + 1] += r;
    this.up[u + (h.outcome === 'W' ? 2 : h.outcome === 'L' ? 3 : 4)]++;
    const hi = heatRow(h.player[0], h.player[1]) * 10 + ui;
    this.heatN[hi]++; this.heatSum[hi] += r;
    const units = h.stake / this.cfg.bank.unit;
    const b = units < 1 ? 0 : units <= 1 ? 1 : units <= 2 ? 2 : units <= 4 ? 3 : units <= 8 ? 4 : units <= 16 ? 5 : units <= 32 ? 6 : units <= 64 ? 7 : 8;
    this.stakes[b]++;
    const k = this.kOfHand[index];
    if (k >= 0) { this.cur[k] = after; this.lastK = k; }
  };

  endSession(s: number, sum: SessionSummary) {
    const nets = this.nets;
    nets[s] = sum.net; this.dds[s] = sum.maxDrawdown; this.winRates[s] = sum.winRate;
    this.netSum += sum.net; this.netSq += sum.net * sum.net;
    this.done++;
    this.hands += sum.rounds;
    if (sum.bust) { this.busts++; if (this.firstBust < 0) this.firstBust = s; }
    if (sum.stopped) this.stopped++;
    this.wins += sum.wins; this.losses += sum.losses; this.pushes += sum.pushes;
    this.blackjacks += sum.blackjacks; this.doubles += sum.doubles;
    this.stakeSum += sum.stakeTotal; this.tmHits += sum.tableMaxHits;
    if (sum.maxStake > this.maxStake) this.maxStake = sum.maxStake;
    if (sum.net > nets[this.best]) this.best = s;
    if (sum.net < nets[this.worst]) this.worst = s;
    if (sum.maxDrawdown > this.dds[this.ddIdx]) this.ddIdx = s;

    const K = this.xs.length, cur = this.cur;
    for (let k = this.lastK + 1; k < K; k++) cur[k] = sum.final;
    for (let k = 0; k < K; k++) { this.sumAt[k] += cur[k]; if (cur[k] > 0) this.solventAt[k]++; }
    if (s < this.bandUsed) this.band.set(cur, s * K);
    if (s < SAMPLE_PATHS) this.paths.push(Array.from(cur, Math.round));

    const n = this.done;
    if (this.checkpoints.has(n)) {
      const mean = this.netSum / n;
      const half = n > 1 ? 1.96 * Math.sqrt(Math.max(0, (this.netSq - n * mean * mean) / (n - 1)) / n) : 0;
      this.convergence.push([n, mean, mean - half, mean + half]);
    }
  }

  progress(): StrategyProgress {
    const n = this.done;
    const mean = n ? this.netSum / n : 0;
    const half = n > 1 ? 1.96 * Math.sqrt(Math.max(0, (this.netSq - n * mean * mean) / (n - 1)) / n) : 0;
    const newPaths = this.paths.slice(this.pathsSent);
    this.pathsSent = this.paths.length;
    return { id: this.spec.id, done: n, mean, half, busts: this.busts, convergence: this.convergence.slice(), newPaths };
  }

  finalize(): StrategyResult {
    const { sessions } = this.cfg.bank;
    const nets = this.nets;
    const sorted = Float64Array.from(nets).sort();
    const mean = this.netSum / sessions;
    const variance = sessions > 1 ? Math.max(0, (this.netSq - sessions * mean * mean) / (sessions - 1)) : 0;
    const std = Math.sqrt(variance);
    const half = sessions > 1 ? (1.96 * std) / Math.sqrt(sessions) : 0;
    const median = quantile(sorted, 0.5);
    let typical = 0, pos = 0, neg = 0, wr = 0, ddSum = 0;
    for (let s = 0; s < sessions; s++) {
      if (Math.abs(nets[s] - median) < Math.abs(nets[typical] - median)) typical = s;
      if (nets[s] > 0) pos++; else if (nets[s] < 0) neg++;
      wr += this.winRates[s];
      ddSum += this.dds[s];
    }
    const K = this.xs.length, used = this.bandUsed;
    const traj = { p5: [] as number[], p25: [] as number[], p50: [] as number[], p75: [] as number[], p95: [] as number[], mean: [] as number[], survival: [] as number[], used };
    const col = new Float64Array(used);
    for (let k = 0; k < K; k++) {
      for (let s = 0; s < used; s++) col[s] = this.band[s * K + k];
      col.sort();
      traj.p5.push(Math.round(quantile(col, 0.05))); traj.p25.push(Math.round(quantile(col, 0.25))); traj.p50.push(Math.round(quantile(col, 0.5)));
      traj.p75.push(Math.round(quantile(col, 0.75))); traj.p95.push(Math.round(quantile(col, 0.95)));
      traj.mean.push(Math.round(this.sumAt[k] / sessions)); traj.survival.push(round(this.solventAt[k] / sessions, 4));
    }
    const upcards = UPCARDS.map((up, i) => {
      const n = this.up[i * 5];
      return { up, hands: n, ev: n ? this.up[i * 5 + 1] / n : null, win: n ? this.up[i * 5 + 2] / n : 0, lose: n ? this.up[i * 5 + 3] / n : 0, push: n ? this.up[i * 5 + 4] / n : 0 };
    });
    const heat = { ev: [] as (number | null)[][], n: [] as number[][] };
    for (let r = 0; r < HEAT_ROWS.length; r++) {
      const evRow: (number | null)[] = [], nRow: number[] = [];
      for (let c = 0; c < 10; c++) {
        const n = this.heatN[r * 10 + c];
        nRow.push(n);
        evRow.push(n >= HEAT_MIN ? round(this.heatSum[r * 10 + c] / n, 4) : null);
      }
      heat.ev.push(evRow); heat.n.push(nRow);
    }
    const rN = this.rN;
    const edge = rN ? this.rSum / rN : 0;
    const rVar = rN > 1 ? Math.max(0, (this.rSq - rN * edge * edge) / (rN - 1)) : 0;
    const eHalf = rN > 1 ? 1.96 * Math.sqrt(rVar / rN) : 0;
    const kellyFraction = rVar > 0 ? edge / rVar : 0;
    const hands = this.hands || 1;
    return {
      id: this.spec.id, name: this.spec.name, slot: this.spec.slot, spec: this.spec,
      sessions, hands: this.hands, avgRounds: this.hands / sessions,
      meanNet: mean, ciLow: mean - half, ciHigh: mean + half, medianNet: median, stdNet: std,
      p05: quantile(sorted, 0.05), p25: quantile(sorted, 0.25), p75: quantile(sorted, 0.75), p95: quantile(sorted, 0.95),
      minNet: sorted[0], maxNet: sorted[sorted.length - 1],
      winRate: wr / sessions, pProfit: pos / sessions, pLoss: neg / sessions,
      riskOfRuin: this.busts / sessions, busts: this.busts, stopped: this.stopped,
      meanDrawdown: ddSum / sessions, drawdown: box(this.dds),
      wins: this.wins, losses: this.losses, pushes: this.pushes, blackjacks: this.blackjacks, doubles: this.doubles,
      avgStake: this.stakeSum / hands, maxStake: this.maxStake, tableMaxRate: this.tmHits / hands,
      evPerHand: this.profitSum / hands,
      edge, edgeLow: edge - eHalf, edgeHigh: edge + eHalf, kellyFraction, kellyBet: Math.max(0, kellyFraction) * this.cfg.bank.start,
      traj, upcards, heat,
      stakeHist: Array.from(this.stakes, (v) => round(v / hands, 5)),
      notable: {
        best: { session: this.best, net: nets[this.best] }, worst: { session: this.worst, net: nets[this.worst] },
        typical: { session: typical, net: nets[typical] }, drawdown: { session: this.ddIdx, net: nets[this.ddIdx] },
        bust: this.firstBust >= 0 ? { session: this.firstBust, net: nets[this.firstBust] } : null,
      },
      convergence: this.convergence.map(([n, m, lo, hi]) => [n, round(m, 2), round(lo, 2), round(hi, 2)] as ConvergencePoint), paths: this.paths,
      score: 0, rank: 0,
    };
  }

  get sampleXs() { return this.xs; }
}

/** Shared bins for every strategy's session results, aligned to the betting unit (as the old dashboard did). */
export function histogram(accs: Accumulator[], unit: number) {
  let lo = Infinity, hi = -Infinity;
  for (const a of accs) for (const v of a.nets) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const u = Math.max(1, unit);
  const width = u * Math.max(1, Math.ceil((hi - lo) / (u * 48)));
  const start = Math.floor(lo / width) * width - width / 2;
  const nBins = Math.max(1, Math.floor((hi - start) / width) + 1);
  const centers = Array.from({ length: nBins }, (_, i) => start + width * (i + 0.5));
  const series: Record<string, number[]> = {};
  for (const a of accs) {
    const counts = new Array(nBins).fill(0);
    for (const v of a.nets) counts[Math.min(nBins - 1, Math.floor((v - start) / width))]++;
    series[a.spec.id] = counts.map((c) => round(c / a.nets.length, 5));
  }
  return { centers, width, series };
}

// ------------------------------------------------------------- ranking

export type WeightKey = 'meanNet' | 'evPerHand' | 'stdNet' | 'riskOfRuin' | 'meanDrawdown' | 'winRate';
export type Weights = Record<WeightKey, number>;

/** Same weights as analyze.DEFAULT_WEIGHTS. */
export const DEFAULT_WEIGHTS: Weights = { meanNet: 0.35, evPerHand: 0.1, stdNet: 0.15, riskOfRuin: 0.15, meanDrawdown: 0.1, winRate: 0.15 };
const HIGHER = ['meanNet', 'evPerHand', 'winRate', 'medianNet'] as const;
const LOWER = ['stdNet', 'riskOfRuin', 'meanDrawdown'] as const;

/** Min-max normalized composite score, as analyze.rank_strategies computes it. */
export function composite(rows: StrategyResult[], w: Weights): { scores: number[]; ranks: number[] } {
  const norm: Record<string, number[]> = {};
  for (const m of [...HIGHER, ...LOWER]) {
    const vals = rows.map((r) => r[m]);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    let n = hi === lo ? vals.map(() => 0.5) : vals.map((v) => (v - lo) / (hi - lo));
    if ((LOWER as readonly string[]).includes(m)) n = n.map((v) => 1 - v);
    norm[m] = n;
  }
  const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  const scores = rows.map((_, i) => (Object.keys(w) as WeightKey[]).reduce((acc, k) => acc + (w[k] / total) * norm[k][i], 0));
  const order = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
  const ranks = new Array<number>(rows.length);
  order.forEach((idx, p) => {
    ranks[idx] = p > 0 && Math.abs(scores[order[p - 1]] - scores[idx]) < 1e-12 ? ranks[order[p - 1]] : p + 1;
  });
  return { scores, ranks };
}
