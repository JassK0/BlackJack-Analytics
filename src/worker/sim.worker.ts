// Runs experiments off the main thread so the page stays responsive
import { simulate } from '../engine/simulate';
import type { RunConfig } from '../engine/stats';

interface Scope {
  postMessage(msg: unknown): void;
  onmessage: ((e: MessageEvent<{ type: 'run'; token: number; config: RunConfig }>) => void) | null;
}
const scope = self as unknown as Scope;

scope.onmessage = (e) => {
  const { token, config } = e.data;
  try {
    const result = simulate(config, (progress) => scope.postMessage({ type: 'progress', token, progress }));
    scope.postMessage({ type: 'done', token, result });
  } catch (err) {
    scope.postMessage({ type: 'error', token, message: err instanceof Error ? err.message : String(err) });
  }
};
