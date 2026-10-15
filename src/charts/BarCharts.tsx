// Category charts: columns, horizontal dot+CI, box plots, stacked bars, scatter, heatmap
import { useState } from 'react';
import { linear, niceDomain } from './scale';
import { barPath, textWidth, Tooltip, XAxis, YAxis, type Tip } from './common';
import { useWidth } from './useWidth';

type HoverState = { tip: Tip; x: number; y: number } | null;

function useHover() {
  const [hover, setHover] = useState<HoverState>(null);
  const bind = (tip: Tip, focusable = true) => ({
    onPointerMove: (e: React.PointerEvent) => {
      const box = (e.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect();
      setHover({ tip, x: e.clientX - box.left, y: e.clientY - box.top });
    },
    onPointerLeave: () => setHover(null),
    onFocus: (e: React.FocusEvent) => {
      const svg = (e.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect();
      const r = (e.currentTarget as SVGElement).getBoundingClientRect();
      setHover({ tip, x: r.left - svg.left + r.width / 2, y: r.top - svg.top });
    },
    onBlur: () => setHover(null),
    tabIndex: focusable ? 0 : undefined,
  });
  return { hover, bind };
}

// ------------------------------------------------------------ columns

interface ColumnProps {
  categories: string[];
  values: (number | null)[];
  colors: string | string[];
  tips: Tip[];
  height?: number; yTitle?: string; xTitle?: string; yFormat?: (v: number) => string;
  ariaLabel: string;
}

export function ColumnChart({ categories, values, colors, tips, height = 260, yTitle, xTitle, yFormat = String, ariaLabel }: ColumnProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { hover, bind } = useHover();
  const vals = values.filter((v): v is number => v != null);
  const yd = niceDomain(Math.min(0, ...vals), Math.max(0, ...vals), 5);
  const probe = linear(yd, [0, 1], 5).ticks;
  const m = { left: Math.max(...probe.map((t) => textWidth(yFormat(t)))) + 14 + (yTitle ? 18 : 0), right: 12, top: 10, bottom: xTitle ? 46 : 28 };
  const iw = Math.max(10, width - m.left - m.right), ih = height - m.top - m.bottom;
  const y = linear(yd, [ih, 0], 5);
  const slot = iw / Math.max(1, categories.length);
  const bw = Math.min(24, Math.max(1, slot * (slot > 6 ? 0.6 : 0.8)));
  const every = Math.max(1, Math.ceil(30 / slot));          // thin labels so they never collide
  return (
    <div className="chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          <g transform={`translate(${m.left},${m.top})`}>
            <YAxis y={y} width={iw} format={yFormat} title={yTitle} height={ih} left={m.left} />
            <line x1={0} x2={iw} y1={y(0)} y2={y(0)} className="zero" />
            {categories.map((c, i) => {
              const v = values[i];
              const cx = slot * i + slot / 2;
              const color = Array.isArray(colors) ? colors[i] : colors;
              return (
                <g key={i} {...bind(tips[i])} className="mark" aria-label={`${c}: ${tips[i].rows[0]?.value ?? ''}`}>
                  <rect x={cx - slot / 2} y={0} width={slot} height={ih} fill="transparent" />
                  {v != null && <path d={barPath(cx - bw / 2, y(0), y(v), bw, false, bw < 8 ? 1 : 4)} style={{ fill: color }} />}
                  {i % every === 0 && <text x={cx} y={ih + 16} textAnchor="middle" className="tick">{c}</text>}
                </g>
              );
            })}
            {xTitle && <text className="axis-title" x={iw / 2} y={ih + 36} textAnchor="middle">{xTitle}</text>}
          </g>
        </svg>
      )}
      {hover && <Tooltip tip={hover.tip} x={hover.x} y={hover.y} width={width} />}
    </div>
  );
}

// ------------------------------------------------ horizontal category frame

interface HRow { label: string; tip: Tip }

function useHFrame(rows: HRow[], domain: [number, number], height: number | undefined, xTitle?: string, rowH = 38) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const left = Math.min(170, Math.max(...rows.map((r) => textWidth(r.label, 12))) + 16);
  const m = { left, right: 18, top: 6, bottom: xTitle ? 46 : 28 };
  const h = height ?? rows.length * rowH + m.top + m.bottom;
  const iw = Math.max(10, width - m.left - m.right), ih = h - m.top - m.bottom;
  const x = linear(domain, [0, iw], Math.max(2, Math.round(iw / 90)));
  const band = ih / Math.max(1, rows.length);
  return { ref, width, m, h, iw, ih, x, band };
}

