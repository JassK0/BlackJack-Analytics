// Runs experiments in a Web Worker and streams live progress into React state
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConvergencePoint, Progress, RunConfig, RunResult } from '../engine/stats';

export interface LiveStrategy { done: number; mean: number; half: number; busts: number; convergence: ConvergencePoint[] }
export interface Live {
  config: RunConfig;
  done: number; total: number; hands: number; elapsedMs: number;
  per: Record<string, LiveStrategy>;
  paths: Record<string, number[][]>;
}
export type SimStatus = 'idle' | 'running' | 'done' | 'error';
export interface SimState { status: SimStatus; live: Live | null; result: RunResult | null; error: string | null }

type Msg =
  | { type: 'progress'; token: number; progress: Progress }
  | { type: 'done'; token: number; result: RunResult }
  | { type: 'error'; token: number; message: string };

export function useSimulation(onDone: (r: RunResult) => void) {
  const worker = useRef<Worker | null>(null);
  const token = useRef(0);
  const busy = useRef(false);
  const doneRef = useRef(onDone);
  const [state, setState] = useState<SimState>({ status: 'idle', live: null, result: null, error: null });

  useEffect(() => { doneRef.current = onDone; }, [onDone]);
  useEffect(() => () => { worker.current?.terminate(); worker.current = null; busy.current = false; }, []);

  const handle = useCallback((msg: Msg) => {
    if (msg.token !== token.current) return;
    if (msg.type === 'progress') {
      const p = msg.progress;
      setState((s) => {
        if (!s.live) return s;
        const per: Record<string, LiveStrategy> = {};
        const paths: Record<string, number[][]> = { ...s.live.paths };
        for (const q of p.per) {
          per[q.id] = { done: q.done, mean: q.mean, half: q.half, busts: q.busts, convergence: q.convergence };
          if (q.newPaths.length) paths[q.id] = [...(paths[q.id] || []), ...q.newPaths];
        }
        return { ...s, live: { ...s.live, done: p.done, total: p.total, hands: p.hands, elapsedMs: p.elapsedMs, per, paths } };
      });
    } else if (msg.type === 'done') {
      busy.current = false;
      setState((s) => ({ ...s, status: 'done', result: msg.result, error: null }));
      doneRef.current(msg.result);
    } else {
      busy.current = false;
      setState((s) => ({ ...s, status: 'error', error: msg.message }));
    }
  }, []);

  const run = useCallback((config: RunConfig) => {
    const t = ++token.current;
    if (busy.current && worker.current) { worker.current.terminate(); worker.current = null; }
    if (!worker.current) {
      const w = new Worker(new URL('../worker/sim.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<Msg>) => handle(e.data);
      w.onerror = (e) => { busy.current = false; setState((s) => ({ ...s, status: 'error', error: e.message || 'The simulator crashed' })); };
      worker.current = w;
    }
    busy.current = true;
    setState((s) => ({
      ...s, status: 'running', error: null,
      live: { config, done: 0, total: config.bank.sessions * config.strategies.length, hands: 0, elapsedMs: 0, per: {}, paths: {} },
    }));
    worker.current.postMessage({ type: 'run', token: t, config });
  }, [handle]);

  const cancel = useCallback(() => {
    if (!busy.current) return;
    token.current++;
    worker.current?.terminate();
    worker.current = null;
    busy.current = false;
    setState((s) => ({ ...s, status: s.result ? 'done' : 'idle' }));
  }, []);

  const show = useCallback((result: RunResult) => {
    setState((s) => ({ ...s, result, status: busy.current ? s.status : 'done' }));
  }, []);

  return { ...state, run, cancel, show };
}
