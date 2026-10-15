// Twenty-One Stakes: every screen between hands
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  BOSSES, CHARMS, ENH_INFO, FORTUNES, HAND_ORDER, HANDS, PACKS, RANKS, STAGE_INFO, STAGES, SUITS, TAGS, VOUCHERS, VOUCHER_COST, WIN_ANTE,
  type CharmId, type PCard,
} from '../../stakes/data';
import { bossFor, handLevel, targetFor, type RunState } from '../../stakes/engine';
import {
  buy, buyPack, buyVoucher, canBuy, canSkip, charmRoom, choosePack, collect, consUsable, dailySeed, goEndless, cashIn, leaveShop, packFortune,
  playTable, reroll, rerollCost, skipPack, skipTable, tagFor, useCons, type BoardEntry, type StakesSettings,
} from '../../stakes/run';
import { stakesSound } from '../../stakes/audio';
import { CharmCard, ConsCard, PackCard, PlayingCard, VoucherCard, consInfo } from './Cards';
import { fmt, Inventory } from './Panels';

type SetRun = (fn: (r: RunState) => RunState) => void;
const money = (n: number) => `$${n}`;

// -------------------------------------------------------------------- title

export function Title({ saved, best, onStart, onContinue, onBoard, onHowTo }: {
  saved: RunState | null; best: BoardEntry | null; onStart: (seed: string | null, daily: boolean) => void; onContinue: () => void; onBoard: () => void; onHowTo: () => void;
}) {
  const [seed, setSeed] = useState('');
  const today = dailySeed();
  const fan: PCard[] = [
    { uid: 1, rank: 'A', suit: '♠' }, { uid: 2, rank: 'K', suit: '♥', enh: 'gold' }, { uid: 3, rank: '7', suit: '♦', enh: 'lucky' }, { uid: 4, rank: '10', suit: '♣', enh: 'glass' }, { uid: 5, rank: 'Q', suit: '♥', enh: 'wild' },
  ];
  return (
    <div className="sk-title">
      <div className="sk-title-fan" aria-hidden="true">
        {fan.map((c, i) => <div key={c.uid} className="sk-fan-card" style={{ '--i': i } as CSSProperties}><PlayingCard card={c} deal="none" size="lg" /></div>)}
      </div>
      <h1 className="sk-logo"><span className="a">TWENTY-ONE</span><span className="b">STAKES</span></h1>
      <p className="sk-tagline">A blackjack roguelite. Build a deck, stack charms, and turn twenty-ones into millions.</p>
      <div className="sk-menu">
        {saved && !saved.end && (
          <button type="button" className="sk-btn blue big" onClick={onContinue}>Continue <small>Ante {saved.ante} · ${saved.money} · {saved.seedLabel}</small></button>
        )}
        <button type="button" className={`sk-btn ${saved && !saved.end ? 'orange' : 'blue'} big`} onClick={() => onStart(null, false)}>New run</button>
        <button type="button" className="sk-btn green big" onClick={() => onStart(today, true)}>Daily seed <small>{today}</small></button>
        <form className="sk-seed" onSubmit={(e) => { e.preventDefault(); if (seed.trim()) onStart(seed, false); }}>
          <input value={seed} onChange={(e) => setSeed(e.target.value.toUpperCase())} placeholder="SEED" maxLength={14} aria-label="Seed" spellCheck={false} autoComplete="off" />
          <button type="submit" className="sk-btn grey" disabled={!seed.trim()}>Play seed</button>
        </form>
        <div className="sk-row">
          <button type="button" className="sk-btn purple" onClick={onHowTo}>How to play</button>
          <button type="button" className="sk-btn red" onClick={onBoard}>High scores{best ? ` · ante ${best.ante}` : ''}</button>
        </div>
      </div>
      <p className="sk-fine">Scores and runs are saved in this browser only.</p>
    </div>
  );
}

// ---------------------------------------------------------------- table select

