import { useMemo, useState } from 'react';
import { linear, log10, nearest, niceDomain } from './scale';
import { pathFrom, textWidth, Tooltip, XAxis, YAxis, type Tip } from './common';
import { useWidth } from './useWidth';

export interface LineSeries {
  id: string; name: string; color: string;
  points: [number, number | null][];
  width?: number; opacity?: number; step?: boolean; hover?: boolean; endDot?: boolean;
}
export interface Band { id: string; color: string; opacity: number; points: [number, number, number][] }
export interface Spaghetti { id: string; color: string; opacity: number; width?: number; lines: [number, number][][] }
export interface RefLine { axis: 'x' | 'y'; value: number; label?: string }

interface Props {
  series: LineSeries[];
  bands?: Band[];
  spaghetti?: Spaghetti[];
  height?: number;
  xTitle?: string; yTitle?: string;
  xFormat?: (v: number) => string; yFormat?: (v: number) => string;
  valueFormat?: (v: number) => string;
  hoverTitle?: (x: number) => string;
  xLog?: boolean; xDomain?: [number, number]; yDomain?: [number, number]; yZero?: boolean;
  refLines?: RefLine[];
  onClickX?: (x: number) => void;
  ariaLabel: string;
}

const fmt = (v: number) => v.toLocaleString('en-US');

