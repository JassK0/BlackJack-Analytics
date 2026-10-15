// Which strategies exist, how they're identified, and which colour each one wears
import type { BuiltinKey, BuiltinOptions, CustomStrategy, StrategySpec } from '../engine/types';
import { BUILTINS } from '../engine/strategies';

export const MAX_COMPARE = 8;          // the categorical palette has 8 validated slots
const BUILTIN_SLOT: Record<BuiltinKey, number> = {
  flat: 0, martingale: 1, paroli: 2, '1326': 3, oscars_grind: 4, dalembert: 5, fibonacci: 6, labouchere: 7,
};

export const builtinId = (k: BuiltinKey) => `b:${k}`;
export const customId = (c: CustomStrategy) => `c:${c.id}`;

export function allSpecs(options: BuiltinOptions, customs: CustomStrategy[]): StrategySpec[] {
  return [
    ...BUILTINS.map((b) => ({ id: builtinId(b.key), name: b.name, slot: BUILTIN_SLOT[b.key], def: { kind: 'builtin' as const, key: b.key, options } })),
    ...customs.map((c) => ({ id: customId(c), name: c.name, slot: c.slot, def: { kind: 'custom' as const, def: c } })),
  ];
}

/**
 * Colour follows the strategy, not its rank. Built-ins own slots 0-4; custom
 * strategies keep their preferred slot unless another selected strategy already
 * has it, in which case they take the first free one.
 */
export function withSlots(specs: StrategySpec[]): StrategySpec[] {
  const taken = new Set<number>();
  const out = specs.map((s) => ({ ...s }));
  for (const s of out) if (s.def.kind === 'builtin') taken.add(s.slot);
  for (const s of out) {
    if (s.def.kind === 'builtin') continue;
    if (taken.has(s.slot)) s.slot = [5, 6, 7, 0, 1, 2, 3, 4].find((k) => !taken.has(k)) ?? s.slot;
    taken.add(s.slot);
  }
  return out;
}

/** The next preferred slot for a new custom strategy. */
export function nextCustomSlot(customs: CustomStrategy[]): number {
  const counts = [5, 6, 7].map((k) => customs.filter((c) => c.slot === k).length);
  return 5 + counts.indexOf(Math.min(...counts));
}

export const colorOf = (slot: number) => `var(--s${slot})`;
