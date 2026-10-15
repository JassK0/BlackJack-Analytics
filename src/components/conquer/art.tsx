// Count & Conquer: hand-built SVG art. No image files, so everything scales and themes with CSS.
import { memo, type CSSProperties, type ReactNode } from 'react';
import { mulberry32 } from '../../engine/rng';

const P: Record<string, ReactNode> = {
  // relics
  comp_card: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18M7 15h4" /></>,
  mustache: <path d="M12 11.5c-1.6-2.4-5.2-3-7.4-.8 1 .1 1.8.9 2.2 1.9 1.4 2.2 4.1 1.6 5.2-1.1 1.1 2.7 3.8 3.3 5.2 1.1.4-1 1.2-1.8 2.2-1.9-2.2-2.2-5.8-1.6-7.4.8z" />,
  lighter: <><rect x="7" y="10" width="10" height="11" rx="1.5" /><path d="M9 10V8h4v2M15.5 8.5c1.6-1.2 1.4-3.3-.2-5.3-.8 2-2.6 2.6-2 5.3" /></>,
  cheat_sheet: <><path d="M6 3h9l3 3v15H6z" /><path d="M9 9h6M9 13h6M9 17h4" /></>,
  cool_head: <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5" />,
  watch: <><circle cx="12" cy="13" r="6.5" /><path d="M12 9.5V13l2.2 1.6M9 2.5h6" /></>,
  card_sense: <><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="2.6" /><path d="M12 2v2M4.5 4.5l1.4 1.4M19.5 4.5l-1.4 1.4" /></>,
  surrender: <><path d="M6 21V4" /><path d="M6 4h11l-2.5 4L17 12H6" /></>,
  jacket: <path d="M8 3l4 4 4-4 4 3-2 5v10H6V11L4 6zM12 7v14M9 13h1M9 16h1" />,
  agent: <><path d="M3 12a9 9 0 0 1 18 0z" /><path d="M12 12v6.5a2 2 0 0 1-4 0" /></>,
  friend: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  notes: <><rect x="5" y="3" width="14" height="18" rx="1.5" /><path d="M9 3v18M12 8h4M12 12h4M12 16h2" /></>,
  spotter: <><circle cx="7" cy="15" r="3.5" /><circle cx="17" cy="15" r="3.5" /><path d="M10.5 15h3M4.5 12 7 5h3l1 6M19.5 12 17 5h-3l-1 6" /></>,
  earpiece: <><path d="M5 14v-2a7 7 0 0 1 14 0v2" /><rect x="3" y="13" width="4" height="6" rx="1.5" /><rect x="17" y="13" width="4" height="6" rx="1.5" /><path d="M19 19c0 1.5-2 2-5 2" /></>,
  rabbit: <><ellipse cx="12" cy="15.5" rx="4" ry="5" /><circle cx="6.8" cy="8.5" r="1.8" /><circle cx="10.6" cy="5.6" r="1.8" /><circle cx="15.2" cy="6.4" r="1.8" /></>,
  tracker: <path d="M3 7h4c3.2 0 4.4 10 8 10h5M17 14l3 3-3 3M3 17h4c1.4 0 2.4-1.8 3.3-3.8M13.8 9c.8-1.1 1.4-2 2.4-2H20M17 4l3 3-3 3" />,
  partner: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5h6v2M3 12.5h18M11 12.5v2h2v-2" /></>,
  lucky_chip: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.4" /><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2.1 2.1M15.9 15.9 18 18M18 6l-2.1 2.1M8.1 15.9 6 18" /></>,
  shades: <><path d="M2 9h20" /><path d="M4 9l1 5a3 3 0 0 0 6 0V9M13 9v5a3 3 0 0 0 6 0l1-5" /></>,
  // map nodes
  casino: <path d="M12 3c3 4 7 6 7 9.5a3.6 3.6 0 0 1-6.2 2.5l1 4H10.2l1-4A3.6 3.6 0 0 1 5 12.5C5 9 9 7 12 3z" />,
  elite: <><path d="M3 18h18l-1.6-10-4.6 4-2.8-7-2.8 7-4.6-4z" /><path d="M5 21h14" /></>,
  event: <><path d="M9 9a3 3 0 1 1 4.2 2.8c-.7.3-1.2 1-1.2 1.8V15" /><circle cx="12" cy="18.6" r=".9" /></>,
  shop: <><path d="M5 8h14l-1 13H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  motel: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  boss: <><path d="M12 3a8 8 0 0 0-5 14.2V20h10v-2.8A8 8 0 0 0 12 3z" /><circle cx="9" cy="11.5" r="1.7" /><circle cx="15" cy="11.5" r="1.7" /><path d="M10.3 20v-2.2M13.7 20v-2.2" /></>,
  // events and misc
  coffee: <path d="M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 11h1.5a2 2 0 0 1 0 4H16M8 3c0 2 2 2 2 4M12 3c0 2 2 2 2 4" />,
  door: <><path d="M6 21V3h12v18M3 21h18" /><circle cx="15" cy="12" r="1" /></>,
  hand: <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4a1.5 1.5 0 0 1 3 0v7M14 10.5V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 8-6.5 8-2.5 0-4-1.5-5.5-4l-2-3.5a1.5 1.5 0 0 1 2.5-1.5L8 13" />,
  slot: <><rect x="3" y="5" width="14" height="15" rx="2" /><path d="M6.5 10v5M10 10v5M13.5 10v5M17 12h2.5V6" /><circle cx="19.5" cy="4.6" r="1.3" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l3 3M14 9l2 2" /></>,
  eye: <><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="2.6" /></>,
  handshake: <path d="M2.5 11.5 6.5 7.5l4 2 3-2 3 1 5 4.5M6.5 7.5l-2.5 6 5.5 5.5 2-1 2 2 2-1 2.5-3.5M9.8 14.6l2 2M12 12.6l3 3" />,
  book: <path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z" />,
  glass: <path d="M4 4h16l-8 9zM12 13v7M8 20h8M15 7.5a1.2 1.2 0 1 0 0 .01" />,
  star: <path d="M12 3.2l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.6l-5.2 2.8 1-5.9L3.5 9.4l5.9-.8z" />,
  flame: <path d="M12 21c-4 0-6.5-2.7-6.5-6.4 0-3.6 2.7-5.3 3.6-8.6 2 1.4 2.4 3.3 2.2 5 1.2-.6 2.2-2 2.2-4 3 2.2 5 5 5 8 0 3.5-2.5 6-6.5 6z" />,
  focus: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></>,
  sound: <path d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />,
  mute: <path d="M4 9v6h4l5 4V5L8 9zM16 9.5l5 5M21 9.5l-5 5" />,
  trophy: <path d="M7 4h10v4a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M9.5 17h5v3h-5z" />,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6" /><circle cx="12" cy="17" r=".8" /></>,
  back: <path d="M15 5l-7 7 7 7" />,
  cash: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.8" /><path d="M6 9.5v5M18 9.5v5" /></>,
  bed: <path d="M3 18V7M3 13h18v5M21 13a3 3 0 0 0-3-3h-7v3M6.5 11.5a1.5 1.5 0 1 0 0-.01" />,
  dice: <><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9" cy="9" r="1" /><circle cx="15" cy="15" r="1" /><circle cx="15" cy="9" r="1" /><circle cx="9" cy="15" r="1" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>,
  id: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2.2" /><path d="M5.5 16.5c.6-1.6 1.9-2.4 3.5-2.4s2.9.8 3.5 2.4M14.5 10h4M14.5 13.5h3" /></>,
  tape: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="8" cy="12" r="2.3" /><circle cx="16" cy="12" r="2.3" /><path d="M8 14.3h8" /></>,
  espresso: <path d="M5 8h11v4a5.5 5.5 0 0 1-11 0zM16 9h1.5a2 2 0 0 1 0 4H15.5M4 20h13M9 2.5c0 1.5 1.5 1.5 1.5 3" />,
};