export function Select({ run, setRun }: { run: RunState; setRun: SetRun }) {
  return (
    <div className="sk-screen sk-select">
      <Inventory run={run} setRun={setRun} onUse={(c) => setRun((r) => useCons(r, c.uid))} usable={(c) => consUsable(run, c)} />
      <div className="sk-blinds">
        {STAGES.map((stage, i) => {
          const boss = stage === 'boss' ? BOSSES[bossFor(run, run.ante)] : null;
          const state = i < run.stage ? 'past' : i === run.stage ? 'now' : 'later';
          const tag = i < 2 ? TAGS[tagFor(run, run.ante, i)] : null;
          return (
            <div key={stage} className={`sk-blind ${state} s-${stage}`} style={{ '--bc': boss?.color ?? (stage === 'high' ? '#3c7bff' : '#2fa36b') } as CSSProperties}>
              <span className="sk-blind-chip">{boss ? boss.icon : stage === 'high' ? '♦' : '♣'}</span>
              <h3>{boss ? boss.name : STAGE_INFO[stage].name}</h3>
              <p className="sk-blind-target">Score at least <b>{fmt(targetFor(run.ante, stage))}</b></p>
              <p className="sk-blind-reward">Reward {'$'.repeat(STAGE_INFO[stage].reward)}</p>
              {boss && <p className="sk-blind-boss">{boss.text}</p>}
              {state === 'now' ? (
                <div className="sk-blind-btns">
                  <button type="button" className="sk-btn orange big" onClick={() => { setRun(playTable); stakesSound.play('click'); }} autoFocus>Play</button>
                  {canSkip(run) && tag && (
                    <button type="button" className="sk-btn grey" onClick={() => { setRun(skipTable); stakesSound.play('buy'); }} title={tag.text}>Skip for {tag.icon} {tag.name}</button>
                  )}
                  {tag && canSkip(run) && <small className="sk-tagtext">{tag.text}</small>}
                </div>
              ) : <span className="sk-blind-state">{state === 'past' ? 'Done' : 'Up next'}</span>}
            </div>
          );
        })}
      </div>
      {run.tags.length > 0 && <p className="sk-dim center">Tags collected: {run.tags.map((t) => TAGS[t].icon).join(' ')}</p>}
    </div>
  );
}

// -------------------------------------------------------------------- cash out

