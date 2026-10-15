// Number formatting shared by the engine's explanations and the UI

const MINUS = '−';

export function money(x: number | null | undefined, opts: { sign?: boolean; cents?: boolean } = {}): string {
  if (x == null || Number.isNaN(x)) return '-';
  const digits = opts.cents ? 2 : 0;
  const abs = Math.abs(x);
  const body = '$' + abs.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const zero = Number(abs.toFixed(digits)) === 0;
  if (x < 0 && !zero) return MINUS + body;
  if (opts.sign && x > 0 && !zero) return '+' + body;
  return body;
}

export function pct(x: number | null | undefined, digits = 1, opts: { sign?: boolean } = {}): string {
  if (x == null || Number.isNaN(x)) return '-';
  const v = x * 100;
  const s = Math.abs(v).toFixed(digits);
  if (v < 0 && Number(s) !== 0) return MINUS + s + '%';
  return (opts.sign && v > 0 && Number(s) !== 0 ? '+' : '') + s + '%';
}

export function num(x: number | null | undefined, digits = 0): string {
  if (x == null || Number.isNaN(x)) return '-';
  const s = Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return (x < 0 && Number(Math.abs(x).toFixed(digits)) !== 0 ? MINUS : '') + s;
}

export function compact(x: number | null | undefined): string {
  if (x == null) return '-';
  const a = Math.abs(x);
  if (a >= 1e9) return (x / 1e9).toFixed(a >= 1e10 ? 0 : 1) + 'B';
  if (a >= 1e6) return (x / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
  if (a >= 1e4) return (x / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'K';
  return Math.round(x).toLocaleString('en-US');
}

export function duration(ms: number): string {
  if (!Number.isFinite(ms)) return '-';
  if (ms < 1000) return `${Math.max(1, Math.round(ms))} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)} s`;
  return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

export const signClass = (x: number | null | undefined) => (x == null ? '' : x > 0 ? 'pos' : x < 0 ? 'neg' : '');

export function payoutLabel(p: number): string {
  if (Math.abs(p - 1.5) < 1e-9) return '3:2';
  if (Math.abs(p - 1.2) < 1e-9) return '6:5';
  if (Math.abs(p - 1) < 1e-9) return '1:1';
  return `${p}:1`;
}

export function dateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
