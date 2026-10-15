// Count & Conquer: the city map, Slay-the-Spire style
import { useMemo, useState, type KeyboardEvent } from 'react';
import { money } from '../../lib/format';
import { CITIES, NODE_LABEL, type NodeType } from '../../conquer/data';
import { freeWatch, HOT_TC, MAP_ROWS, stream, type MapNode } from '../../conquer/engine';
import { buyIn, enterNode, isTable, reachable, specFor, type RunState } from '../../conquer/run';
import { sound } from '../../conquer/audio';
import { Icon, iconPaths, Neon, Skyline } from './art';

const ROMAN = ['', 'I', 'II', 'III'];
const NODE_TEXT: Record<Exclude<NodeType, 'casino' | 'elite' | 'boss'>, string> = {
  event: 'Something happens here: a hustler, a pawnshop, an old friend. Every event gives you a choice.',
  shop: 'A back-alley dealer in "gear": relics, a fake ID, focus tapes and strong coffee.',
  motel: 'A cheap room before the big job. Lie low, drill your counting, or work a night shift.',
};

const W = 420, H = 600, TOP = 70, BOTTOM = 545;
function place(n: MapNode) {
  const rng = stream(n.id, 'jitter');
  const x = n.type === 'boss' ? W / 2 : 62 + n.lane * ((W - 124) / 3) + (rng() - 0.5) * 26;
  const y = BOTTOM - (n.row / MAP_ROWS) * (BOTTOM - TOP) + (n.type === 'boss' ? 0 : (rng() - 0.5) * 18);
  return { x, y };
}