export function Cashout({ run, setRun }: { run: RunState; setRun: SetRun }) {
  const c = run.cashout!;
  const rows = [
    { label: 'Table won', amount: c.reward, coins: c.reward },
    ...(c.hands ? [{ label: `Hands left (${c.hands} × $1)`, amount: c.hands, coins: c.hands }] : []),
    ...(c.interest ? [{ label: `Interest ($1 per $5, max $${run.vouchers.includes('savings_bond') ? 10 : 5})`, amount: c.interest, coins: c.interest }] : []),
    ...c.extra.map((e) => ({ label: e.label, amount: e.amount, coins: e.amount })),
  ];
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= rows.length) return;
    const id = window.setTimeout(() => { setShown((s) => s + 1); stakesSound.play('money'); }, 380);
    return () => window.clearTimeout(id);
  }, [shown, rows.length]);
  return (
    <div className="sk-screen sk-cash">
      <div className="sk-panel cash">
        <h2>Cash out</h2>
        <ul>
          {rows.slice(0, shown).map((r, i) => <li key={i}><span>{r.label}</span><b>{'$'.repeat(Math.min(10, r.coins))}<em>{money(r.amount)}</em></b></li>)}
        </ul>
        {c.notes.map((n) => <p key={n} className="sk-note">{n}</p>)}
        <button type="button" className="sk-btn orange big" onClick={() => { setRun(collect); stakesSound.play('buy'); }} autoFocus>Cash out {money(c.total)}</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------ shop

export function Shop({ run, setRun }: { run: RunState; setRun: SetRun }) {
  const s = run.shop!;
  const vCost = run.vouchers.includes('comp_points') ? Math.floor(VOUCHER_COST * 0.75) : VOUCHER_COST;
  const buyIt = (fn: (r: RunState) => RunState) => { setRun(fn); stakesSound.play('buy'); };
  return (
    <div className="sk-screen sk-shop">
      <Inventory run={run} setRun={setRun} onUse={(c) => setRun((r) => useCons(r, c.uid))} usable={(c) => consUsable(run, c)} />
      <div className="sk-panel shop">
        <div className="sk-shop-side">
          <button type="button" className="sk-btn red big" onClick={() => { setRun(leaveShop); stakesSound.play('click'); }}>Next table</button>
          <button type="button" className="sk-btn green big" onClick={() => buyIt(reroll)} disabled={run.money < rerollCost(run)}>Reroll <small>${rerollCost(run)}</small></button>
        </div>
        <div className="sk-shop-items">
          {s.items.map((it, i) => (
            <div key={`${s.rerolls}-${it.slot}`} className={`sk-shop-slot${it.sold ? ' sold' : ''}`}>
              {it.sold ? <span className="sk-sold">Sold</span> : it.kind === 'charm'
                ? <CharmCard id={it.id as CharmId} price={it.price} i={i} onClick={() => canBuy(run, it) && buyIt((r) => buy(r, it.slot))} />
                : <ConsCard item={{ kind: it.kind, id: it.id }} price={it.price} i={i} onClick={() => canBuy(run, it) && buyIt((r) => buy(r, it.slot))} />}
              {!it.sold && <button type="button" className="sk-btn small blue" onClick={() => buyIt((r) => buy(r, it.slot))} disabled={!canBuy(run, it)} title={!canBuy(run, it) ? (run.money < it.price ? 'Not enough money' : 'No free slot') : undefined}>{it.price === 0 ? 'Free' : 'Buy'}</button>}
            </div>
          ))}
        </div>
      </div>
      <div className="sk-shop-bottom">
        <div className="sk-panel sk-sub">
          <h4>Voucher</h4>
          {s.voucher ? (
            <div className="sk-shop-slot">
              <VoucherCard id={s.voucher} price={vCost} sold={s.voucherSold} onClick={() => buyIt(buyVoucher)} />
              {!s.voucherSold && <button type="button" className="sk-btn small blue" onClick={() => buyIt(buyVoucher)} disabled={run.money < vCost}>Redeem</button>}
            </div>
          ) : <p className="sk-dim">Back next ante.</p>}
        </div>
        <div className="sk-panel sk-sub">
          <h4>Booster packs</h4>
          <div className="sk-row">
            {s.packs.map((p, i) => (
              <div key={i} className="sk-shop-slot">
                <PackCard kind={p.kind} price={p.price} sold={p.sold} onClick={() => !p.sold && run.money >= p.price && buyIt((r) => buyPack(r, i))} />
                {!p.sold && <button type="button" className="sk-btn small blue" onClick={() => buyIt((r) => buyPack(r, i))} disabled={run.money < p.price || (p.kind === 'charm' && !charmRoom(run))}>Open</button>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------ packs

export function Pack({ run, setRun }: { run: RunState; setRun: SetRun }) {
  const p = run.pack!;
  const [sel, setSel] = useState<number[]>([]);
  const pending = p.pending ? FORTUNES[p.pending as keyof typeof FORTUNES] : null;
  const toggle = (u: number) => {
    if (!pending) return;
    setSel((s) => (s.includes(u) ? s.filter((x) => x !== u) : s.length < pending.pick ? [...s, u] : s));
    stakesSound.play('select');
  };
  const info = PACKS[p.kind];
  return (
    <div className="sk-screen sk-packscreen">
      <Inventory run={run} setRun={setRun} onUse={(c) => setRun((r) => useCons(r, c.uid))} usable={(c) => consUsable(run, c)} />
      <div className="sk-panel pack">
        <h2>{info.icon} {info.name}</h2>
        <p className="sk-dim">{pending ? `${pending.name}: ${pending.text} Choose ${pending.need === pending.pick ? pending.pick : `up to ${pending.pick}`} of the cards below.` : info.text}</p>
        {!pending && (
          <div className="sk-pack-options">
            {p.kind === 'standard'
              ? p.cards.map((c, i) => <div key={c.uid} className="sk-pack-pick"><PlayingCard card={c} i={i} size="lg" deal="none" onClick={() => setRun((r) => choosePack(r, i))} />{c.enh && <small>{ENH_INFO[c.enh].text}</small>}</div>)
              : p.options.map((id, i) => (
                <div key={id + i} className="sk-pack-pick">
                  {p.kind === 'charm'
                    ? <CharmCard id={id as CharmId} i={i} onClick={() => { if (charmRoom(run)) { setRun((r) => choosePack(r, i)); stakesSound.play('buy'); } }} />
                    : <ConsCard item={{ kind: p.kind === 'cocktail' ? 'cocktail' : 'fortune', id }} i={i} onClick={() => { setRun((r) => choosePack(r, i)); stakesSound.play('buy'); }} />}
                  <small>{p.kind === 'charm' ? CHARMS[id as CharmId].text : consInfo({ kind: p.kind === 'cocktail' ? 'cocktail' : 'fortune', id }).text}</small>
                </div>
              ))}
          </div>
        )}
        {p.kind === 'fortune' && (
          <div className={`sk-pack-hand${pending ? ' live' : ''}`}>
            {p.cards.map((c, i) => <PlayingCard key={c.uid} card={c} i={i} deal="none" selected={sel.includes(c.uid)} onClick={pending ? () => toggle(c.uid) : undefined} />)}
          </div>
        )}
        <div className="sk-row center">
          {pending && <button type="button" className="sk-btn green" disabled={sel.length < pending.need} onClick={() => { setRun((r) => packFortune(r, sel)); stakesSound.play('buy'); }}>Use {pending.name}</button>}
          <button type="button" className="sk-btn grey" onClick={() => setRun(skipPack)}>Skip</button>
          {p.kind === 'charm' && !charmRoom(run) && <span className="sk-why">Your charm slots are full. Sell one first.</span>}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- end states

export function Won({ run, setRun }: { run: RunState; setRun: SetRun }) {
  return (
    <div className="sk-screen sk-won">
      <div className="sk-panel cash big">
        <h2 className="sk-wintitle">YOU BEAT THE HOUSE</h2>
        <p>Ante {WIN_ANTE} cleared. Best hand: <b>{fmt(run.stats.bestHand)}</b> chips.</p>
        <p className="sk-dim">Keep going in endless mode, where the targets keep climbing, or cash in your run now.</p>
        <div className="sk-row center">
          <button type="button" className="sk-btn orange big" onClick={() => setRun(goEndless)}>Endless mode</button>
          <button type="button" className="sk-btn blue big" onClick={() => setRun(cashIn)}>Cash in</button>
        </div>
      </div>
    </div>
  );
}

export function End({ run, rank, onNew, onReplay, onBoard, onTitle }: { run: RunState; rank: number; onNew: () => void; onReplay: () => void; onBoard: () => void; onTitle: () => void }) {
  const e = run.end!;
  const [copied, setCopied] = useState(false);
  const share = `Twenty-One Stakes · seed ${run.seedLabel}\n${e.won ? `🏆 Beat ante ${WIN_ANTE}${run.endless ? `, reached ante ${run.ante} in endless` : ''}` : `Reached ante ${run.ante}`} · best hand ${fmt(run.stats.bestHand)}\n${run.charms.map((c) => CHARMS[c.id].icon).join('')}`;
  return (
    <div className="sk-screen sk-end">
      <div className={`sk-panel cash big ${e.won ? 'won' : 'lost'}`}>
        <h2 className={e.won ? 'sk-wintitle' : 'sk-losetitle'}>{e.won ? 'YOU WIN' : 'GAME OVER'}</h2>
        <p>{e.reason}</p>
        {rank > 0 && <p className="sk-rank">#{rank} on your high scores</p>}
        <dl className="sk-endstats">
          <div><dt>Ante</dt><dd>{run.ante}</dd></div>
          <div><dt>Best hand</dt><dd>{fmt(run.stats.bestHand)}{run.stats.bestType ? <small> {HANDS[run.stats.bestType].name}</small> : null}</dd></div>
          <div><dt>Total chips</dt><dd>{fmt(run.stats.total)}</dd></div>
          <div><dt>Hands won</dt><dd>{run.stats.wins} of {run.stats.hands}</dd></div>
          <div><dt>Blackjacks</dt><dd>{run.stats.blackjacks}</dd></div>
          <div><dt>Tables</dt><dd>{run.stats.tablesWon}</dd></div>
        </dl>
        <div className="sk-endcharms">{run.charms.map((c) => <CharmCard key={c.uid} c={c} />)}</div>
        <pre className="sk-share">{share}</pre>
        <div className="sk-row center">
          <button type="button" className="sk-btn grey" onClick={async () => { try { await navigator.clipboard.writeText(share); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* blocked */ } }}>{copied ? 'Copied' : 'Copy result'}</button>
          <button type="button" className="sk-btn blue big" onClick={onNew}>New run</button>
          <button type="button" className="sk-btn green" onClick={onReplay}>Same seed</button>
          <button type="button" className="sk-btn red" onClick={onBoard}>High scores</button>
          <button type="button" className="sk-btn grey" onClick={onTitle}>Title</button>
        </div>
      </div>
    </div>
  );
}

export function Board({ board, onBack, onPlay, onClear }: { board: BoardEntry[]; onBack: () => void; onPlay: (s: string) => void; onClear: () => void }) {
  return (
    <div className="sk-screen">
      <div className="sk-panel wide">
        <h2>High scores</h2>
        {board.length ? (
          <div className="sk-tablewrap">
            <table className="sk-table">
              <thead><tr><th>#</th><th>Ante</th><th>Best hand</th><th>Total</th><th>Charms</th><th>Seed</th><th>Date</th><th aria-label="Play" /></tr></thead>
              <tbody>
                {board.map((b, i) => (
                  <tr key={i} className={b.won ? 'won' : ''}>
                    <td>{i + 1}</td><td>{b.won ? '🏆 ' : ''}{b.ante}{b.endless ? ' ∞' : ''}</td><td className="num">{fmt(b.best)}</td><td className="num">{fmt(b.total)}</td>
                    <td className="emo">{b.charms.map((c) => CHARMS[c as CharmId]?.icon ?? '').join('')}</td><td className="mono">{b.seed}{b.daily ? ' ☀' : ''}</td><td>{b.date}</td>
                    <td><button type="button" className="sk-btn small blue" onClick={() => onPlay(b.seed)}>Play</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="sk-dim">No runs yet.</p>}
        <div className="sk-row center">
          <button type="button" className="sk-btn orange" onClick={onBack}>Back</button>
          {board.length > 0 && <button type="button" className="sk-btn grey" onClick={() => { if (confirm('Delete every saved score from this browser?')) onClear(); }}>Clear</button>}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ overlays

export function RunInfo({ run, onClose }: { run: RunState; onClose: () => void }) {
  const [tab, setTab] = useState<'hands' | 'deck' | 'vouchers'>('hands');
  const t = run.table;
  const left = useMemo(() => new Set((t?.deck ?? run.deck).map((c) => c.uid)), [t, run.deck]);
  return (
    <div className="sk-modal" role="dialog" aria-modal="true" aria-label="Run info" onClick={onClose}>
      <div className="sk-panel sk-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="sk-tabs">
          {(['hands', 'deck', 'vouchers'] as const).map((k) => <button key={k} type="button" className={`sk-btn small ${tab === k ? 'red' : 'grey'}`} onClick={() => setTab(k)}>{k === 'hands' ? 'Hand levels' : k === 'deck' ? `Deck (${run.deck.length})` : 'Vouchers & tags'}</button>)}
          <button type="button" className="sk-btn small orange" onClick={onClose}>Close</button>
        </div>
        {tab === 'hands' && (
          <table className="sk-table levels">
            <thead><tr><th>Hand</th><th>Level</th><th>Chips × Mult</th><th>Played</th></tr></thead>
            <tbody>
              {[...HAND_ORDER].reverse().map((h) => {
                const lv = handLevel(run, h), d = HANDS[h];
                return (
                  <tr key={h}>
                    <td><b>{d.name}</b><small>{d.text}</small></td>
                    <td className="num">lvl.{lv}</td>
                    <td><span className="sk-chips sm">{d.chips + d.lvChips * (lv - 1)}</span> × <span className="sk-mult sm">{d.mult + d.lvMult * (lv - 1)}</span></td>
                    <td className="num">{run.played[h] ?? 0}</td>
                  </tr>
                );
              })}
              <tr><td><b>Loss</b><small>Lost hands still score, at half.</small></td><td>–</td><td><span className="sk-chips sm">0</span> × <span className="sk-mult sm">1</span> ×½</td><td>–</td></tr>
            </tbody>
          </table>
        )}
        {tab === 'deck' && (
          <div className="sk-deckview">
            <p className="sk-dim">{t ? `${t.deck.length} cards left in your draw pile. Greyed cards are already out.` : 'Your whole deck.'}</p>
            {SUITS.map((s) => (
              <div key={s} className="sk-deckrow">
                {run.deck.filter((c) => c.suit === s).sort((a, b) => RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank)).map((c, i) => (
                  <PlayingCard key={c.uid} card={c} i={i} size="sm" deal="none" dim={!!t && !left.has(c.uid)} />
                ))}
              </div>
            ))}
          </div>
        )}
        {tab === 'vouchers' && (
          <div className="sk-vlist">
            {run.vouchers.length ? run.vouchers.map((v) => <p key={v}>🎟️ <b>{VOUCHERS[v].name}</b>: {VOUCHERS[v].text}</p>) : <p className="sk-dim">No vouchers yet. One shows up in the shop each ante.</p>}
            {run.tags.length > 0 && <p>Tags used: {run.tags.map((g) => `${TAGS[g].icon} ${TAGS[g].name}`).join(', ')}</p>}
            <p className="sk-dim">Seed {run.seedLabel}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function Options({ settings, setSettings, onClose, onQuit, inRun }: {
  settings: StakesSettings; setSettings: (p: Partial<StakesSettings>) => void; onClose: () => void; onQuit: () => void; inRun: boolean;
}) {
  return (
    <div className="sk-modal" role="dialog" aria-modal="true" aria-label="Options" onClick={onClose}>
      <div className="sk-panel sk-dialog narrow" onClick={(e) => e.stopPropagation()}>
        <h2>Options</h2>
        <label className="sk-opt"><span>Sound effects</span><input type="checkbox" checked={settings.sound} onChange={(e) => setSettings({ sound: e.target.checked })} /></label>
        <label className="sk-opt"><span>Music</span><input type="checkbox" checked={settings.music} onChange={(e) => setSettings({ music: e.target.checked })} /></label>
        <div className="sk-opt"><span>Game speed</span>
          <div className="sk-row">{([1, 2, 3] as const).map((s) => <button key={s} type="button" className={`sk-btn small ${settings.speed === s ? 'blue' : 'grey'}`} onClick={() => setSettings({ speed: s })}>{s}×</button>)}</div>
        </div>
        <div className="sk-row center">
          <button type="button" className="sk-btn orange" onClick={onClose}>Back</button>
          {inRun && <button type="button" className="sk-btn red" onClick={onQuit}>Main menu</button>}
        </div>
        <p className="sk-dim center">Your run saves after every move.</p>
      </div>
    </div>
  );
}

export function HowTo({ onClose }: { onClose: () => void }) {
  return (
    <div className="sk-modal" role="dialog" aria-modal="true" aria-label="How to play" onClick={onClose}>
      <div className="sk-panel sk-dialog howto" onClick={(e) => e.stopPropagation()}>
        <h2>How to play</h2>
        <div className="sk-howto">
          <section><h3>The run</h3><p>Eight antes, three tables each: the Pit, the High Roller, and a Boss with a twist. Score enough chips at a table to clear it. Clear ante {WIN_ANTE} to win.</p></section>
          <section><h3>A table</h3><p>You get <b>5 hands</b> and <b>3 redraws</b>. Play blackjack against the dealer. Click a card and press <b>Redraw</b> to swap it for the top card of your deck.</p></section>
          <section><h3>Scoring</h3><p>Every hand scores <span className="sk-chips sm">chips</span> × <span className="sk-mult sm">mult</span>. Wins score in full, losses at half, busts score nothing, and a push gives you the hand back. Doubling ×2s a win, but a lost double scores zero.</p></section>
          <section><h3>Hand types</h3><p>{[...HAND_ORDER].reverse().map((h) => `${HANDS[h].name} ${HANDS[h].chips}×${HANDS[h].mult}`).join(' · ')}. Each card adds its own chips too (faces 10, aces 11).</p></section>
          <section><h3>The shop</h3><p><b>Charms</b> change the rules and score left to right, so put +mult before ×mult. <b>Cocktails</b> level up a hand type. <b>Fortunes</b> rewrite your cards. <b>Vouchers</b> are permanent upgrades.</p></section>
          <section><h3>Money</h3><p>Clearing a table pays $3 to $5, plus $1 for every hand you didn't need, plus $1 interest for every $5 you're holding (up to $5).</p></section>
          <section><h3>Your deck</h3><p>You play your own 52 cards; the dealer uses a fresh house deck. Shape yours: destroy low cards, forge Aces, add Gold, Glass, Lucky, Wild and Stone cards.</p></section>
          <section><h3>Skipping</h3><p>You can skip the Pit or the High Roller for a free Tag, at the cost of that table's reward and shop.</p></section>
          <section><h3>Keys</h3><p><kbd>H</kbd> hit · <kbd>S</kbd> stand · <kbd>D</kbd> double · <kbd>R</kbd> redraw · <kbd>P</kbd> split · <kbd>F</kbd> surrender · <kbd>Space</kbd> skip scoring · <kbd>Enter</kbd> continue</p></section>
        </div>
        <button type="button" className="sk-btn orange big" onClick={onClose}>Let's play</button>
      </div>
    </div>
  );
}

