import { useState, type ReactNode } from 'react';
import { Legend } from './common';

export interface TableSpec { columns: { label: string; num?: boolean }[]; rows: (string | number)[][] }

interface Props {
  title: ReactNode;
  sub?: ReactNode;
  legend?: { label: string; color: string; kind?: 'line' | 'rect' | 'dot'; opacity?: number }[];
  table?: TableSpec;
  note?: ReactNode;
  wide?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}

/** A chart with its title, legend, a table twin (every chart has one) and an optional note. */
export function ChartCard({ title, sub, legend, table, note, wide, actions, children }: Props) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={`card chart-card${wide ? ' wide' : ''}`}>
      <div className="card-head row">
        <div>
          <h3>{title}</h3>
          {sub && <p>{sub}</p>}
        </div>
        <div className="tools">
          {actions}
          {table && (
            <button type="button" className="btn ghost small" aria-pressed={asTable} onClick={() => setAsTable(!asTable)}>
              {asTable ? 'Chart' : 'Table'}
            </button>
          )}
        </div>
      </div>
      {!asTable && legend && <Legend items={legend} />}
      {asTable && table ? <DataTable {...table} /> : children}
      {note && <p className="chart-note">{note}</p>}
    </section>
  );
}

export function DataTable({ columns, rows }: TableSpec) {
  return (
    <div className="table-wrap chart-table">
      <table className="data">
        <thead><tr>{columns.map((c) => <th key={c.label} className={c.num ? 'num' : ''}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((v, j) => <td key={j} className={columns[j]?.num ? 'num' : ''}>{v}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