function HLabels({ rows, band }: { rows: HRow[]; band: number }) {
  return <>{rows.map((r, i) => <text key={r.label} x={-10} y={band * i + band / 2} dy="0.32em" textAnchor="end" className="cat">{r.label}</text>)}</>;
}

function VGrid({ x, ih, format }: { x: ReturnType<typeof linear>; ih: number; format: (v: number) => string }) {
  return <>{x.ticks.map((t) => <line key={t} x1={x(t)} x2={x(t)} y1={0} y2={ih} className="grid" data-v={format(t)} />)}</>;
}

// dot + confidence interval

export interface DotRow extends HRow { color: string; value: number; lo: number; hi: number }

export function DotRangeChart({ rows, xTitle, xFormat = String, zeroLine = true, ariaLabel, height }: { rows: DotRow[]; xTitle?: string; xFormat?: (v: number) => string; zeroLine?: boolean; ariaLabel: string; height?: number }) {
  const lo = Math.min(...rows.map((r) => r.lo), zeroLine ? 0 : Infinity);
  const hi = Math.max(...rows.map((r) => r.hi), zeroLine ? 0 : -Infinity);
  const f = useHFrame(rows, niceDomain(lo, hi, 5), height, xTitle, 40);
  const { hover, bind } = useHover();
  return (
    <div className="chart" ref={f.ref} style={{ height: f.h }}>
      {f.width > 0 && (
        <svg width={f.width} height={f.h} role="img" aria-label={ariaLabel}>
          <g transform={`translate(${f.m.left},${f.m.top})`}>
            <VGrid x={f.x} ih={f.ih} format={xFormat} />
            {zeroLine && <line x1={f.x(0)} x2={f.x(0)} y1={0} y2={f.ih} className="zero strong" />}
            <HLabels rows={rows} band={f.band} />
            {rows.map((r, i) => {
              const cy = f.band * i + f.band / 2;
              return (
                <g key={r.label} {...bind(r.tip)} className="mark" aria-label={`${r.label}: ${r.tip.rows[0]?.value}`}>
                  <rect x={0} y={cy - f.band / 2} width={f.iw} height={f.band} fill="transparent" />
                  <line x1={f.x(r.lo)} x2={f.x(r.hi)} y1={cy} y2={cy} style={{ stroke: r.color }} strokeWidth={2} strokeLinecap="round" />
                  <line x1={f.x(r.lo)} x2={f.x(r.lo)} y1={cy - 5} y2={cy + 5} style={{ stroke: r.color }} strokeWidth={2} />
                  <line x1={f.x(r.hi)} x2={f.x(r.hi)} y1={cy - 5} y2={cy + 5} style={{ stroke: r.color }} strokeWidth={2} />
                  <circle cx={f.x(r.value)} cy={cy} r={6} style={{ fill: r.color, stroke: 'var(--surface)' }} strokeWidth={2} />
                </g>
              );
            })}
            <XAxis x={f.x} height={f.ih} width={f.iw} format={xFormat} title={xTitle} />
          </g>
        </svg>
      )}
      {hover && <Tooltip tip={hover.tip} x={hover.x} y={hover.y} width={f.width} />}
    </div>
  );
}

// box plot

export interface BoxRow extends HRow { color: string; q1: number; median: number; q3: number; lo: number; hi: number; mean: number }

