// A strategy's name that opens its explainer drawer when clicked
import { createContext, useContext } from 'react';
import type { StrategySpec } from '../engine/types';

export const ExplainContext = createContext<(spec: StrategySpec) => void>(() => {});

export function StrategyName({ spec }: { spec: StrategySpec }) {
  const explain = useContext(ExplainContext);
  return (
    <button type="button" className="strategy-name" aria-haspopup="dialog" title={`How ${spec.name} works`}
      onClick={(e) => { e.stopPropagation(); explain(spec); }}>
      {spec.name}
    </button>
  );
}
