// The Daily Shoe: a once-a-day blackjack challenge on the same shoe for everyone
import { useEffect, useMemo, useState } from 'react';
import type { Rank } from '../engine/types';
import { handValue } from '../engine/cards';
import {
  act, botRun, canDouble, bookMove, DAILY, dailyShoe, dayKey, dayNumber, loadStore, maxBetFor, msUntilTomorrow, newGame,
  nextHand, perfectRun, saveStore, shareText, startHand, stats, summarize, TILE,
  type Act, type DailyStore, type GameState, type HandState, type Result, type Summary,
} from '../game/daily';
import { money, pct, signClass } from '../lib/format';
import { suitFor } from './felt';

const RED = new Set(['♥', '♦']);
const RESULT_TEXT: Record<Result, string> = {
  blackjack: 'Blackjack!', win: 'You win', dealer_bust: 'Dealer busts', push: 'Push', lose: 'Dealer wins', bust: 'Bust', dealer_blackjack: 'Dealer blackjack',
};
const ACT_TEXT: Record<Act, string> = { HIT: 'hit', STAND: 'stand', DOUBLE: 'double' };
const CHIPS = [{ v: 10, c: '#d8d6cf' }, { v: 25, c: '#17803d' }, { v: 50, c: '#c3262b' }, { v: 100, c: '#262626' }];
const HINTS_KEY = 'bja.daily.hints';

function Card({ rank, handNo, who, i, down, delay }: { rank: Rank; handNo: number; who: 'player' | 'dealer'; i: number; down?: boolean; delay?: number }) {
  const suit = suitFor(handNo, who, i, rank);
  const face = rank === 'J' || rank === 'Q' || rank === 'K';
  return (
    <div className={`pcard gcard${RED.has(suit) ? ' red' : ''}${down ? ' down' : ''}`} style={{ animationDelay: `${delay ?? 0}ms` }} aria-label={down ? 'Face-down card' : `${rank}${suit}`}>
      <div className="pcard-inner">
        <div className="pcard-face front">
          <span className="corner tl">{rank}<i>{suit}</i></span>
          <span className={`pip${face ? ' face' : ''}`}>{face ? rank : suit}</span>
          <span className="corner br">{rank}<i>{suit}</i></span>
        </div>
        <div className="pcard-face back" />
      </div>
    </div>
  );
}