export function MapView({ run, setRun }: { run: RunState; setRun: (fn: (r: RunState) => RunState) => void }) {
  const city = CITIES[run.act - 1];
  const open = reachable(run);
  const openIds = new Set(open.map((n) => n.id));
  const pos = useMemo(() => new Map(run.map.nodes.map((n) => [n.id, place(n)])), [run.map]);
  const [focus, setFocus] = useState<string | null>(null);
  const shown = run.map.nodes.find((n) => n.id === focus) ?? null;
  const visited = new Set(run.visited);
  const walked = new Set<string>();
  for (let i = 1; i < run.visited.length; i++) walked.add(`${run.visited[i - 1]}>${run.visited[i]}`);

  const go = (n: MapNode) => {
    if (!openIds.has(n.id)) return;
    sound.play('click');
    setRun((r) => enterNode(r, n.id));
  };
  const onKey = (e: KeyboardEvent, n: MapNode) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(n); }
  };

  return (
    <div className={`cq-mapscreen act-${run.act}`}>
      <div className="cq-map-head">
        <span className="cq-act">Act {ROMAN[run.act]}</span>
        <Neon text={city.name.toUpperCase()} tone={run.act === 1 ? 'gold' : run.act === 2 ? 'pink' : 'cyan'} as="h1" dying={run.act === 1 ? 3 : undefined} />
        <p>{city.tagline}</p>
      </div>

      <div className="cq-map-body">
        <div className="cq-map-wrap">
          <Skyline act={run.act} className="cq-map-sky" />
          <svg className="cq-map" viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`${city.name} map. ${open.length} places you can go next.`}>
            <defs>
              <filter id="cq-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>
            {run.map.nodes.flatMap((n) => n.next.map((to) => {
              const a = pos.get(n.id)!, b = pos.get(to)!;
              const cls = walked.has(`${n.id}>${to}`) ? 'walked' : n.id === run.at && openIds.has(to) ? 'open' : 'dim';
              const mx = (a.x + b.x) / 2 + (a.x === b.x ? 0 : 6);
              return <path key={`${n.id}>${to}`} d={`M${a.x} ${a.y} Q ${mx} ${(a.y + b.y) / 2} ${b.x} ${b.y}`} className={`cq-edge ${cls}`} />;
            }))}
            {run.map.nodes.map((n) => {
              const p = pos.get(n.id)!;
              const isOpen = openIds.has(n.id), here = run.at === n.id, been = visited.has(n.id) && !here;
              const boss = n.type === 'boss';
              const r = boss ? 30 : n.type === 'elite' ? 22 : 19;
              const label = `${boss ? specFor(run, n).name : NODE_LABEL[n.type]}${isOpen ? ', you can go here' : here ? ', you are here' : been ? ', visited' : ''}`;
              return (
                <g key={n.id} className={`cq-node t-${n.type}${isOpen ? ' open' : ''}${here ? ' here' : ''}${been ? ' been' : ''}${focus === n.id ? ' focus' : ''}`}
                  transform={`translate(${p.x} ${p.y})`} role={isOpen ? 'button' : 'img'} tabIndex={isOpen ? 0 : -1} aria-label={label}
                  onClick={() => go(n)} onKeyDown={(e) => onKey(e, n)} onMouseEnter={() => setFocus(n.id)} onFocus={() => setFocus(n.id)}>
                  <g className="cq-node-inner">
                    {isOpen && <circle r={r + 9} className="cq-node-halo" />}
                    <circle r={r} className="cq-node-disc" filter={isOpen || here ? 'url(#cq-glow)' : undefined} />
                    <g transform={`translate(${-r * 0.55} ${-r * 0.55}) scale(${(r * 1.1) / 24})`} className="cq-node-icon">{iconPaths(boss ? 'boss' : n.type)}</g>
                    {been && <path d="M-6 0l4 4 8-9" className="cq-node-check" transform={`translate(${r * 0.75} ${-r * 0.75}) scale(0.7)`} />}
                  </g>
                </g>
              );
            })}
            {!run.at && <text x={W / 2} y={H - 8} textAnchor="middle" className="cq-map-start">START HERE</text>}
          </svg>
        </div>

        <aside className="cq-map-side" aria-live="polite">
          {shown ? <NodeInfo run={run} node={shown} open={openIds.has(shown.id)} onGo={() => go(shown)} /> : (
            <div className="cq-node-info">
              <h3>Pick your next stop</h3>
              <p>Glowing stops are where you can go next. Paths only lead upward, toward the boss casino at the top.</p>
            </div>
          )}
          <ul className="cq-legend">
            {(['casino', 'elite', 'event', 'shop', 'motel', 'boss'] as NodeType[]).map((t) => (
              <li key={t}><span className={`cq-legend-dot t-${t}`}><Icon name={t} size={14} /></span>{NODE_LABEL[t]}</li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}

function NodeInfo({ run, node, open, onGo }: { run: RunState; node: MapNode; open: boolean; onGo: () => void }) {
  if (!isTable(node.type)) {
    return (
      <div className={`cq-node-info t-${node.type}`}>
        <span className="cq-chip-label"><Icon name={node.type} size={14} /> {NODE_LABEL[node.type]}</span>
        <h3>{node.type === 'event' ? '???' : NODE_LABEL[node.type]}</h3>
        <p>{NODE_TEXT[node.type as 'event' | 'shop' | 'motel']}</p>
        {open && <button type="button" className="cq-btn primary" onClick={onGo}>Go here</button>}
      </div>
    );
  }
  const s = specFor(run, node);
  const poor = run.bankroll < buyIn(s);
  return (
    <div className={`cq-node-info t-${node.type}`}>
      <span className="cq-chip-label"><Icon name={node.type === 'boss' ? 'boss' : node.type} size={14} /> {NODE_LABEL[node.type]}</span>
      <h3>{s.name}</h3>
      <p>{s.blurb}</p>
      <dl className="cq-specs">
        <div><dt>The job</dt><dd>{money(s.target)} hot money</dd></div>
        <div><dt>Shoe</dt><dd>{s.decks === 1 ? 'Single deck' : `${s.decks} decks`}, cut at {Math.round(s.pen * 100)}%</dd></div>
        <div><dt>Limits</dt><dd>{money(s.minBet)} to {money(s.maxBet)}</dd></div>
        <div><dt>Session</dt><dd>{s.hands} hands, {freeWatch(s)} free to watch</dd></div>
        <div><dt>Regulars</dt><dd>{s.npcs.join(' and ') || 'Nobody'}</dd></div>
        <div><dt>Rules</dt><dd>{s.bjPays === 1.5 ? '3:2' : '6:5'} blackjack, dealer {s.h17 ? 'hits' : 'stands on'} soft 17</dd></div>
        {s.tier !== 'casino' && <div><dt>Payout</dt><dd>{s.tier === 'boss' ? 'Rare relic, big cash, next city' : 'Better relics and bigger cash'}</dd></div>}
      </dl>
      {s.tier === 'boss' && <p className="cq-warn">Fail the boss job and you'll need a second night, which costs half your bankroll and a star.</p>}
      {open && <button type="button" className="cq-btn primary" onClick={onGo}>{poor ? `Go anyway (you're short of ${money(buyIn(s))})` : 'Go here'}</button>}
      <p className="cq-dim">Hot money is anything you bet while the true count is +{HOT_TC} or better.</p>
    </div>
  );
}
