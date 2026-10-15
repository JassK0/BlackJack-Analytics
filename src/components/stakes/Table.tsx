// Twenty-One Stakes: the table, where hands are played and scored
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { BOSSES, FORTUNES, HANDS, STAGE_INFO, type Consumable, type HandType, type PCard } from '../../stakes/data';
import {
  act, activeHand, bookMove, canDouble, canRedraw, canSplit, canSurrender, deal, handLevel, hasCharm, insure, isNatural, redraw, totalOf,
  type HandResult, type Round, type RunState, type Step,
} from '../../stakes/engine';
import { consUsable, leaveTable, useCons } from '../../stakes/run';
import { stakesSound } from '../../stakes/audio';
import { PlayingCard, popKind, type Pop } from './Cards';
import { Inventory, Sidebar, type Live } from './Panels';

type SetRun = (fn: (r: RunState) => RunState) => void;
type Frame =
  | { kind: 'flip' } | { kind: 'dealer'; n: number }
  | { kind: 'label'; hand: number } | { kind: 'base'; hand: number }
  | { kind: 'step'; hand: number; s: Step; n: number } | { kind: 'total'; hand: number };
const DUR: Record<Frame['kind'], number> = { flip: 320, dealer: 430, label: 560, base: 380, step: 330, total: 700 };
const SPEED = [0, 1, 0.6, 0.35];

function framesFor(r: Round, startDealer: number): Frame[] {
  const f: Frame[] = [{ kind: 'flip' }];
  for (let n = startDealer + 1; n <= r.dealer.length; n++) f.push({ kind: 'dealer', n });
  (r.results ?? []).forEach((res, hand) => {
    f.push({ kind: 'label', hand });
    if (res.score) {
      f.push({ kind: 'base', hand });
      res.score.steps.forEach((s, n) => f.push({ kind: 'step', hand, s, n }));
      f.push({ kind: 'total', hand });
    }
  });
  return f;
}

/** What the screen shows partway through the scoring sequence. */
function replay(r: Round, frames: Frame[], fi: number, startDealer: number) {
  let dealerShown = startDealer, holeUp = false, hand = -1, chips = 0, mult = 0, gained = 0, labelled = -1;
  let pop: (Pop & { at: Step['at'] }) | null = null;
  let type: HandType | null = null;
  for (let k = 0; k < Math.min(fi, frames.length); k++) {
    const fr = frames[k];
    if (fr.kind === 'flip') holeUp = true;
    if (fr.kind === 'dealer') dealerShown = fr.n;
    if (fr.kind === 'label') { hand = fr.hand; labelled = fr.hand; chips = 0; mult = 0; type = r.results![fr.hand].type; pop = null; }
    if (fr.kind === 'base') { const s = r.results![fr.hand].score!; chips = s.baseChips; mult = s.baseMult; }
    if (fr.kind === 'step') {
      const s = fr.s;
      if (s.chips) chips += s.chips;
      if (s.mult) mult += s.mult;
      if (s.xmult) mult = Math.round(mult * s.xmult * 100) / 100;
      pop = { text: s.text, kind: popKind(s), key: k, at: s.at };
    }
    if (fr.kind === 'total') { gained += r.results![fr.hand].score!.total; pop = null; }
  }
  return { dealerShown, holeUp, hand, chips, mult, gained, pop, type, labelled, done: fi >= frames.length };
}

const OUTCOME_LABEL = (res: HandResult) =>
  res.outcome === 'bust' ? 'Bust!' : res.outcome === 'push' ? 'Push' : res.outcome === 'refund' ? 'Refunded' : res.outcome === 'loss' ? (res.score ? 'Lost ×½' : 'Lost') : HANDS[res.type ?? 'win'].name + '!';

/** If you stand and win right now, this is the hand type you'd score. */
function prospect(run: RunState): HandType | null {
  const r = run.table?.round, h = activeHand(run);
  if (!r || !h) return null;
  const { total } = totalOf(h.cards);
  if (h.cards.length >= (hasCharm(run, 'five_dime') ? 4 : 5) && total <= 21) return 'charlie';
  if (isNatural(h)) return run.table!.boss === 'cooler' ? 'win' : 'blackjack';
  return total === 21 ? 'twentyone' : total === 20 ? 'twenty' : 'win';
}