function Total({ cards }: { cards: Rank[] }) {
  if (!cards.length) return null;
  const { total, soft } = handValue(cards);
  const bj = cards.length === 2 && total === 21;
  return <span className={`badge gtotal${bj ? ' bj' : total > 21 ? ' bust' : ''}`}>{bj ? 'Blackjack' : total > 21 ? `Bust ${total}` : <>{soft && total < 21 && <small>soft</small>}{total}</>}</span>;
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function DailyShoe({ onStatus }: { onStatus: (playedToday: boolean) => void }) {
  const [today, setToday] = useState(dayKey());
  const [store, setStore] = useState<DailyStore>(loadStore);
  const [game, setGame] = useState<GameState>(() => {
    const p = store.progress;
    return p && p.day === today ? p : newGame(today);
  });
  const [bet, setBet] = useState(() => Math.min(game.lastBet, maxBetFor(game)));
  const [shown, setShown] = useState(() => (game.current?.result ? game.current.dealer.length : 1));
  const [left, setLeft] = useState(msUntilTomorrow());
  const [hints, setHints] = useState(() => { try { return localStorage.getItem(HINTS_KEY) === '1'; } catch { return false; } });
  const [rulesOpen, setRulesOpen] = useState(() => !Object.keys(store.games).length && !game.hands.length && !game.current);
  const [copied, setCopied] = useState(false);
  const shoe = useMemo(() => dailyShoe(today), [today]);

  // a new day starts a new shoe
  useEffect(() => {
    const t = setInterval(() => {
      setLeft(msUntilTomorrow());
      const k = dayKey();
      if (k !== today) { setToday(k); setGame(newGame(k)); setShown(1); setBet(25); }
    }, 1000);
    return () => clearInterval(t);
  }, [today]);

  // save after every move, so a refresh resumes and can't re-deal the day
  useEffect(() => {
    setStore((s) => {
      const next: DailyStore = { ...s, progress: game };
      saveStore(next);
      return next;
    });
  }, [game]);
  useEffect(() => { onStatus(!!store.games[today]); }, [store, today, onStatus]);
  useEffect(() => { try { localStorage.setItem(HINTS_KEY, hints ? '1' : '0'); } catch { /* ignore */ } }, [hints]);

  // dealer reveal: flip the hole card, then draw one card at a time
  const h = game.current;
  const revealing = !!h?.result && shown < h.dealer.length;
  useEffect(() => {
    if (!h?.result || shown >= h.dealer.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), shown === 1 ? 380 : 540);
    return () => clearTimeout(t);
  }, [h, shown]);

  const perfect = useMemo(() => (game.finished ? perfectRun(shoe) : null), [game.finished, shoe]);
  const bot = useMemo(() => (game.finished ? botRun(shoe) : null), [game.finished, shoe]);
  const summary: Summary | null = useMemo(() => (game.finished && perfect && bot ? summarize(game, perfect, bot) : null), [game, perfect, bot]);

  // record the finished day once
  useEffect(() => {
    if (!summary || store.games[summary.day]) return;
    setStore((s) => {
      const next = { ...s, games: { ...s.games, [summary.day]: summary } };
      saveStore(next);
      return next;
    });
  }, [summary, store.games]);

  const deal = () => {
    if (game.current || game.finished || bet < Math.min(DAILY.minBet, game.bankroll)) return;
    setShown(1);
    setRulesOpen(false);
    setGame(startHand(game, shoe, bet));
  };
  const play = (a: Act) => { if (h && !h.result && !(a === 'DOUBLE' && !canDouble(game))) setGame(act(game, shoe, a)); };
  const next = () => {
    if (!h?.result || revealing) return;
    const g = nextHand(game);
    setGame(g);
    setBet((b) => Math.max(Math.min(DAILY.minBet, g.bankroll), Math.min(b, maxBetFor(g))));
    setShown(1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.drawer.open, .modal')) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, select, textarea')) return;
      const k = e.key.toLowerCase();
      if (k === 'enter' || k === ' ') {
        // Enter on a chip or move button means "deal / next", not "press that button again"
        const shortcutOwner = k === 'enter' && t.closest('.chip-btn, .act-btn, .tabs button.active');
        if (!shortcutOwner && t.closest('button, a, [role="radio"]')) return;
        e.preventDefault();
        if (!game.current) deal(); else if (game.current.result) next();
      } else if (h && !h.result) {
        if (k === 'h') play('HIT');
        else if (k === 's') play('STAND');
        else if (k === 'd') play('DOUBLE');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const handNo = game.hands.length + (game.current ? 1 : 0);
  const dealerCards = h ? h.dealer.slice(0, Math.max(2, h.result ? shown : 2)) : [];
  const book = h && !h.result && hints ? bookMove(h.player, h.dealer[0], canDouble(game)) : null;
  const date = new Date(`${today}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="daily">
      <header className="daily-head">
        <div>
          <span className="eyebrow">Daily challenge · {date}</span>
          <h1>The Daily Shoe <span className="daily-no">#{dayNumber(today)}</span></h1>
          <p className="sub">Everyone gets the same {DAILY.decks * 52}-card shoe today. {DAILY.hands} hands, {money(DAILY.bankroll)}, one try. Tomorrow it reshuffles.</p>
        </div>
        <div className="head-actions">
          <button type="button" className="btn ghost small" aria-expanded={rulesOpen} onClick={() => setRulesOpen(!rulesOpen)}>How to play</button>
        </div>
      </header>

      {rulesOpen && (
        <section className="card how-to">
          <ul>
            <li><strong>Same cards for everyone.</strong> Today's shoe is shuffled from the date, so every player faces the same cards in the same order.</li>
            <li><strong>Your moves change your cards.</strong> Every hit takes a card someone else's plan might have used. One greedy hit can hand the dealer the ten you needed next hand.</li>
            <li><strong>Bet {money(DAILY.minBet)} to {money(DAILY.maxBet)} a hand.</strong> Hit, stand or double on your first two cards. Dealer stands on 17, blackjack pays 3:2.</li>
            <li><strong>Then see perfect.</strong> After hand {DAILY.hands} you'll see the best possible result for today's shoe, played with hindsight, and how much of it you captured.</li>
            <li><strong>One game a day.</strong> Your progress saves as you go. Keys: <kbd>H</kbd> hit, <kbd>S</kbd> stand, <kbd>D</kbd> double, <kbd>Enter</kbd> deal or next.</li>
          </ul>
        </section>
      )}

      <div className="daily-hud">
        <span>Hand <strong>{Math.min(handNo || 1, DAILY.hands)}</strong> of {DAILY.hands}</span>
        <span>Bankroll <strong className={signClass(game.bankroll - DAILY.bankroll)}>{money(game.bankroll)}</strong></span>
        <span>Shoe <strong>{Math.max(0, DAILY.decks * 52 - game.pos)}</strong> cards left</span>
        <ol className="tiles" aria-label="Hands played">
          {Array.from({ length: DAILY.hands }, (_, i) => {
            const done = game.hands[i];
            const live = !done && i === game.hands.length && !!game.current;
            return <li key={i} className={done ? `t-${done.result}` : live ? 'live' : ''} title={done ? `${RESULT_TEXT[done.result!]} ${money(done.profit, { sign: true })}` : `Hand ${i + 1}`}>{done ? TILE[done.result!] : ''}</li>;
          })}
        </ol>
      </div>

      {game.finished && summary && perfect && <Results summary={summary} game={game} perfect={perfect} store={store} today={today} left={left} copied={copied}
        onCopy={async () => {
          try { await navigator.clipboard.writeText(shareText(summary)); setCopied(true); setTimeout(() => setCopied(false), 2200); } catch { setCopied(false); }
        }} />}

      {!game.finished && <div className="felt-wrap">
        <div className="felt dtable" role="img" aria-label="Your blackjack table">
          <svg className="felt-print" viewBox="0 0 100 58.75" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            <defs><path id="dfa1" d="M 24 16 Q 50 28 76 16" /><path id="dfa2" d="M 31 20.5 Q 50 30.5 69 20.5" /></defs>
            <text className="arc-main" textAnchor="middle"><textPath href="#dfa1" startOffset="50%">THE DAILY SHOE</textPath></text>
            <text className="arc-sub" textAnchor="middle"><textPath href="#dfa2" startOffset="50%">PAYS 3 TO 2 · DEALER STANDS ON 17</textPath></text>
          </svg>
          <div className="drow dealer">
            {h && <Total cards={h.result ? dealerCards.slice(0, Math.max(1, shown)) : [h.dealer[0]]} />}
            {dealerCards.map((c, i) => (
              <Card key={`${handNo}-d-${i}`} rank={c} handNo={handNo} who="dealer" i={i} delay={i < 2 ? 110 + i * 220 : 0}
                down={i === 1 && (!h?.result || shown < 2)} />
            ))}
          </div>
          <div className="drow player">
            {h && <Total cards={h.player} />}
            {h?.player.map((c, i) => <Card key={`${handNo}-p-${i}`} rank={c} handNo={handNo} who="player" i={i} delay={i < 2 ? i * 220 : 0} />)}
          </div>
          <div className="bet-circle">
            {(h || (!game.finished && bet > 0)) && <span className="dchip">{money(h ? h.bet * (h.doubled ? 2 : 1) : bet)}</span>}
          </div>
          {h?.result && !revealing && (
            <div className={`banner show ${h.profit > 0 ? (h.result === 'blackjack' ? 'blackjack' : 'win') : h.profit < 0 ? 'lose' : 'push'}`}>
              {RESULT_TEXT[h.result]}<small>{h.profit === 0 ? 'Bet returned' : money(h.profit, { sign: true })}</small>
            </div>
          )}
          {!h && !game.finished && game.hands.length === 0 && <div className="banner show info">Place your first bet<small>Same cards for everyone today</small></div>}
        </div>
      </div>}

      {!game.finished && (
        <section className="card daily-controls">
          {!h && (
            <div className="bet-row">
              <div className="bet-amount"><span className="label">Your bet</span><strong>{money(bet)}</strong><span className="muted small">{money(DAILY.minBet)} to {money(maxBetFor(game))}</span></div>
              <div className="chip-buttons" role="group" aria-label="Add chips">
                {CHIPS.map((c) => (
                  <button key={c.v} type="button" className={`chip-btn${c.v === 10 ? ' light' : ''}`} style={{ ['--c' as string]: c.c }} disabled={bet >= maxBetFor(game)}
                    onClick={() => setBet((b) => Math.min(maxBetFor(game), b + c.v))} aria-label={`Add ${money(c.v)}`}>{c.v}</button>
                ))}
                <button type="button" className="btn ghost small" onClick={() => setBet(0)}>Clear</button>
              </div>
              <button type="button" className="btn primary big-ish" onClick={deal} disabled={bet < Math.min(DAILY.minBet, game.bankroll)}>
                Deal hand {game.hands.length + 1} <kbd>Enter</kbd>
              </button>
            </div>
          )}
          {h && !h.result && (
            <div className="act-row">
              <button type="button" className="btn act-btn" onClick={() => play('HIT')}>Hit <kbd>H</kbd></button>
              <button type="button" className="btn act-btn" onClick={() => play('STAND')}>Stand <kbd>S</kbd></button>
              <button type="button" className="btn act-btn" onClick={() => play('DOUBLE')} disabled={!canDouble(game)}
                title={canDouble(game) ? undefined : h.player.length > 2 ? 'Only on your first two cards' : 'Not enough bankroll to double'}>Double <kbd>D</kbd></button>
              {book && <span className="book-hint">Basic strategy says: <strong>{ACT_TEXT[book]}</strong></span>}
            </div>
          )}
          {h?.result && (
            <div className="act-row">
              <span className={`hand-result ${signClass(h.profit)}`}>{revealing ? 'Dealer is playing...' : `${RESULT_TEXT[h.result]} ${h.profit === 0 ? '(push)' : money(h.profit, { sign: true })}`}</span>
              <button type="button" className="btn primary" onClick={next} disabled={revealing}>
                {game.hands.length + 1 >= DAILY.hands || game.bankroll < DAILY.minBet ? 'See your results' : 'Next hand'} <kbd>Enter</kbd>
              </button>
            </div>
          )}
          <label className="switch hint-switch"><input type="checkbox" checked={hints} onChange={(e) => setHints(e.target.checked)} /><span aria-hidden="true" />Show basic-strategy hints</label>
        </section>
      )}

      {!game.finished && <p className="muted small daily-foot">Next shoe in {clock(left)}. Progress saves in this browser only.</p>}
    </div>
  );
}

function handText(player: Rank[], dealer: Rank[], actions: Act[], result?: Result | null) {
  const moves = actions.length ? actions.map((a) => ACT_TEXT[a]).join(', ')
    : result === 'blackjack' ? 'blackjack' : result === 'dealer_blackjack' ? 'dealer blackjack' : 'both blackjack';
  return `${player.join(' ')} vs ${dealer.join(' ')} · ${moves}`;
}

function Results({ summary: s, game, perfect, store, today, left, copied, onCopy }: {
  summary: Summary; game: GameState; perfect: ReturnType<typeof perfectRun>; store: DailyStore; today: string; left: number; copied: boolean; onCopy: () => void;
}) {
  const st = stats(store, today);
  const maxCount = Math.max(1, ...st.dist.map((d) => d.count));
  const mine = (i: number): HandState | undefined => game.hands[i];
  const todayBucket = s.profit < 0 ? 0 : s.pct < 0.1 ? 1 : s.pct < 0.25 ? 2 : s.pct < 0.5 ? 3 : 4;
  return (
    <>
      <section className="card daily-results">
        <span className="eyebrow">Today's result · #{s.number}</span>
        <h2>{s.title}</h2>
        <p className="muted">{s.blurb}</p>
        <div className="score-row">
          <div><span>You</span><strong className={signClass(s.profit)}>{money(s.final)}</strong><em>{money(s.profit, { sign: true })}</em></div>
          <div><span>Perfect hindsight</span><strong>{money(s.perfect)}</strong><em>{money(s.perfect - DAILY.bankroll, { sign: true })}</em></div>
          <div><span>Basic-strategy bot ({money(DAILY.botBet)} flat)</span><strong>{money(s.bot)}</strong><em>{money(s.bot - DAILY.bankroll, { sign: true })}</em></div>
        </div>
        <div className="pct-meter" aria-label={`${Math.round(s.pct * 100)} percent of the perfect run's profit`}>
          <i style={{ width: `${Math.max(0, Math.min(100, s.pct * 100))}%` }} />
        </div>
        <p className="pct-line"><strong>{pct(s.pct, 0)}</strong> of the perfect run's profit · book moves {s.book.match}/{s.book.total}
          {' · '}{s.final > s.bot ? `beat the bot by ${money(s.final - s.bot)}` : s.final < s.bot ? `the bot won by ${money(s.bot - s.final)}` : 'tied the bot'}</p>
        <div className="share-box">
          <pre aria-label="Share text">{shareText(s)}</pre>
          <div className="share-actions">
            <button type="button" className="btn primary" onClick={onCopy}>{copied ? 'Copied!' : 'Copy result to share'}</button>
            <span className="countdown">Next shoe in <strong>{clock(left)}</strong></span>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-head"><h3>How the perfect run played it</h3><p>With hindsight it bets {money(DAILY.maxBet)} on hands it will win and {money(DAILY.minBet)} on the rest, and it plays each hand so the cards fall best for later hands, even if that means busting on purpose.</p></div>
        <div className="table-wrap">
          <table className="data perfect-table">
            <thead><tr><th>#</th><th>Perfect play</th><th className="num">Result</th><th>Your play</th><th className="num">Result</th></tr></thead>
            <tbody>
              {perfect.hands.map((p, i) => {
                const m = mine(i);
                const sacrifice = p.line.result === 'bust' || (p.profit < 0 && p.line.actions.includes('HIT'));
                return (
                  <tr key={i}>
                    <td className="num">{i + 1}</td>
                    <td>{TILE[p.line.result]} {handText(p.line.player, p.line.dealer, p.line.actions, p.line.result)}{sacrifice && <em className="sacrifice"> burns cards on purpose</em>}</td>
                    <td className={`num ${signClass(p.profit)}`}>{money(p.profit, { sign: true })} <span className="muted">(bet {money(p.bet)})</span></td>
                    <td>{m ? <>{TILE[m.result!]} {handText(m.player, m.dealer, m.actions, m.result)}</> : <span className="muted">not played</span>}</td>
                    <td className={`num ${m ? signClass(m.profit) : ''}`}>{m ? <>{money(m.profit, { sign: true })} <span className="muted">(bet {money(m.bet)})</span></> : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card daily-stats">
        <div className="card-head"><h3>Your stats</h3><p>Kept in this browser only.</p></div>
        <div className="stat-tiles">
          <div><strong>{st.played}</strong><span>Played</span></div>
          <div><strong>{pct(st.winPct, 0)}</strong><span>Finished up</span></div>
          <div><strong>{st.current}</strong><span>Current streak</span></div>
          <div><strong>{st.maxStreak}</strong><span>Best streak</span></div>
        </div>
        <h4>Share of the perfect run's profit</h4>
        <ol className="dist">
          {st.dist.map((d, i) => (
            <li key={d.label}>
              <span>{d.label}</span>
              <i className={i === todayBucket ? 'today' : ''} style={{ width: `${Math.max(8, (d.count / maxCount) * 100)}%` }}>{d.count}</i>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
