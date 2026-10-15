// Shared chart pieces: tooltip, axes, legend, measuring helpers
import type { ReactNode } from 'react';
import type { Scale } from './scale';

export interface TipRow { label: string; value: string; color?: string; kind?: 'line' | 'rect' | 'dot' }
export interface Tip { title?: string; rows: TipRow[] }

export const textWidth = (s: string, px = 11) => s.length * px * 0.6;

export function Key({ color, kind = 'line', opacity = 1 }: { color: string; kind?: 'line' | 'rect' | 'dot'; opacity?: number }) {
  return <i className={`key ${kind}`} style={{ background: color, opacity }} aria-hidden="true" />;
}

export function Legend({ items }: { items: { label: string; color: string; kind?: 'line' | 'rect' | 'dot'; opacity?: number }[] }) {
  if (items.length < 2) return null;
  return (
    <div className="chart-legend">
      {items.map((it) => (
        <span key={it.label}><Key color={it.color} kind={it.kind} opacity={it.opacity} />{it.label}</span>
      ))}
    </div>
  );
}

export function Tooltip({ tip, x, y, width }: { tip: Tip; x: number; y: number; width: number }) {
  const flip = x > width - 220;
  return (
    <div className="chart-tip" style={{ left: flip ? undefined : x + 14, right: flip ? width - x + 14 : undefined, top: Math.max(0, y - 12) }} role="status">
      {tip.title && <div className="tip-title">{tip.title}</div>}
      {tip.rows.map((r, i) => (
        <div className="tip-row" key={i}>
          {r.color && <Key color={r.color} kind={r.kind || 'line'} />}
          <strong>{r.value}</strong>
          <span>{r.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Horizontal gridlines with left tick labels. */
export function YAxis({ y, width, format, title, height, left }: { y: Scale; width: number; format: (v: number) => string; title?: string; height: number; left: number }) {
  return (
    <g>
      {y.ticks.map((t) => (
        <g key={t} transform={`translate(0,${y(t)})`}>
          <line x1={0} x2={width} className="grid" />
          <text x={-8} dy="0.32em" textAnchor="end" className="tick">{format(t)}</text>
        </g>
      ))}
      {title && <text className="axis-title" transform={`translate(${-left + 12},${height / 2}) rotate(-90)`} textAnchor="middle">{title}</text>}
    </g>
  );
}

export function XAxis({ x, height, width, format, title, ticks }: { x: Scale; height: number; width: number; format: (v: number) => string; title?: string; ticks?: number[] }) {
  const t = ticks ?? x.ticks;
  return (
    <g transform={`translate(0,${height})`}>
      <line x1={0} x2={width} className="baseline" />
      {t.map((v) => (
        <text key={v} x={x(v)} y={16} textAnchor="middle" className="tick">{format(v)}</text>
      ))}
      {title && <text className="axis-title" x={width / 2} y={36} textAnchor="middle">{title}</text>}
    </g>
  );
}

export function Empty({ children, height = 220 }: { children: ReactNode; height?: number }) {
  return <div className="chart-empty" style={{ minHeight: height }}>{children}</div>;
}

export function pathFrom(points: [number, number | null][], x: (v: number) => number, y: (v: number) => number, step = false): string {
  let d = '';
  let pen = false;
  let px = 0, py = 0;
  for (const [xv, yv] of points) {
    if (yv == null || !Number.isFinite(yv)) { pen = false; continue; }
    const X = x(xv), Y = y(yv);
    if (!pen) { d += `M${X.toFixed(1)},${Y.toFixed(1)}`; pen = true; }
    else if (step) { const m = (px + X) / 2; d += `L${m.toFixed(1)},${py.toFixed(1)}L${m.toFixed(1)},${Y.toFixed(1)}L${X.toFixed(1)},${Y.toFixed(1)}`; }
    else d += `L${X.toFixed(1)},${Y.toFixed(1)}`;
    px = X; py = Y;
  }
  return d;
}

/** Bar path with a 4px rounded data end and a square baseline end. */
export function barPath(x: number, base: number, end: number, w: number, horizontal = false, r = 4): string {
  if (!horizontal) {
    const up = end < base;
    const h = Math.abs(base - end);
    const rr = Math.min(r, h, w / 2);
    if (h < 0.5) return '';
    return up
      ? `M${x},${base}V${end + rr}Q${x},${end} ${x + rr},${end}H${x + w - rr}Q${x + w},${end} ${x + w},${end + rr}V${base}Z`
      : `M${x},${base}V${end - rr}Q${x},${end} ${x + rr},${end}H${x + w - rr}Q${x + w},${end} ${x + w},${end - rr}V${base}Z`;
  }
  const right = end > base;
  const len = Math.abs(end - base);
  const rr = Math.min(r, len, w / 2);
  if (len < 0.5) return '';
  return right
    ? `M${base},${x}H${end - rr}Q${end},${x} ${end},${x + rr}V${x + w - rr}Q${end},${x + w} ${end - rr},${x + w}H${base}Z`
    : `M${base},${x}H${end + rr}Q${end},${x} ${end},${x + rr}V${x + w - rr}Q${end},${x + w} ${end + rr},${x + w}H${base}Z`;
}
