// Seeded random numbers, so any session can be replayed exactly from (seed, session #)

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mix(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b + 0x632be5ab) | 0, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Every strategy gets the same generator for session #s, so they all see the
 * same shuffled shoe (common random numbers, as analyze.py does with seed + s).
 */
export function sessionRng(seed: number, session: number): Rng {
  return mulberry32(mix(seed, session));
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000) + 1;
}