export function BoxChart({ rows, xTitle, xFormat = String, ariaLabel }: { rows: BoxRow[]; xTitle?: string; xFormat?: (v: number) => string; ariaLabel: string }) {
  const f = useHFrame(rows, niceDomain(0, Math.max(1, ...rows.map((r) => r.hi)), 5), undefined, xTitle, 40);
  const { hover, bind } = useHover();
  const bh = Math.min(20, f.band * 0.5);
  return (
    <div className="chart" ref={f.ref} style={{ height: f.h }}>
      {f.width > 0 && (
        <svg width={f.width} height={f.h} role="img" aria-label={ariaLabel}>
          <g transform={`translate(${f.m.left},${f.m.top})`}>
            <VGrid x={f.x} ih={f.ih} format={xFormat} />
            <HLabels rows={rows} band={f.band} />
            {rows.map((r, i) => {
              const cy = f.band * i + f.band / 2;
              return (
                <g key={r.label} {...bind(r.tip)} className="mark" aria-label={`${r.label}: median ${xFormat(r.median)}`}>
                  <rect x={0} y={cy - f.band / 2} width={f.iw} height={f.band} fill="transparent" />
                  <line x1={f.x(r.lo)} x2={f.x(r.q1)} y1={cy} y2={cy} style={{ stroke: r.color }} strokeWidth={1.5} />
                  <line x1={f.x(r.q3)} x2={f.x(r.hi)} y1={cy} y2={cy} style={{ stroke: r.color }} strokeWidth={1.5} />
                  <line x1={f.x(r.lo)} x2={f.x(r.lo)} y1={cy - bh / 3} y2={cy + bh / 3} style={{ stroke: r.color }} strokeWidth={1.5} />
                  <line x1={f.x(r.hi)} x2={f.x(r.hi)} y1={cy - bh / 3} y2={cy + bh / 3} style={{ stroke: r.color }} strokeWidth={1.5} />
                  <rect x={f.x(r.q1)} y={cy - bh / 2} width={Math.max(1, f.x(r.q3) - f.x(r.q1))} height={bh} rx={4}
                    style={{ fill: r.color, stroke: r.color }} fillOpacity={0.14} strokeWidth={2} />
                  <line x1={f.x(r.median)} x2={f.x(r.median)} y1={cy - bh / 2} y2={cy + bh / 2} style={{ stroke: r.color }} strokeWidth={2.5} />
                  <circle cx={f.x(r.mean)} cy={cy} r={3.5} style={{ fill: 'var(--surface)', stroke: r.color }} strokeWidth={1.5} />
                </g>
              );
            })}
            <XAxis x={f.x} height={f.ih} width={f.iw} format={xFormat} title={xTitle} />
          </g>
        </svg>
      )}
      {hover && <Tooltip tip={hover.tip} x={hover.x} y={hover.y} width={f.width} />}
    </div>
  );
}

// stacked shares

export interface StackRow extends HRow { parts: { value: number; color: string; label: string }[] }

export function StackedBarChart({ rows, xTitle, ariaLabel }: { rows: StackRow[]; xTitle?: string; ariaLabel: string }) {
  const f = useHFrame(rows, [0, 1], undefined, xTitle, 36);
  const { hover, bind } = useHover();
  const bh = Math.min(22, f.band * 0.6);
  const pctFmt = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <div className="chart" ref={f.ref} style={{ height: f.h }}>
      {f.width > 0 && (
        <svg width={f.width} height={f.h} role="img" aria-label={ariaLabel}>
          <g transform={`translate(${f.m.left},${f.m.top})`}>
            <VGrid x={f.x} ih={f.ih} format={pctFmt} />
            <HLabels rows={rows} band={f.band} />
            {rows.map((r, i) => {
              const cy = f.band * i + f.band / 2;
              let acc = 0;
              return (
                <g key={r.label} {...bind(r.tip)} className="mark" aria-label={r.label}>
                  {r.parts.map((p, j) => {
                    const x0 = f.x(acc), x1 = f.x(acc + p.value);
                    acc += p.value;
                    return <rect key={j} x={x0 + (j ? 1 : 0)} y={cy - bh / 2} width={Math.max(0, x1 - x0 - (j ? 1 : 0) - (j < r.parts.length - 1 ? 1 : 0))} height={bh} style={{ fill: p.color }} />;
                  })}
                </g>
              );
            })}
            <XAxis x={f.x} height={f.ih} width={f.iw} format={pctFmt} title={xTitle} />
          </g>
        </svg>
      )}
      {hover && <Tooltip tip={hover.tip} x={hover.x} y={hover.y} width={f.width} />}
    </div>
  );
}

// ------------------------------------------------------------- scatter

export interface ScatterPoint { label: string; color: string; x: number; y: number; yLo: number; yHi: number; tip: Tip }

