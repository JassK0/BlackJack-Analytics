// Count & Conquer: everything between the tables
import { useEffect, useState, type CSSProperties } from 'react';
import type { Rank } from '../../engine/types';
import { money } from '../../lib/format';
import { CITIES, RELICS, type RelicId } from '../../conquer/data';
import { EVENTS } from '../../conquer/events';
import {
  answerDrill, buy, canBuy, canRetry, chooseEvent, leaveEvent, leaveMotel, leaveShop, motel, MOTEL, nextAct, retryBoss, retryCost,
  SHOP_TEXT, takeReward, type BoardEntry, type MotelChoice, type RunState, type ShopItem,
} from '../../conquer/run';
import { sound } from '../../conquer/audio';
import { Icon, Neon, Skyline } from './art';

type SetRun = (fn: (r: RunState) => RunState) => void;
const ROMAN = ['', 'I', 'II', 'III'];
const RED = new Set(['♥', '♦']);
const SUITS = ['♠', '♥', '♦', '♣'];

export function RelicCard({ id, price, onClick, disabled, owned, style, footer }: {
  id: RelicId; price?: number; onClick?: () => void; disabled?: boolean; owned?: boolean; style?: CSSProperties; footer?: string;
}) {
  const r = RELICS[id];
  const body = (
    <>
      <span className="cq-relic-gem"><Icon name={id} size={34} /></span>
      <span className="cq-relic-rarity">{r.rarity}</span>
      <strong className="cq-relic-name">{r.name}</strong>
      <span className="cq-relic-text">{r.text}</span>
      <em className="cq-relic-flavor">{r.flavor}</em>
      {(price != null || footer) && <span className="cq-relic-price">{owned ? 'Owned' : footer ?? money(price!)}</span>}
    </>
  );
  return onClick
    ? <button type="button" className={`cq-relic-card r-${r.rarity}`} onClick={onClick} disabled={disabled} style={style}>{body}</button>
    : <div className={`cq-relic-card r-${r.rarity}`} style={style}>{body}</div>;
}

// --------------------------------------------------------------- reward