export function Icon({ name, size = 24, className, title }: { name: string; size?: number; className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={`cq-icon${className ? ` ${className}` : ''}`} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      {P[name] ?? P.event}
    </svg>
  );
}

/** Neon tube lettering. Tubes flicker on their own schedule; a single letter can be a dying tube. */
export function Neon({ text, tone = 'pink', size, dying, className, as: Tag = 'span' }: {
  text: string; tone?: 'pink' | 'cyan' | 'gold' | 'red' | 'green' | 'white'; size?: string; dying?: number; className?: string; as?: 'span' | 'h1' | 'h2' | 'div';
}) {
  return (
    <Tag className={`cq-neon tone-${tone}${className ? ` ${className}` : ''}`} style={size ? { fontSize: size } : undefined} aria-label={text}>
      {[...text].map((ch, i) => (
        <span key={i} aria-hidden="true" className={i === dying ? 'dying' : undefined}>{ch === ' ' ? ' ' : ch}</span>
      ))}
    </Tag>
  );
}

// ------------------------------------------------------------------ skylines

interface Building { x: number; w: number; h: number; top: 'flat' | 'spire' | 'step' | 'dome' | 'pyramid' | 'tower'; windows: { x: number; y: number; on: boolean; flick: boolean }[]; sign?: { text: string; tone: string } }