export function ScatterChart({ points, height = 300, xTitle, yTitle, xFormat = String, yFormat = String, ariaLabel }: { points: ScatterPoint[]; height?: number; xTitle?: string; yTitle?: string; xFormat?: (v: number) => string; yFormat?: (v: number) => string; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { hover, bind } = useHover();
  const yd = niceDomain(Math.min(0, ...points.map((p) => p.yLo)), Math.max(0, ...points.map((p) => p.yHi)), 5);
  const xd = niceDomain(0, Math.max(1, ...points.map((p) => p.x)) * 1.08, 5);
  const probe = linear(yd, [0, 1], 5).ticks;
  const m = { left: Math.max(...probe.map((t) => textWidth(yFormat(t)))) + 14 + (yTitle ? 18 : 0), right: 24, top: 22, bottom: xTitle ? 46 : 28 };
  const iw = Math.max(10, width - m.left - m.right), ih = height - m.top - m.bottom;
  const x = linear(xd, [0, iw], Math.max(2, Math.round(iw / 90))), y = linear(yd, [ih, 0], 5);
  const placed: { x: number; y: number; w: number }[] = [];
  const below = points.map((p) => {
    const px = x(p.x), py = y(p.y), w = textWidth(p.label, 12);
    const hit = placed.some((q) => Math.abs(q.x - px) < (q.w + w) / 2 + 6 && Math.abs(q.y - (py - 11)) < 15);
    placed.push({ x: px, y: hit ? py + 22 : py - 11, w });
    return hit;
  });
  return (
    <div className="chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          <g transform={`translate(${m.left},${m.top})`}>
            <YAxis y={y} width={iw} format={yFormat} title={yTitle} height={ih} left={m.left} />
            <line x1={0} x2={iw} y1={y(0)} y2={y(0)} className="zero strong" />
            {points.map((p, i) => (
              <g key={p.label} {...bind(p.tip)} className="mark" aria-label={p.label}>
                <line x1={x(p.x)} x2={x(p.x)} y1={y(p.yLo)} y2={y(p.yHi)} style={{ stroke: p.color }} strokeOpacity={0.55} strokeWidth={1.5} />
                <circle cx={x(p.x)} cy={y(p.y)} r={14} fill="transparent" />
                <circle cx={x(p.x)} cy={y(p.y)} r={6.5} style={{ fill: p.color, stroke: 'var(--surface)' }} strokeWidth={2} />
                <text x={x(p.x)} y={below[i] ? y(p.y) + 22 : y(p.y) - 11} textAnchor="middle" className="point-label">{p.label}</text>
              </g>
            ))}
            <XAxis x={x} height={ih} width={iw} format={xFormat} title={xTitle} />
          </g>
        </svg>
      )}
      {hover && <Tooltip tip={hover.tip} x={hover.x} y={hover.y} width={width} />}
    </div>
  );
}

// ------------------------------------------------------------- heatmap

export function Heatmap({ rows, cols, values, tips, xTitle, ariaLabel, limit = 1 }: { rows: string[]; cols: string[]; values: (number | null)[][]; tips: (r: number, c: number) => Tip; xTitle?: string; ariaLabel: string; limit?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { hover, bind } = useHover();
  const m = { left: Math.max(...rows.map((r) => textWidth(r, 11))) + 14, right: 10, top: 4, bottom: xTitle ? 44 : 26 };
  const cellH = 17;
  const h = rows.length * cellH + m.top + m.bottom;
  const iw = Math.max(10, width - m.left - m.right);
  const cw = iw / cols.length;
  const fill = (v: number | null) => {
    if (v == null) return 'transparent';
    const t = Math.max(-1, Math.min(1, v / limit));
    const p = Math.round(Math.abs(t) * 100);
    return `color-mix(in oklab, var(${t >= 0 ? '--div-pos' : '--div-neg'}) ${p}%, var(--div-mid))`;
  };
  return (
    <div className="chart" ref={ref} style={{ height: h }}>
      {width > 0 && (
        <svg width={width} height={h} role="img" aria-label={ariaLabel}>
          <g transform={`translate(${m.left},${m.top})`}>
            {rows.map((r, i) => (
              <g key={r}>
                <text x={-8} y={i * cellH + cellH / 2} dy="0.32em" textAnchor="end" className="tick">{r}</text>
                {cols.map((c, j) => {
                  const v = values[i][j];
                  return (
                    <rect key={c} x={j * cw + 1} y={i * cellH + 1} width={Math.max(0, cw - 2)} height={cellH - 2} rx={2}
                      style={{ fill: fill(v), stroke: v == null ? 'var(--grid)' : 'none' }} {...bind(tips(i, j), false)} className="cell"
                      aria-label={`${r} vs ${c}`} />
                  );
                })}
              </g>
            ))}
            {cols.map((c, j) => <text key={c} x={j * cw + cw / 2} y={rows.length * cellH + 16} textAnchor="middle" className="tick">{c}</text>)}
            {xTitle && <text className="axis-title" x={iw / 2} y={rows.length * cellH + 36} textAnchor="middle">{xTitle}</text>}
          </g>
        </svg>
      )}
      {hover && <Tooltip tip={hover.tip} x={hover.x} y={hover.y} width={width} />}
    </div>
  );
}

export function HeatLegend({ limitLabel }: { limitLabel: string }) {
  return (
    <div className="heat-legend" aria-hidden="true">
      <span>{`−${limitLabel}`}</span>
      <i style={{ background: 'linear-gradient(90deg, var(--div-neg), var(--div-mid), var(--div-pos))' }} />
      <span>{`+${limitLabel}`}</span>
      <em>house edge ← → player edge</em>
    </div>
  );
}
