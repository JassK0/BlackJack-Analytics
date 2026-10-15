// Minimal scales and "nice" ticks for the SVG charts

export interface Scale {
  (v: number): number;
  invert(px: number): number;
  domain: [number, number];
  ticks: number[];
}

export function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / mag;
  return (n >= 7.5 ? 10 : n >= 3.5 ? 5 : n >= 1.5 ? 2 : 1) * mag;
}

export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) { const d = Math.abs(min) || 1; min -= d / 2; max += d / 2; }
  const step = niceStep(max - min, count);
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

/** Expand [min, max] outward to tick boundaries. */
export function niceDomain(min: number, max: number, count = 5): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) { const d = Math.abs(min) * 0.1 || 1; min -= d; max += d; }
  const step = niceStep(max - min, count);
  return [Math.floor(min / step) * step, Math.ceil(max / step) * step];
}

export function linear(domain: [number, number], range: [number, number], tickCount = 5): Scale {
  const [d0, d1] = domain, [r0, r1] = range;
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  const f = ((v: number) => r0 + (v - d0) * k) as Scale;
  f.invert = (px) => (k === 0 ? d0 : d0 + (px - r0) / k);
  f.domain = domain;
  f.ticks = niceTicks(Math.min(d0, d1), Math.max(d0, d1), tickCount);
  return f;
}

export function log10(domain: [number, number], range: [number, number]): Scale {
  const l0 = Math.log10(Math.max(1e-9, domain[0])), l1 = Math.log10(Math.max(1e-9, domain[1]));
  const [r0, r1] = range;
  const k = l1 === l0 ? 0 : (r1 - r0) / (l1 - l0);
  const f = ((v: number) => r0 + (Math.log10(Math.max(1e-9, v)) - l0) * k) as Scale;
  f.invert = (px) => 10 ** (l0 + (px - r0) / (k || 1));
  f.domain = domain;
  f.ticks = [];
  for (let e = Math.ceil(l0); e <= Math.floor(l1); e++) f.ticks.push(10 ** e);
  return f;
}

/** Index of the value in a sorted array closest to v. */
export function nearest(sorted: number[], v: number): number {
  let lo = 0, hi = sorted.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < v) lo = mid; else hi = mid;
  }
  return Math.abs(sorted[hi] - v) < Math.abs(sorted[lo] - v) ? hi : lo;
}