function buildSkyline(act: number): { buildings: Building[]; extras: ReactNode } {
  const rng = mulberry32(9100 + act * 77);
  const out: Building[] = [];
  const W = 1200;
  const signs = act === 1 ? [{ text: 'LIQUOR', tone: 'red' }, { text: 'MOTEL', tone: 'cyan' }, { text: 'PAWN', tone: 'gold' }, { text: '24 HRS', tone: 'pink' }]
    : act === 2 ? [{ text: 'JACKPOT', tone: 'gold' }, { text: 'SHOWS', tone: 'pink' }, { text: 'BUFFET', tone: 'cyan' }, { text: 'SLOTS', tone: 'red' }]
      : [{ text: 'CASINO', tone: 'gold' }, { text: 'HÔTEL', tone: 'cyan' }];
  let x = -20;
  let s = 0;
  while (x < W + 20) {
    const tall = act === 2 ? rng() < 0.45 : act === 3 ? rng() < 0.15 : rng() < 0.2;
    const w = act === 3 ? 34 + rng() * 40 : 36 + rng() * (tall ? 50 : 70);
    const h = act === 1 ? 40 + rng() * (tall ? 120 : 70) : act === 2 ? 50 + rng() * (tall ? 210 : 90) : 26 + rng() * (tall ? 110 : 40);
    const tops: Building['top'][] = act === 1 ? ['flat', 'flat', 'step', 'tower'] : act === 2 ? ['flat', 'spire', 'step', 'dome', 'pyramid'] : ['flat', 'dome', 'flat', 'step'];
    const top = tops[Math.floor(rng() * tops.length)];
    const windows: Building['windows'] = [];
    for (let wy = 10; wy < h - 8; wy += 11) for (let wx = 6; wx < w - 8; wx += 9) {
      if (rng() < 0.62) windows.push({ x: wx, y: wy, on: rng() < (act === 3 ? 0.35 : 0.28), flick: rng() < 0.04 });
    }
    const b: Building = { x, w, h, top, windows };
    if (rng() < 0.22 && s < signs.length && h > 50) b.sign = signs[s++];
    out.push(b);
    x += w + (act === 3 ? 6 + rng() * 26 : rng() * 6);
  }
  let extras: ReactNode = null;
  if (act === 1) extras = (
    <g className="cq-sky-extra">
      <g transform="translate(905 182)"><rect x="0" y="0" width="34" height="22" rx="3" /><path d="M5 22v28M29 22v28M5 34h24" /></g>
    </g>
  );
  if (act === 2) extras = (
    <g className="cq-sky-extra">
      <path d="M560 300 L600 150 L640 300 Z" className="cq-pyramid" />
      <path d="M600 150 L600 112" className="cq-beam" />
      <g transform="translate(1010 150)"><circle r="62" className="cq-wheel" />{Array.from({ length: 12 }, (_, i) => <path key={i} d={`M0 0L${62 * Math.cos(i * Math.PI / 6)} ${62 * Math.sin(i * Math.PI / 6)}`} className="cq-wheel" />)}</g>
    </g>
  );
  if (act === 3) extras = (
    <g className="cq-sky-extra">
      <circle cx="930" cy="80" r="34" className="cq-moon" />
      <path d="M0 210 C 200 150, 380 190, 560 165 S 900 150, 1200 190 L1200 300 L0 300 Z" className="cq-hills" />
      <g transform="translate(250 120)"><path d="M-6 100 L-3 0 L3 0 L6 100 Z" className="cq-lighthouse" /><path d="M0 6 L-160 -20 L-160 30 Z" className="cq-beam sweep" /></g>
      {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M${890 + (i % 3) * 14 - i * 2} ${262 + i * 4}h${70 - i * 6}`} className="cq-reflect" />)}
    </g>
  );
  return { buildings: out, extras };
}

export const Skyline = memo(function Skyline({ act, className }: { act: number; className?: string }) {
  const { buildings, extras } = buildSkyline(act);
  const base = act === 3 ? 250 : 300;
  return (
    <svg className={`cq-skyline act-${act}${className ? ` ${className}` : ''}`} viewBox="0 0 1200 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id={`cq-sea-${act}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0b1e2c" /><stop offset="1" stopColor="#04080d" /></linearGradient>
      </defs>
      {act === 3 && <rect x="0" y="250" width="1200" height="50" fill={`url(#cq-sea-${act})`} />}
      {extras}
      {buildings.map((b, i) => {
        const y = base - b.h;
        return (
          <g key={i} transform={`translate(${b.x} ${y})`}>
            {b.top === 'spire' && <path d={`M${b.w / 2 - 2} 0 L${b.w / 2} -38 L${b.w / 2 + 2} 0Z`} className="cq-bld" />}
            {b.top === 'dome' && <path d={`M4 0 A ${b.w / 2 - 4} ${b.w / 3} 0 0 1 ${b.w - 4} 0Z`} className="cq-bld" />}
            {b.top === 'pyramid' && <path d={`M0 0 L${b.w / 2} ${-b.w / 2} L${b.w} 0Z`} className="cq-bld" />}
            {b.top === 'step' && <rect x={b.w * 0.2} y={-14} width={b.w * 0.6} height={14} className="cq-bld" />}
            {b.top === 'tower' && <rect x={b.w * 0.35} y={-26} width={b.w * 0.3} height={26} className="cq-bld" />}
            <rect width={b.w} height={b.h} className="cq-bld" />
            {b.windows.map((w, j) => w.on && <rect key={j} x={w.x} y={w.y} width="4" height="5" className={`cq-win${w.flick ? ' flick' : ''}`} style={w.flick ? { animationDelay: `${(j % 7) * 0.9}s` } : undefined} />)}
            {b.sign && <text x={b.w / 2} y={14} className={`cq-sign tone-${b.sign.tone}`} textAnchor="middle">{b.sign.text}</text>}
          </g>
        );
      })}
    </svg>
  );
});