export function LineChart({
  series, bands = [], spaghetti = [], height = 280, xTitle, yTitle, xFormat = fmt, yFormat = fmt, valueFormat,
  hoverTitle, xLog, xDomain, yDomain, yZero, refLines = [], onClickX, ariaLabel,
}: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ i: number; px: number; py: number } | null>(null);

  const geo = useMemo(() => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const seeX = (v: number) => { if (v < x0) x0 = v; if (v > x1) x1 = v; };
    const seeY = (v: number | null) => { if (v == null || !Number.isFinite(v)) return; if (v < y0) y0 = v; if (v > y1) y1 = v; };
    for (const s of series) for (const [x, y] of s.points) { seeX(x); seeY(y); }
    for (const b of bands) for (const [x, lo, hi] of b.points) { seeX(x); seeY(lo); seeY(hi); }
    for (const sp of spaghetti) for (const l of sp.lines) for (const [x, y] of l) { seeX(x); seeY(y); }
    for (const r of refLines) (r.axis === 'y' ? seeY : seeX)(r.value);
    if (yZero) { seeY(0); }
    if (!Number.isFinite(y0)) { y0 = 0; y1 = 1; }
    if (!Number.isFinite(x0)) { x0 = 0; x1 = 1; }
    const yd = yDomain ?? niceDomain(y0, y1, Math.max(3, Math.round(height / 60)));
    const xd = xDomain ?? [x0, x1];
    return { xd: xd as [number, number], yd };
  }, [series, bands, spaghetti, refLines, yZero, yDomain, xDomain, height]);

  const yTicksProbe = linear(geo.yd, [0, 1], Math.max(3, Math.round(height / 60))).ticks;
  const left = Math.max(...yTicksProbe.map((t) => textWidth(yFormat(t)))) + 14 + (yTitle ? 18 : 0);
  const m = { left, right: 16, top: 10, bottom: xTitle ? 46 : 28 };
  const iw = Math.max(10, width - m.left - m.right), ih = height - m.top - m.bottom;
  const x = xLog ? log10(geo.xd, [0, iw]) : linear(geo.xd, [0, iw], Math.max(2, Math.round(iw / 90)));
  const y = linear(geo.yd, [ih, 0], Math.max(3, Math.round(height / 60)));
  const xTicks = xLog ? x.ticks : x.ticks.filter((t) => t >= geo.xd[0] - 1e-9 && t <= geo.xd[1] + 1e-9);

  const hoverable = useMemo(() => series.filter((s) => s.hover !== false && s.points.length), [series]);
  const xs = useMemo(() => {
    const set = new Set<number>();
    for (const s of hoverable) for (const [xv, yv] of s.points) if (yv != null) set.add(xv);
    return [...set].sort((a, b) => a - b);
  }, [hoverable]);

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (!xs.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = nearest(xs, x.invert(px));
    setHover({ i, px: x(xs[i]) + m.left, py: e.clientY - rect.top + m.top });
  };

  let tip: Tip | null = null;
  const markers: { cx: number; cy: number; color: string }[] = [];
  if (hover && xs.length) {
    const xv = xs[hover.i];
    tip = { title: hoverTitle ? hoverTitle(xv) : xFormat(xv), rows: [] };
    for (const s of hoverable) {
      const sx = s.points.map((p) => p[0]);
      const j = nearest(sx, xv);
      const yv = s.points[j][1];
      if (yv == null || Math.abs(sx[j] - xv) > (geo.xd[1] - geo.xd[0]) / 50 + 1e-9) continue;
      tip.rows.push({ label: s.name, value: (valueFormat || yFormat)(yv), color: s.color });
      markers.push({ cx: x(sx[j]), cy: y(yv), color: s.color });
    }
  }

  return (
    <div className="chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          <g transform={`translate(${m.left},${m.top})`}>
            <YAxis y={y} width={iw} format={yFormat} title={yTitle} height={ih} left={m.left} />
            {refLines.map((r) => r.axis === 'y' ? (
              <g key={`ry${r.value}`}>
                <line x1={0} x2={iw} y1={y(r.value)} y2={y(r.value)} className="ref" />
                {r.label && <text x={4} y={y(r.value) - 5} className="ref-label">{r.label}</text>}
              </g>
            ) : (
              <g key={`rx${r.value}`}>
                <line x1={x(r.value)} x2={x(r.value)} y1={0} y2={ih} className="ref" />
                {r.label && <text x={x(r.value) + 4} y={10} className="ref-label">{r.label}</text>}
              </g>
            ))}
            {spaghetti.map((sp) => (
              <path key={sp.id} d={sp.lines.map((l) => pathFrom(l, x, y)).join('')} fill="none"
                style={{ stroke: sp.color }} strokeOpacity={sp.opacity} strokeWidth={sp.width ?? 1} strokeLinejoin="round" />
            ))}
            {bands.map((b) => {
              const top = b.points.map(([xv, , hi]) => `${x(xv).toFixed(1)},${y(hi).toFixed(1)}`);
              const bot = b.points.slice().reverse().map(([xv, lo]) => `${x(xv).toFixed(1)},${y(lo).toFixed(1)}`);
              return <polygon key={b.id} points={[...top, ...bot].join(' ')} style={{ fill: b.color }} fillOpacity={b.opacity} />;
            })}
            {series.map((s) => (
              <path key={s.id} d={pathFrom(s.points, x, y, s.step)} fill="none" style={{ stroke: s.color }}
                strokeOpacity={s.opacity ?? 1} strokeWidth={s.width ?? 2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {series.filter((s) => s.endDot).map((s) => {
              const last = [...s.points].reverse().find((p) => p[1] != null);
              return last ? <circle key={`e${s.id}`} cx={x(last[0])} cy={y(last[1]!)} r={5} style={{ fill: s.color, stroke: 'var(--surface)' }} strokeWidth={2} /> : null;
            })}
            <XAxis x={x} height={ih} width={iw} format={xFormat} title={xTitle} ticks={xTicks} />
            {hover && (
              <g pointerEvents="none">
                <line x1={hover.px - m.left} x2={hover.px - m.left} y1={0} y2={ih} className="crosshair" />
                {markers.map((mk, i) => <circle key={i} cx={mk.cx} cy={mk.cy} r={4} style={{ fill: mk.color, stroke: 'var(--surface)' }} strokeWidth={2} />)}
              </g>
            )}
            <rect x={0} y={0} width={iw} height={ih} fill="transparent" style={{ cursor: onClickX ? 'pointer' : 'crosshair' }}
              onPointerMove={onMove} onPointerLeave={() => setHover(null)}
              onClick={() => { if (onClickX && hover && xs.length) onClickX(xs[hover.i]); }} />
          </g>
        </svg>
      )}
      {tip && hover && tip.rows.length > 0 && <Tooltip tip={tip} x={hover.px} y={hover.py} width={width} />}
    </div>
  );
}