export function TableScreen({ run, setRun, speed }: { run: RunState; setRun: SetRun; speed: 1 | 2 | 3 }) {
  const t = run.table!;
  const r = t.round;
  const roundKey = `${t.ante}:${t.stage}:${t.roundNo}`;
  const [sel, setSel] = useState<number[]>([]);
  const [target, setTarget] = useState<Consumable | null>(null);
  // how many dealer cards were on the table when the hand finished, so the dealer's draws can be animated
  const startDealer = useRef<{ key: string; n: number } | null>(null);
  const [fi, setFi] = useState<{ key: string; i: number }>({ key: '', i: 0 });

  if (r && r.phase !== 'done' && startDealer.current?.key !== roundKey) startDealer.current = { key: roundKey, n: 2 };
  const sd = startDealer.current?.key === roundKey ? startDealer.current.n : r?.dealer.length ?? 2;
  const frames = useMemo(() => (r?.phase === 'done' ? framesFor(r, sd) : []), [r, sd]);
  // a hand already finished when the page loaded skips straight to the end
  const fresh = startDealer.current?.key === roundKey;
  const frameIdx = fi.key === roundKey ? fi.i : fresh ? 0 : frames.length;
  const view = r?.phase === 'done' ? replay(r, frames, frameIdx, sd) : null;
  const animating = !!view && !view.done;

  useEffect(() => { setSel([]); setTarget(null); }, [roundKey]);

  // run the scoring timeline
  useEffect(() => {
    if (!r || r.phase !== 'done' || frameIdx >= frames.length) return;
    const fr = frames[frameIdx];
    const id = window.setTimeout(() => {
      if (fr.kind === 'flip') stakesSound.play('flip');
      if (fr.kind === 'dealer') stakesSound.play('deal');
      if (fr.kind === 'label') { const res = r.results![fr.hand]; stakesSound.play(res.outcome === 'bust' ? 'bust' : res.outcome === 'loss' ? 'lose' : 'select'); }
      if (fr.kind === 'step') stakesSound.play(fr.s.xmult ? 'xmult' : fr.s.mult ? 'mult' : fr.s.money ? 'money' : 'chips', fr.n);
      if (fr.kind === 'total') { const s = r.results![fr.hand].score!; stakesSound.play(s.total >= t.target * 0.5 ? 'big' : 'score'); if (s.shattered.length) stakesSound.play('shatter'); }
      setFi({ key: roundKey, i: frameIdx + 1 });
    }, DUR[fr.kind] * SPEED[speed] * (frameIdx === 0 ? 0.6 : 1));
    return () => window.clearTimeout(id);
  }, [r, frames, frameIdx, roundKey, speed, t.target]);

  // deal the next hand automatically once the last one has been scored
  const ready = !t.over && t.handsLeft > 0 && (!r || (r.phase === 'done' && !animating));
  useEffect(() => {
    if (!ready) return;
    const id = window.setTimeout(() => {
      // remember that we dealt this one, so even an instant blackjack gets its scoring animation
      startDealer.current = { key: `${t.ante}:${t.stage}:${t.roundNo + 1}`, n: 2 };
      setRun(deal);
      stakesSound.play('deal');
    }, r ? 650 * SPEED[speed] + 250 : 450);
    return () => window.clearTimeout(id);
  }, [ready, roundKey]);

  const overSound = useRef<string | null>(null);
  useEffect(() => {
    if (t.over && !animating && overSound.current !== roundKey) { overSound.current = roundKey; stakesSound.play(t.over.won ? 'cleared' : 'fail'); }
  }, [t.over, animating, roundKey]);

  const h = activeHand(run);
  const playing = !!h && !target;
  const up = r?.dealer[0];
  const book = h && up ? bookMove(h.cards, up, canDouble(run)) : null;
  const toggle = (uid: number) => {
    if (target) {
      const max = FORTUNES[target.id as keyof typeof FORTUNES].pick;
      setSel((s) => (s.includes(uid) ? s.filter((x) => x !== uid) : s.length < max ? [...s, uid] : s));
    } else setSel((s) => (s.includes(uid) ? [] : [uid]));
    stakesSound.play('select');
  };
  const doAct = (a: Parameters<typeof act>[1]) => { if (playing) { setRun((x) => act(x, a)); stakesSound.play('deal'); setSel([]); } };
  const doRedraw = () => { if (playing && sel.length === 1 && canRedraw(run)) { setRun((x) => redraw(x, sel[0])); stakesSound.play('deal'); setSel([]); } };
  const useCard = (c: Consumable) => {
    if (c.kind === 'fortune' && FORTUNES[c.id].pick) {
      if (!h) return;
      setTarget(c); setSel([]);
      return;
    }
    setRun((x) => useCons(x, c.uid));
    stakesSound.play('buy');
  };
  const confirmTarget = () => {
    if (!target) return;
    const f = FORTUNES[target.id as keyof typeof FORTUNES];
    if (sel.length < f.need) return;
    setRun((x) => useCons(x, target.uid, sel));
    stakesSound.play('buy');
    setTarget(null); setSel([]);
  };

  // keyboard: the same letters as every blackjack table
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (animating && (k === ' ' || k === 'enter')) { e.preventDefault(); setFi({ key: roundKey, i: frames.length }); return; }
    if (t.over && !animating && k === 'enter') { e.preventDefault(); setRun(leaveTable); return; }
    if (r?.phase === 'insurance') { if (k === 'y') setRun((x) => insure(x, true)); if (k === 'n') setRun((x) => insure(x, false)); return; }
    if (target) { if (k === 'enter') confirmTarget(); if (k === 'escape') { setTarget(null); setSel([]); } return; }
    if (!playing) return;
    if (k === 'h') doAct('hit'); else if (k === 's') doAct('stand'); else if (k === 'd' && canDouble(run)) doAct('double');
    else if (k === 'p' && canSplit(run)) doAct('split'); else if (k === 'f' && canSurrender(run)) doAct('surrender'); else if (k === 'r') doRedraw();
  };
  useEffect(() => {
    const fn = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  // the sidebar's chips × mult box: live scoring, or what you'd get if you won now
  const pros = prospect(run);
  const live: Live = view && view.hand >= 0 && view.type
    ? { label: view.type === 'loss' ? 'Loss' : HANDS[view.type].name, level: view.type === 'loss' ? null : handLevel(run, view.type), chips: view.chips, mult: view.mult, hot: false }
    : pros ? { label: HANDS[pros].name, level: handLevel(run, pros), chips: HANDS[pros].chips + HANDS[pros].lvChips * (handLevel(run, pros) - 1), mult: HANDS[pros].mult + HANDS[pros].lvMult * (handLevel(run, pros) - 1), hot: false, hint: 'if you win' }
      : { label: '', level: null, chips: 0, mult: 0, hot: false };
  const roundScore = r?.phase === 'done' && view ? t.score - r.gained + view.gained : t.score;

  const popFor = (at: { card: number } | { charm: number }) => {
    const p = view?.pop;
    if (!p) return null;
    if ('card' in at && 'card' in p.at && p.at.card === at.card) return p;
    if ('charm' in at && 'charm' in p.at && p.at.charm === at.charm) return p;
    return null;
  };
  const charmPop = (uid: number) => popFor({ charm: uid });
  const handPop = view?.pop && 'hand' in view.pop.at ? view.pop : null;
  const boss = t.boss ? BOSSES[t.boss] : null;
  const dealerCards = r ? r.dealer.slice(0, r.phase === 'done' && view ? view.dealerShown : r.dealer.length) : [];
  const holeDown = !!r && (r.phase !== 'done' ? r.holeHidden && !hasCharm(run, 'marked') : view ? !view.holeUp : false);
  const dTotal = r && !holeDown ? totalOf(dealerCards).total : r ? totalOf([r.dealer[0]]).total : 0;
  const peek = hasCharm(run, 'peeker') && t.deck.length ? t.deck[t.deck.length - 1] : null;

  return (
    <div className={`sk-game${boss ? ' boss' : ''}`}>
      <Sidebar run={run} live={live} roundScore={roundScore} />
      <main className="sk-main">
        <Inventory run={run} setRun={setRun} charmPop={charmPop} offUid={r?.off ?? null} onUse={useCard} usable={(c) => consUsable(run, c)} targeting={target?.uid ?? null} />

        <section className="sk-felt" aria-label="Blackjack table">
          <div className="sk-dealer">
            <span className="sk-zone-label">Dealer{r && <b className="sk-total">{holeDown ? dTotal : dTotal > 21 ? `Bust ${dTotal}` : dTotal}</b>}</span>
            <div className="sk-hand">
              {dealerCards.map((c, i) => <PlayingCard key={c.uid} card={c} i={i} down={i === 1 && holeDown} deal="house" />)}
            </div>
          </div>

          <div className="sk-piles">
            <div className="sk-pile house" title="House deck"><span className="sk-pile-stack" /><small>{t.boss === 'mirror' ? 'Your deck!' : `${t.house.length} house`}</small></div>
          </div>

          <div className="sk-player">
            {r?.hands.map((hand, hi) => {
              const res = r.results?.[hi];
              const scoringThis = view && view.hand === hi;
              const shown = view && res && view.labelled >= hi;
              const v = totalOf(hand.cards);
              const activeNow = r.phase === 'play' && r.active === hi;
              return (
                <div key={hi} className={`sk-phand${activeNow ? ' active' : ''}${view && !view.done && !scoringThis && view.hand >= 0 ? ' faded' : ''}`}>
                  <div className="sk-hand">
                    {hand.cards.map((c, i) => (
                      <PlayingCard key={c.uid} card={c} i={i} selected={sel.includes(c.uid)} pop={scoringThis ? popFor({ card: i }) : null}
                        jiggle={scoringThis && view?.pop && 'card' in view.pop.at && view.pop.at.card === i ? view.pop.key : undefined}
                        down={t.boss === 'mechanic' && i === 0 && r.phase !== 'done'}
                        onClick={(playing || target) && activeNow ? () => toggle(c.uid) : undefined} />
                    ))}
                  </div>
                  <div className="sk-hand-info">
                    <b className={`sk-total${v.total > 21 ? ' bust' : v.total === 21 ? ' tw' : ''}`}>{t.boss === 'mechanic' && r.phase !== 'done' ? '?' : v.total > 21 ? `Bust ${v.total}` : `${v.soft && v.total < 21 ? 'Soft ' : ''}${v.total}`}</b>
                    {hand.doubled && <span className="sk-chip-tag">Doubled</span>}
                    {shown && res && <span className={`sk-outcome o-${res.outcome}`} key={`${roundKey}-${hi}`}>{OUTCOME_LABEL(res)}</span>}
                  </div>
                  {scoringThis && view?.pop && handPop && <span className={`sk-pop pk-${handPop.kind} pk-hand`} key={`h${handPop.key}`}>{handPop.text}</span>}
                </div>
              );
            })}
          </div>

          <div className="sk-piles me">
            {peek && <div className="sk-peek" title="Peeker: the top card of your deck"><PlayingCard card={peek} size="sm" deal="none" label="Next" /></div>}
            <div className="sk-pile" title="Your deck"><span className="sk-pile-stack red" /><small>{t.deck.length}/{run.deck.length}</small></div>
          </div>

          {r?.phase === 'insurance' && (
            <div className="sk-banner">
              <p>The dealer shows an Ace. Insure for <b>$2</b>? If they have blackjack you get $8 and the hand back.</p>
              <div className="sk-row"><button type="button" className="sk-btn blue" onClick={() => setRun((x) => insure(x, true))}>Insure <kbd>Y</kbd></button><button type="button" className="sk-btn red" onClick={() => setRun((x) => insure(x, false))}>No <kbd>N</kbd></button></div>
            </div>
          )}

          {t.over && !animating && (
            <div className={`sk-banner big ${t.over.won ? 'win' : 'lose'}`}>
              <h2>{t.over.won ? 'Table cleared!' : 'Busted out'}</h2>
              <p>{t.over.won ? `${t.score.toLocaleString('en-US')} chips. ${t.handsLeft ? `${t.handsLeft} hand${t.handsLeft === 1 ? '' : 's'} to spare.` : ''}` : `${t.score.toLocaleString('en-US')} of ${t.target.toLocaleString('en-US')} chips. So close.`}</p>
              <button type="button" className={`sk-btn ${t.over.won ? 'orange' : 'red'} big`} onClick={() => setRun(leaveTable)} autoFocus>{t.over.won ? 'Cash out' : 'See the damage'} <kbd>Enter</kbd></button>
            </div>
          )}
          {animating && <button type="button" className="sk-skip" onClick={() => setFi({ key: roundKey, i: frames.length })}>Skip <kbd>Space</kbd></button>}
        </section>

        <div className="sk-actions">
          {target ? (
            <>
              <p className="sk-hint">Choose {FORTUNES[target.id as keyof typeof FORTUNES].need === FORTUNES[target.id as keyof typeof FORTUNES].pick ? FORTUNES[target.id as keyof typeof FORTUNES].pick : `up to ${FORTUNES[target.id as keyof typeof FORTUNES].pick}`} card{FORTUNES[target.id as keyof typeof FORTUNES].pick === 1 ? '' : 's'} in your hand for <b>{FORTUNES[target.id as keyof typeof FORTUNES].name}</b>: {FORTUNES[target.id as keyof typeof FORTUNES].text}</p>
              <button type="button" className="sk-btn green" onClick={confirmTarget} disabled={sel.length < FORTUNES[target.id as keyof typeof FORTUNES].need}>Use <kbd>Enter</kbd></button>
              <button type="button" className="sk-btn grey" onClick={() => { setTarget(null); setSel([]); }}>Cancel <kbd>Esc</kbd></button>
            </>
          ) : (
            <>
              <button type="button" className="sk-btn blue big" onClick={() => doAct('hit')} disabled={!playing}>Hit <kbd>H</kbd></button>
              <button type="button" className="sk-btn red big" onClick={() => doAct('stand')} disabled={!playing}>Stand <kbd>S</kbd></button>
              <button type="button" className="sk-btn orange" onClick={() => doAct('double')} disabled={!playing || !canDouble(run)}>Double <kbd>D</kbd></button>
              <button type="button" className="sk-btn green" onClick={doRedraw} disabled={!playing || sel.length !== 1 || !canRedraw(run)} title="Select a card in your hand, then swap it for the top card of your deck">
                Redraw <small>{t.redrawsLeft}</small> <kbd>R</kbd>
              </button>
              {hasCharm(run, 'split') && <button type="button" className="sk-btn purple" onClick={() => doAct('split')} disabled={!playing || !canSplit(run)}>Split <kbd>P</kbd></button>}
              {hasCharm(run, 'cold_feet') && <button type="button" className="sk-btn grey" onClick={() => doAct('surrender')} disabled={!playing || !canSurrender(run)}>Surrender <kbd>F</kbd></button>}
              <p className="sk-hint">
                {playing ? (sel.length ? 'Press Redraw to swap the selected card.' : hasCharm(run, 'by_the_book') && book ? `By the Book says: ${book.toLowerCase()}.` : 'Click a card to select it for a redraw.') : r?.phase === 'done' && !t.over ? 'Dealing…' : ''}
              </p>
            </>
          )}
        </div>
        {boss && <p className="sk-bossline" style={{ '--bc': boss.color } as CSSProperties}><span>{boss.icon}</span> <b>{boss.name}:</b> {boss.text}</p>}
        <p className="sk-stageline">{STAGE_INFO[t.stage].name} · Ante {t.ante}</p>
      </main>
    </div>
  );
}

export type { PCard };