// ---------------------------------------------------------------- characters

/** The pit boss steps out of the shadows as Heat rises. */
export function PitBoss({ heat }: { heat: number }) {
  const show = Math.max(0, Math.min(1, (heat - 18) / 70));
  const style = { '--show': show, '--near': 0.82 + show * 0.3 } as CSSProperties;
  return (
    <svg className={`cq-pitboss${heat >= 80 ? ' glare' : ''}`} viewBox="0 0 120 140" style={style} aria-hidden="true">
      <path d="M60 18c-13 0-22 10-22 24 0 9 4 17 10 21-17 4-34 14-40 30-4 11-4 33-4 47h112c0-14 0-36-4-47-6-16-23-26-40-30 6-4 10-12 10-21 0-14-9-24-22-24z" className="cq-pb-body" />
      <path d="M36 32c4-14 44-14 48 0l4 6H32z" className="cq-pb-hat" />
      <path d="M60 64l-7 6 7 40 7-40z" className="cq-pb-tie" />
      <path d="M43 76l17 30 17-30" className="cq-pb-lapel" />
      <circle cx="52" cy="44" r="2" className="cq-pb-eye" /><circle cx="68" cy="44" r="2" className="cq-pb-eye" />
      <rect x="78" y="96" width="14" height="9" rx="1.5" className="cq-pb-pad" />
    </svg>
  );
}

