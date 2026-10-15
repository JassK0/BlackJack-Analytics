// A whole Monte Carlo experiment: every strategy, every session, streamed into accumulators
import { runSession } from './session';
import { Accumulator, composite, DEFAULT_WEIGHTS, histogram, samplePoints, type Progress, type RunConfig, type RunResult } from './stats';

export function simulate(cfg: RunConfig, onProgress?: (p: Progress) => void, everyMs = 100): RunResult {
  const t0 = performance.now();
  const accs = cfg.strategies.map((s) => new Accumulator(s, cfg));
  const { sessions } = cfg.bank;
  let last = t0;
  let hands = 0;
  const report = () => {
    onProgress?.({ done: accs[0].done * accs.length, total: sessions * accs.length, hands, elapsedMs: performance.now() - t0, per: accs.map((a) => a.progress()) });
  };
  // strategies are interleaved so the live view advances them side by side
  for (let s = 0; s < sessions; s++) {
    for (const acc of accs) {
      acc.beginSession();
      const { summary } = runSession(acc.spec.def, cfg.rules, cfg.bank, cfg.seed, s, { onHand: acc.onHand });
      acc.endSession(s, summary);
      hands += summary.rounds;
    }
    if (onProgress && (s & 7) === 7) {
      const now = performance.now();
      if (now - last >= everyMs) { last = now; report(); }
    }
  }
  report();
  const strategies = accs.map((a) => a.finalize());
  const { scores, ranks } = composite(strategies, DEFAULT_WEIGHTS);
  strategies.forEach((r, i) => { r.score = scores[i]; r.rank = ranks[i]; });
  return {
    id: Math.random().toString(36).slice(2, 10),
    createdAt: Date.now(),
    config: cfg,
    elapsedMs: performance.now() - t0,
    totalHands: hands,
    totalSessions: sessions * accs.length,
    xs: samplePoints(cfg.bank.rounds),
    hist: histogram(accs, cfg.bank.unit),
    strategies,
  };
}
