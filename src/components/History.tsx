// Recent runs, kept only in this browser
import type { RunResult } from '../engine/stats';
import { rulesShort } from '../engine/rules';
import { compact, dateTime, duration, money } from '../lib/format';
import { StrategyKey } from './ui';

export function History({ runs, current, onOpen, onDelete, onClear }: {
  runs: RunResult[]; current: string | null; onOpen: (r: RunResult) => void; onDelete: (r: RunResult) => void; onClear: () => void;
}) {
  return (
    <section className="card">
      <div className="card-head row">
        <div>
          <h3>Recent runs</h3>
          <p>The last few results are saved in this browser's local storage only. Nothing is sent anywhere, and clearing your browser data removes them.</p>
        </div>
        {runs.length > 0 && <button type="button" className="btn ghost small" onClick={onClear}>Clear all</button>}
      </div>
      {!runs.length && <p className="muted">No runs yet. Results appear here as soon as a simulation finishes.</p>}
      <ul className="history-list">
        {runs.map((r) => {
          const top = [...r.strategies].sort((a, b) => a.rank - b.rank)[0];
          return (
            <li key={r.id} className={r.id === current ? 'current' : ''}>
              <div className="hl-main">
                <strong>{dateTime(r.createdAt)}</strong>
                <span className="keys">{r.strategies.map((s) => <StrategyKey key={s.id} slot={s.slot} />)}</span>
                <span className="muted">{r.strategies.map((s) => s.name).join(', ')}</span>
                <span className="muted small">{rulesShort(r.config.rules)} · {money(r.config.bank.start)} bankroll · {compact(r.config.bank.sessions)} × {r.config.bank.rounds} hands · seed {r.config.seed} · {compact(r.totalHands)} hands in {duration(r.elapsedMs)}</span>
                <span className="small">Top ranked: <strong>{top.name}</strong></span>
              </div>
              <div className="hl-actions">
                <button type="button" className="btn small" onClick={() => onOpen(r)} disabled={r.id === current}>{r.id === current ? 'Showing' : 'Open'}</button>
                <button type="button" className="btn ghost small" onClick={() => onDelete(r)}>Delete</button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