export function RewardScreen({ run, setRun }: { run: RunState; setRun: SetRun }) {
  const rw = run.reward!;
  const [paid, setPaid] = useState(0);
  useEffect(() => {
    sound.play('coin');
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / 900);
      setPaid(Math.round(rw.cash * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rw.cash]);
  const take = (id: RelicId | null) => { sound.play(id ? 'cleared' : 'coin'); setRun((r) => takeReward(r, id)); };
  return (
    <div className="cq-screen cq-reward">
      <Neon text={rw.tier === 'boss' ? 'BOSS BEATEN' : 'JOB DONE'} tone="gold" as="h1" />
      <p className="cq-lede">{rw.title} is cleaned out. Your crew's cut: <strong className="cq-money">+{money(paid)}</strong></p>
      {rw.relics.length > 0 ? (
        <>
          <h2 className="cq-pick">Choose one piece of gear</h2>
          <div className="cq-relic-row">
            {rw.relics.map((id, i) => <RelicCard key={id} id={id} onClick={() => take(id)} style={{ '--i': i } as CSSProperties} />)}
          </div>
          <button type="button" className="cq-btn ghost" onClick={() => take(null)}>Skip the gear and take {money(rw.skipCash)} more</button>
        </>
      ) : <button type="button" className="cq-btn primary big" onClick={() => take(null)}>Collect and finish the run</button>}
    </div>
  );
}

// ----------------------------------------------------------------- shop

function ShopRow({ item, run, onBuy }: { item: ShopItem; run: RunState; onBuy: () => void }) {
  if (item.kind === 'relic') {
    return <RelicCard id={item.relic!} price={item.price} footer={item.sold ? 'Sold' : undefined} disabled={!canBuy(run, item)} onClick={onBuy} />;
  }
  const t = SHOP_TEXT[item.kind];
  const icon = item.kind === 'fake_id' ? 'id' : item.kind === 'tapes' ? 'tape' : 'espresso';
  return (
    <button type="button" className="cq-relic-card r-service" onClick={onBuy} disabled={!canBuy(run, item)}>
      <span className="cq-relic-gem"><Icon name={icon} size={34} /></span>
      <span className="cq-relic-rarity">service</span>
      <strong className="cq-relic-name">{t.name}</strong>
      <span className="cq-relic-text">{t.text}</span>
      <span className="cq-relic-price">{item.sold ? 'Sold' : money(item.price)}</span>
    </button>
  );
}

export function ShopScreen({ run, setRun }: { run: RunState; setRun: SetRun }) {
  return (
    <div className="cq-screen cq-shop">
      <div className="cq-shop-sign"><Neon text="OPEN" tone="red" dying={1} /><Neon text="PAWN & GEAR" tone="cyan" as="h1" /></div>
      <p className="cq-lede">A man in a trench coat opens one side of it. "Everything's legal. Mostly." You have <strong className="cq-money">{money(run.bankroll)}</strong>.</p>
      <div className="cq-relic-row wrap">
        {run.shop!.map((item) => <ShopRow key={item.id} item={item} run={run} onBuy={() => { sound.play('coin'); setRun((r) => buy(r, item.id)); }} />)}
      </div>
      <button type="button" className="cq-btn primary" onClick={() => setRun(leaveShop)}>Back to the street</button>
    </div>
  );
}

// ---------------------------------------------------------------- event

function DrillCards({ cards, onDone }: { cards: Rank[]; onDone: () => void }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= cards.length) { onDone(); return; }
    const id = window.setTimeout(() => { sound.play('card'); setN((x) => x + 1); }, n === 0 ? 600 : 820);
    return () => window.clearTimeout(id);
  }, [n, cards.length]);
  return (
    <div className="cq-drill" aria-live="polite">
      {cards.slice(0, n).map((c, i) => {
        const suit = SUITS[(i * 7 + c.charCodeAt(0)) % 4];
        return (
          <div key={i} className={`cq-card drill${RED.has(suit) ? ' red' : ''}`} style={{ '--i': i } as CSSProperties} aria-label={`${c}${suit}`}>
            <div className="cq-card-inner"><div className="cq-card-face front"><span className="corner tl">{c}<i>{suit}</i></span><span className="pip">{['J', 'Q', 'K'].includes(c) ? c : suit}</span></div></div>
          </div>
        );
      })}
    </div>
  );
}