export function CameraDome({ heat }: { heat: number }) {
  const rate = heat >= 80 ? 0.35 : heat >= 50 ? 0.8 : heat >= 25 ? 1.6 : 3.2;
  return (
    <svg className={`cq-camera${heat >= 50 ? ' hot' : ''}`} viewBox="0 0 40 28" aria-hidden="true" style={{ '--blink': `${rate}s` } as CSSProperties}>
      <rect x="4" y="0" width="32" height="5" rx="1" className="cq-cam-mount" />
      <path d="M6 5h28a14 14 0 0 1-28 0z" className="cq-cam-dome" />
      <circle cx="20" cy="12" r="3.5" className="cq-cam-lens" />
      <circle cx="29" cy="9" r="1.6" className="cq-cam-led" />
    </svg>
  );
}

const ACCESSORY: Record<string, ReactNode> = {
  'Cowboy Cal': <path d="M6 15h28l-5-2-2-7c-4-2-10-2-14 0l-2 7z" className="cq-acc" />,
  'Grandma Rose': <circle cx="20" cy="6.5" r="4.5" className="cq-acc soft" />,
  'Professor Pim': <path d="M12 17.5h6M22 17.5h6M18 17.5h4" className="cq-acc line" />,
  'Whale Wu': <path d="M15 33l5 3 5-3-5-1.5zM15 33v3l5-1.5M25 33v3l-5-1.5" className="cq-acc" />,
  'Tourist Ted': <path d="M9 13c3-6 19-6 22 0l3 1H6z" className="cq-acc" />,
  'Nervous Nina': <path d="M29 12c-1.5 2.5-1.5 4 0 5 1.5-1 1.5-2.5 0-5z" className="cq-acc water" />,
  'Lucky Linda': <path d="M27 9a2.5 2.5 0 1 0 0 .01M24.5 7.5a2.5 2.5 0 1 0 0 .01M29.5 7.5a2.5 2.5 0 1 0 0 .01" className="cq-acc flower" />,
  'Big Sal': <path d="M24 23h9" className="cq-acc cigar" />,
  'Honeymoon Hank': <path d="M33 10s-3-2-3-4a1.6 1.6 0 0 1 3-.6 1.6 1.6 0 0 1 3 .6c0 2-3 4-3 4z" className="cq-acc heart" />,
  'Bachelor Brad': <path d="M10 12c2-5 18-5 20 0v1H10zM28 12h6" className="cq-acc" />,
};
export function Avatar({ name, mood }: { name: string; mood?: 'win' | 'lose' | null }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  return (
    <svg className={`cq-avatar${mood ? ` ${mood}` : ''}`} viewBox="0 0 40 44" aria-hidden="true" style={{ '--hue': hue } as CSSProperties}>
      <path d="M4 44c0-9 7-14 16-14s16 5 16 14z" className="cq-av-body" />
      <circle cx="20" cy="18" r="9" className="cq-av-head" />
      {ACCESSORY[name]}
    </svg>
  );
}

/** The raw paths of an icon, for drawing inside another SVG. */
export const iconPaths = (name: string): ReactNode => P[name] ?? P.event;
