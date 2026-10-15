// Twenty-One Stakes: playing cards, charms, consumables, vouchers and packs
import { useRef, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import {
  CHARMS, COCKTAILS, ENH_INFO, FORTUNES, HANDS, PACKS, VOUCHERS, type CharmId, type Consumable, type PackKind, type PCard, type VoucherId,
} from '../../stakes/data';
import type { CharmInst } from '../../stakes/engine';

const RED = new Set(['♥', '♦']);
export interface Pop { text: string; kind: 'chips' | 'mult' | 'xmult' | 'money' | 'note'; key: number }
export const popKind = (s: { chips?: number; mult?: number; xmult?: number; money?: number }): Pop['kind'] =>
  s.xmult ? 'xmult' : s.mult ? 'mult' : s.money ? 'money' : s.chips ? 'chips' : 'note';

/** Cards lean toward the mouse, Balatro style. */
function useTilt() {
  const el = useRef<HTMLDivElement>(null);
  const onMove = (e: MouseEvent) => {
    const r = el.current?.getBoundingClientRect();
    if (!r || !el.current) return;
    el.current.style.setProperty('--rx', `${((e.clientY - r.top) / r.height - 0.5) * -16}deg`);
    el.current.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 18}deg`);
  };
  const onLeave = () => { el.current?.style.setProperty('--rx', '0deg'); el.current?.style.setProperty('--ry', '0deg'); };
  return { el, onMove, onLeave };
}

export function PlayingCard({ card, down, selected, onClick, i = 0, pop, jiggle, dim, deal, size, label }: {
  card: PCard; down?: boolean; selected?: boolean; onClick?: () => void; i?: number; pop?: Pop | null; jiggle?: number; dim?: boolean;
  deal?: 'me' | 'house' | 'none'; size?: 'sm' | 'md' | 'lg'; label?: string;
}) {
  const { el, onMove, onLeave } = useTilt();
  const stone = card.enh === 'stone';
  const face = card.rank === 'J' || card.rank === 'Q' || card.rank === 'K';
  const title = down ? 'Face-down card' : `${stone ? 'Stone card' : `${card.rank}${card.suit}`}${card.enh && !stone ? ` (${ENH_INFO[card.enh].name})` : ''}`;
  const Tag = onClick ? 'button' : 'div';
  return (
    <div ref={el} className={`sk-cardwrap${selected ? ' selected' : ''}${dim ? ' dim' : ''} deal-${deal ?? 'me'} sz-${size ?? 'md'}`} style={{ '--i': i } as CSSProperties}
      onMouseMove={onMove} onMouseLeave={onLeave}>
      <Tag type={onClick ? 'button' : undefined} className={`sk-card${down ? ' down' : ''}${card.enh ? ` e-${card.enh}` : ''}${RED.has(card.suit) ? ' red' : ''}${jiggle ? ' jiggle' : ''}`}
        onClick={onClick} aria-label={title} aria-pressed={onClick ? !!selected : undefined} key={`j${jiggle ?? 0}`}>
        <span className="sk-card-in">
          <span className="sk-face front">
            {stone ? <span className="sk-stone">STONE</span> : (
              <>
                <span className="sk-corner tl">{card.rank}<i>{card.suit}</i></span>
                <span className={`sk-pip${face ? ' face' : ''}`}>{face ? <><b>{card.rank}</b><i>{card.suit}</i></> : card.suit}</span>
                <span className="sk-corner br">{card.rank}<i>{card.suit}</i></span>
              </>
            )}
            {card.enh && !stone && <span className="sk-enh-tag">{ENH_INFO[card.enh].name}</span>}
          </span>
          <span className="sk-face back" />
        </span>
      </Tag>
      {label && <span className="sk-card-label">{label}</span>}
      {pop && <span className={`sk-pop pk-${pop.kind}`} key={`p${pop.key}`}>{pop.text}</span>}
    </div>
  );
}

export function Tip({ children, title, sub, tone }: { children: ReactNode; title: string; sub?: string; tone?: string }) {
  return (
    <span className="sk-tip" role="tooltip">
      <b className="sk-tip-title">{title}</b>
      {sub && <span className={`sk-tip-sub ${tone ?? ''}`}>{sub}</span>}
      <span className="sk-tip-body">{children}</span>
    </span>
  );
}

/** A live readout for charms that grow over a run. */
export function charmCounter(c: CharmInst): string | null {
  if (c.id === 'hot_streak') return `+${2 * (c.counter + 1)}`;
  if (c.id === 'snowball') return `+${c.counter}`;
  if (c.id === 'natural') return `×${1 + 0.25 * c.counter}`;
  if (c.id === 'compounder') return `×${Math.round((1 + 0.2 * c.counter) * 10) / 10}`;
  return null;
}

export function CharmCard({ c, id, onClick, active, pop, jiggle, off, price, sell, i = 0, children }: {
  c?: CharmInst; id?: CharmId; onClick?: () => void; active?: boolean; pop?: Pop | null; jiggle?: number; off?: boolean; price?: number; sell?: number; i?: number; children?: ReactNode;
}) {
  const cid = (c?.id ?? id)!;
  const def = CHARMS[cid];
  const { el, onMove, onLeave } = useTilt();
  const counter = c ? charmCounter(c) : null;
  return (
    <div ref={el} className={`sk-charmwrap${active ? ' active' : ''}`} style={{ '--i': i } as CSSProperties} onMouseMove={onMove} onMouseLeave={onLeave}>
      <button type="button" className={`sk-charm r-${def.rarity}${off ? ' off' : ''}${jiggle ? ' jiggle' : ''}`} onClick={onClick} key={`j${jiggle ?? 0}`} aria-label={`${def.name}: ${def.text}`}>
        <span className="sk-charm-art">{def.icon}</span>
        <span className="sk-charm-name">{def.name}</span>
        {counter && <span className="sk-charm-count">{counter}</span>}
        {off && <span className="sk-off">OFF</span>}
      </button>
      {price != null && <span className="sk-price">${price}</span>}
      <Tip title={def.name} sub={def.rarity} tone={def.rarity}>{def.text}{counter ? <em> Now: {counter} mult.</em> : null}{sell != null ? <small>Sells for ${sell}</small> : null}</Tip>
      {pop && <span className={`sk-pop pk-${pop.kind}`} key={`p${pop.key}`}>{pop.text}</span>}
      {children}
    </div>
  );
}

export function consInfo(c: { kind: 'cocktail' | 'fortune'; id: string }) {
  if (c.kind === 'cocktail') {
    const d = COCKTAILS[c.id as keyof typeof COCKTAILS];
    return { name: d.name, icon: d.icon, text: d.hand === 'all' ? d.text : `${d.text} ${HANDS[d.hand].name}: +${HANDS[d.hand].lvChips} chips, +${HANDS[d.hand].lvMult} mult.`, sub: 'cocktail' };
  }
  const d = FORTUNES[c.id as keyof typeof FORTUNES];
  return { name: d.name, icon: d.icon, text: d.text, sub: 'fortune' };
}

export function ConsCard({ c, item, onClick, active, price, i = 0, children }: {
  c?: Consumable; item?: { kind: 'cocktail' | 'fortune'; id: string }; onClick?: () => void; active?: boolean; price?: number; i?: number; children?: ReactNode;
}) {
  const info = consInfo((c ?? item)!);
  const kind = (c ?? item)!.kind;
  return (
    <div className={`sk-charmwrap cons${active ? ' active' : ''}`} style={{ '--i': i } as CSSProperties}>
      <button type="button" className={`sk-charm k-${kind}`} onClick={onClick} aria-label={`${info.name}: ${info.text}`}>
        <span className="sk-charm-art">{info.icon}</span>
        <span className="sk-charm-name">{info.name}</span>
      </button>
      {price != null && <span className="sk-price">${price}</span>}
      <Tip title={info.name} sub={info.sub} tone={kind}>{info.text}</Tip>
      {children}
    </div>
  );
}

export function VoucherCard({ id, price, onClick, sold }: { id: VoucherId; price: number; onClick?: () => void; sold?: boolean }) {
  const v = VOUCHERS[id];
  return (
    <div className="sk-charmwrap voucher">
      <button type="button" className="sk-voucher" onClick={onClick} disabled={sold} aria-label={`Voucher ${v.name}: ${v.text}`}>
        <span className="sk-voucher-art">🎟️</span>
        <span className="sk-charm-name">{v.name}</span>
      </button>
      {!sold && <span className="sk-price">${price}</span>}
      <Tip title={v.name} sub="voucher" tone="voucher">{v.text}</Tip>
    </div>
  );
}

export function PackCard({ kind, price, onClick, sold }: { kind: PackKind; price: number; onClick?: () => void; sold?: boolean }) {
  const p = PACKS[kind];
  return (
    <div className="sk-charmwrap pack">
      <button type="button" className={`sk-pack p-${kind}`} onClick={onClick} disabled={sold} aria-label={`${p.name}: ${p.text}`}>
        <span className="sk-pack-art">{p.icon}</span>
        <span className="sk-charm-name">{sold ? 'Opened' : p.name}</span>
      </button>
      {!sold && <span className="sk-price">${price}</span>}
      <Tip title={p.name} sub="booster pack" tone="pack">{p.text}</Tip>
    </div>
  );
}