export function EventScreen({ run, setRun }: { run: RunState; setRun: SetRun }) {
  const ev = run.event!;
  const def = EVENTS[ev.id];
  const [dealt, setDealt] = useState(false);
  const opts = def.options(run);
  const sign = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
  return (
    <div className={`cq-screen cq-event e-${ev.id}`}>
      <div className="cq-event-art"><Icon name={def.icon} size={72} /></div>
      <Neon text={def.title.toUpperCase()} tone="cyan" as="h1" />
      <p className="cq-lede">{def.text}</p>
      {ev.outcome ? (
        <>
          <p className="cq-outcome">{ev.outcome}</p>
          <button type="button" className="cq-btn primary" onClick={() => setRun(leaveEvent)} autoFocus>Continue</button>
        </>
      ) : ev.drill ? (
        <>
          <DrillCards cards={ev.drill.cards} onDone={() => setDealt(true)} />
          {dealt ? (
            <div className="cq-options">
              <p className="cq-q">"So, what's the count?"</p>
              {ev.drill.options.map((v) => <button key={v} type="button" className="cq-btn big" onClick={() => { sound.play(v === ev.drill!.answer ? 'win' : 'lose'); setRun((r) => answerDrill(r, v)); }}>{sign(v)}</button>)}
            </div>
          ) : <p className="cq-dim">Count them as they land: 2–6 are +1, 7–9 are 0, tens and aces are −1.</p>}
        </>
      ) : (
        <div className="cq-choices">
          {opts.map((o, i) => (
            <button key={i} type="button" className="cq-choice" disabled={o.disabled} onClick={() => { sound.play('click'); setRun((r) => chooseEvent(r, i)); }}>
              <strong>{o.label}</strong><span>{o.detail}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- motel

export function MotelScreen({ run, setRun }: { run: RunState; setRun: SetRun }) {
  const [picked, setPicked] = useState<MotelChoice | null>(null);
  return (
    <div className="cq-screen cq-motel">
      <div className="cq-motel-sign"><Neon text="MOTEL" tone="red" as="h1" /><span className="cq-vacancy"><span className="off">NO</span> <Neon text="VACANCY" tone="green" dying={4} /></span></div>
      <p className="cq-lede">Room 6. The ice machine hums. Tomorrow night is the big job: {CITIES[run.act - 1].name}'s boss casino.</p>
      {!run.motelDone ? (
        <div className="cq-choices">
          {(Object.keys(MOTEL) as MotelChoice[]).map((k) => (
            <button key={k} type="button" className="cq-choice" onClick={() => { setPicked(k); sound.play('click'); setRun((r) => motel(r, k)); }}>
              <strong>{MOTEL[k].name}</strong><span>{MOTEL[k].text(run)}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <p className="cq-outcome">{picked === 'sleep' ? 'You sleep like the dead. The town forgets you a little.' : picked === 'drill' ? 'By dawn you can count down a deck in eleven seconds.' : picked === 'nightshift' ? 'You deal until 5 a.m. and pocket the tips.' : 'You check out.'}</p>
          <button type="button" className="cq-btn primary" onClick={() => setRun(leaveMotel)} autoFocus>Check out</button>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------- act intro

export function ActScreen({ run, setRun }: { run: RunState; setRun: SetRun }) {
  const next = CITIES[run.act];
  return (
    <div className={`cq-screen cq-actintro act-${run.act + 1}`}>
      <Skyline act={run.act + 1} className="cq-act-sky" />
      <span className="cq-act">Act {ROMAN[run.act + 1]}</span>
      <Neon text={next.name.toUpperCase()} tone={run.act === 1 ? 'pink' : 'cyan'} as="h1" />
      <p className="cq-lede">{next.tagline}</p>
      <ul className="cq-act-facts">
        <li>{next.decks.map((d) => (d === 1 ? 'single deck' : `${d}-deck`)).filter((v, i, a) => a.indexOf(v) === i).join(' and ')} games</li>
        <li>{money(next.minBet)} to {money(next.maxBet)} tables</li>
        <li>Security is {run.act === 1 ? 'sharper' : 'the best in the business'}: Heat builds faster</li>
      </ul>
      {run.partnerBonus > 0 && <p className="cq-outcome">Your bankroll partner wires {money(run.partnerBonus)}.</p>}
      <button type="button" className="cq-btn primary big" onClick={() => setRun(nextAct)} autoFocus>Hit the town</button>
    </div>
  );
}

// ---------------------------------------------------------------- retry

export function RetryScreen({ run, setRun }: { run: RunState; setRun: SetRun }) {
  const ok = canRetry(run);
  return (
    <div className="cq-screen cq-retry">
      <Neon text="THE JOB FELL THROUGH" tone="red" as="h1" />
      <p className="cq-lede">The boss casino is still standing. You can come back tomorrow night with a new disguise, but your crew wants their stake.</p>
      <div className="cq-choices">
        <button type="button" className="cq-choice" disabled={!ok} onClick={() => setRun((r) => retryBoss(r, true))}>
          <strong>Come back tomorrow night</strong>
          <span>{ok ? `Costs ${money(retryCost(run))} (half your bankroll) and one notoriety star. Fresh shoes, same job.` : 'Not possible: one more star would get you blacklisted, or you can\'t cover the stake.'}</span>
        </button>
        <button type="button" className="cq-choice" onClick={() => setRun((r) => retryBoss(r, false))}>
          <strong>Walk away</strong><span>End the run here and bank your score.</span>
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ end

export function EndScreen({ run, rank, board, onNew, onReplay, onBoard, onTitle }: {
  run: RunState; rank: number; board: BoardEntry[]; onNew: () => void; onReplay: () => void; onBoard: () => void; onTitle: () => void;
}) {
  const end = run.end!;
  const [shown, setShown] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / 1400);
      setShown(Math.round(end.score * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [end.score]);
  const s = run.stats;
  const best = board[0]?.score ?? 0;
  const share = [
    `Count & Conquer · seed ${run.seedLabel}${run.assisted ? ' (assisted)' : ''}`,
    `${end.won ? '🏆 Beat all three cities' : `Reached ${CITIES[run.act - 1].name}`} · ${end.score.toLocaleString('en-US')} points`,
    run.history.map((v) => (v.cleared ? (v.type === 'boss' ? '👑' : '🟩') : v.reason === 'backed_off' ? '🚨' : '⬛')).join(''),
    `${s.cleared}/${s.tables} jobs · ${s.checksTotal ? Math.round((100 * s.checksRight) / s.checksTotal) : 100}% count checks`,
  ].join('\n');
  return (
    <div className={`cq-screen cq-end ${end.won ? 'won' : 'lost'}`}>
      <Neon text={end.won ? 'YOU BEAT THE HOUSE' : 'GAME OVER'} tone={end.won ? 'gold' : 'red'} as="h1" />
      <p className="cq-lede">{end.reason}</p>
      <div className="cq-score"><span className="cq-label">Score</span><strong>{shown.toLocaleString('en-US')}</strong>
        <small>{rank === 1 && board.length > 1 ? 'New personal best!' : rank ? `#${rank} on your leaderboard` : `Best: ${best.toLocaleString('en-US')}`}{run.assisted ? ' · assisted, half score' : ''}</small>
      </div>
      <dl className="cq-over-stats wide">
        <div><dt>Final bankroll</dt><dd>{money(run.bankroll)}</dd></div>
        <div><dt>Jobs done</dt><dd>{s.cleared} of {s.tables}</dd></div>
        <div><dt>Bosses</dt><dd>{s.bosses} of 3</dd></div>
        <div><dt>Hands</dt><dd>{s.hands}</dd></div>
        <div><dt>Hot money</dt><dd>{money(s.hot)}</dd></div>
        <div><dt>Count checks</dt><dd>{s.checksTotal ? `${s.checksRight} of ${s.checksTotal}` : 'None'}</dd></div>
        <div><dt>Backed off</dt><dd>{s.backedOff}×</dd></div>
        <div><dt>Gear</dt><dd>{run.relics.length}</dd></div>
      </dl>
      <ol className="cq-trail" aria-label="Your route">
        {run.history.map((v, i) => (
          <li key={i} className={v.cleared ? 'ok' : v.reason === 'backed_off' ? 'caught' : 'miss'} title={`${v.name}: ${v.cleared ? 'job done' : v.reason === 'backed_off' ? 'backed off' : 'job missed'}`}>
            <Icon name={v.type === 'boss' ? 'boss' : v.type} size={14} /><span>{v.name}</span>
          </li>
        ))}
      </ol>
      <pre className="cq-share">{share}</pre>
      <div className="cq-row center">
        <button type="button" className="cq-btn ghost" onClick={async () => { try { await navigator.clipboard.writeText(share); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ } }}>
          <Icon name="copy" size={14} /> {copied ? 'Copied' : 'Copy result'}
        </button>
        <button type="button" className="cq-btn primary" onClick={onNew}>New run</button>
        <button type="button" className="cq-btn ghost" onClick={onReplay}>Replay this seed</button>
        <button type="button" className="cq-btn ghost" onClick={onBoard}>Leaderboard</button>
        <button type="button" className="cq-btn ghost" onClick={onTitle}>Title screen</button>
      </div>
    </div>
  );
}
