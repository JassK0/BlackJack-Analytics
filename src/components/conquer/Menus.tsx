// Count & Conquer: title screen, leaderboard and the how-to-play guide
import { useState } from 'react';
import { money } from '../../lib/format';
import { CITIES } from '../../conquer/data';
import { cleanSeed, formatSeed, FREE_WATCH_TEXT, HOT_TC, COLD_TC, SIDE_PAYS } from '../../conquer/engine';
import { dailySeed, MAX_STARS, type BoardEntry, type RunState } from '../../conquer/run';
import { Icon, Neon, Skyline } from './art';

export function TitleScreen({ saved, assisted, setAssisted, onStart, onContinue, onHowTo, onBoard, best }: {
  saved: RunState | null; assisted: boolean; setAssisted: (v: boolean) => void; best: number;
  onStart: (seed: string | null, daily: boolean) => void; onContinue: () => void; onHowTo: () => void; onBoard: () => void;
}) {
  const [seed, setSeed] = useState('');
  const today = dailySeed();
  const clean = cleanSeed(seed);
  return (
    <div className="cq-title">
      <Skyline act={2} className="cq-title-sky" />
      <div className="cq-title-glow" aria-hidden="true" />
      <div className="cq-title-inner">
        <div className="cq-logo">
          <Neon text="COUNT" tone="pink" as="h1" className="cq-logo-a" dying={3} />
          <span className="cq-logo-amp" aria-hidden="true">&amp;</span>
          <Neon text="CONQUER" tone="cyan" as="h1" className="cq-logo-b" />
        </div>
        <p className="cq-tagline">A card-counting roguelite. Count the shoe, bet the heat, and clean out three cities before they figure you out.</p>
        <div className="cq-title-menu">
          {saved && !saved.end && (
            <button type="button" className="cq-btn primary big" onClick={onContinue}>
              Continue run <small>{CITIES[saved.act - 1].name} · {money(saved.bankroll)} · seed {saved.seedLabel}</small>
            </button>
          )}
          <button type="button" className={`cq-btn big ${saved && !saved.end ? 'gold' : 'primary'}`} onClick={() => onStart(null, false)}>New run</button>
          <button type="button" className="cq-btn big ghost" onClick={() => onStart(today, true)}>
            Today's seed <small>{today} · everyone gets the same casinos</small>
          </button>
          <form className="cq-seed" onSubmit={(e) => { e.preventDefault(); if (clean) onStart(clean, false); }}>
            <label htmlFor="cq-seed">Seed</label>
            <input id="cq-seed" value={seed} onChange={(e) => setSeed(e.target.value.toUpperCase())} placeholder="K7Q2-9AJ4" maxLength={14} autoComplete="off" spellCheck={false} />
            <button type="submit" className="cq-btn ghost" disabled={!clean}>Play seed</button>
          </form>
          <label className="cq-switch">
            <input type="checkbox" checked={assisted} onChange={(e) => setAssisted(e.target.checked)} />
            <span className="cq-switch-ui" aria-hidden="true" />
            <span><strong>Assisted mode</strong><small>Shows the running and true count at all times. Great for learning; scores count half.</small></span>
          </label>
          <div className="cq-row center">
            <button type="button" className="cq-btn ghost" onClick={onHowTo}><Icon name="help" size={16} /> How to play</button>
            <button type="button" className="cq-btn ghost" onClick={onBoard}><Icon name="trophy" size={16} /> Leaderboard{best ? ` · best ${best.toLocaleString('en-US')}` : ''}</button>
          </div>
        </div>
        <p className="cq-fine">Everything stays in this browser. Card counting is legal; casinos are allowed to ask you to leave anyway.</p>
      </div>
    </div>
  );
}

export function Leaderboard({ board, onBack, onPlay, onClear }: { board: BoardEntry[]; onBack: () => void; onPlay: (seed: string) => void; onClear: () => void }) {
  return (
    <div className="cq-screen cq-board">
      <Neon text="HIGH ROLLERS" tone="gold" as="h1" />
      <p className="cq-lede">Your best runs on this device. Share a seed and see who counts better.</p>
      {board.length ? (
        <div className="cq-table-wrap">
          <table className="cq-table">
            <thead><tr><th>#</th><th>Score</th><th>Result</th><th>Seed</th><th>Bosses</th><th>Jobs</th><th>Date</th><th aria-label="Play this seed" /></tr></thead>
            <tbody>
              {board.map((e, i) => (
                <tr key={i} className={e.won ? 'won' : ''}>
                  <td>{i + 1}</td>
                  <td className="num">{e.score.toLocaleString('en-US')}</td>
                  <td>{e.won ? '🏆 Won' : `${CITIES[e.act - 1]?.name ?? '?'}`}{e.assisted && <span className="cq-badge">assisted</span>}{e.daily && <span className="cq-badge gold">daily</span>}</td>
                  <td className="mono">{e.seedLabel ?? formatSeed(e.seed)}</td>
                  <td>{e.bosses}</td>
                  <td>{e.cleared}</td>
                  <td>{e.date}</td>
                  <td><button type="button" className="cq-btn ghost small" onClick={() => onPlay(e.seedLabel ?? e.seed)}>Play</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="cq-empty">No runs yet. The tables are waiting.</p>}
      <div className="cq-row center">
        <button type="button" className="cq-btn primary" onClick={onBack}><Icon name="back" size={16} /> Back</button>
        {board.length > 0 && <button type="button" className="cq-btn ghost" onClick={() => { if (confirm('Delete every saved score from this browser?')) onClear(); }}>Clear scores</button>}
      </div>
    </div>
  );
}

const HILO_DEMO: [string, string, string][] = [['2', '+1', 'up'], ['4', '+1', 'up'], ['6', '+1', 'up'], ['7', '0', 'flat'], ['9', '0', 'flat'], ['10', '−1', 'down'], ['K', '−1', 'down'], ['A', '−1', 'down']];

export function HowTo({ onBack }: { onBack: () => void }) {
  return (
    <div className="cq-screen cq-howto">
      <Neon text="HOW TO COUNT & CONQUER" tone="cyan" as="h1" />
      <div className="cq-howto-grid">
        <section>
          <h2><Icon name="casino" size={18} /> The goal</h2>
          <p>Cross three cities. Each has a map of casinos, events, shops and a motel, with a <strong>boss casino</strong> at the top. Every casino has a <strong>job</strong>: get a set amount of <strong>hot money</strong> on the table. Your bankroll is your health and your currency.</p>
        </section>
        <section>
          <h2><Icon name="cheat_sheet" size={18} /> Keep the count (Hi-Lo)</h2>
          <div className="cq-hilo">{HILO_DEMO.map(([r, v, k]) => <span key={r} className={k}><b>{r}</b>{v}</span>)}</div>
          <p>Add up every card you see: yours, the regulars', the dealer's. That's the <strong>running count</strong>. High means the shoe is rich in tens and aces, which is good for you.</p>
        </section>
        <section>
          <h2><Icon name="focus" size={18} /> True count</h2>
          <p>Divide the running count by the <strong>decks left</strong> (the shoe on the table shows it, to the nearest half deck). A running count of +6 with 2 decks left is a true count of +3.</p>
        </section>
        <section>
          <h2><Icon name="flame" size={18} /> Hot money</h2>
          <p>Every dollar you bet while the true count is <strong>+{HOT_TC} or better</strong> counts toward the job. Big bets below +{COLD_TC} are <strong>cold money</strong> and set the job back. Minimum bets never hurt. So bet small when it's cold and big when it's hot.</p>
        </section>
        <section>
          <h2><Icon name="eye" size={18} /> Heat</h2>
          <p>The pit boss watches for counters. Heat rises when you <strong>jump your bet</strong> (ramp up gradually instead), bet big into a hot shoe, take insurance, sit down mid-shoe at a high count, lose the count, or hover too long. It falls with <strong>small flat bets</strong>, <strong>tips</strong> and keeping your cool.</p>
          <ul className="cq-ladder"><li><b>25</b> noticed</li><li><b>50</b> watched: early shuffles on good counts</li><li><b>80</b> max bet halved</li><li><b>100</b> backed off: +1 star</li></ul>
        </section>
        <section>
          <h2><Icon name="watch" size={18} /> Watch from the rail</h2>
          <p>You start each casino standing behind the table. Watch hands for free ({FREE_WATCH_TEXT}), count them, and sit down when the shoe looks good. You can stand up again when the count drops. Real counters call this <em>back-counting</em>.</p>
        </section>
        <section>
          <h2><Icon name="star" size={18} /> Small talk and Focus</h2>
          <p>Every few hands the pit boss chats you up to knock you off your count, then you must name the running count. Get it right for <strong>+1 Focus</strong> and less heat. Spend Focus to see the exact true count for one hand.</p>
        </section>
        <section>
          <h2><Icon name="lucky_chip" size={18} /> Count-sensitive bets</h2>
          <p><strong>Lucky 20</strong> pays {SIDE_PAYS} to 1 when your first two cards make 20; it's a bad bet normally and a good one when the true count is about +2 or higher. <strong>Insurance</strong> is worth taking at +3 or higher.</p>
        </section>
        <section>
          <h2><Icon name="boss" size={18} /> Stars and bosses</h2>
          <p>Get backed off and you earn a notoriety star, which also starts you hotter everywhere. {MAX_STARS} stars and you're blacklisted. Fail a boss job and you can come back the next night for half your bankroll and a star.</p>
        </section>
        <section>
          <h2><Icon name="cheat_sheet" size={18} /> Keys</h2>
          <p className="cq-keys"><kbd>Enter</kbd> deal or watch · <kbd>H</kbd> hit · <kbd>S</kbd> stand or sit · <kbd>D</kbd> double · <kbd>R</kbd> surrender · <kbd>1</kbd>–<kbd>4</kbd> chips · <kbd>X</kbd> double bet · <kbd>L</kbd> Lucky 20 · <kbd>T</kbd> tip · <kbd>F</kbd> focus · <kbd>Y</kbd>/<kbd>N</kbd> insurance</p>
        </section>
      </div>
      <button type="button" className="cq-btn primary big" onClick={onBack}><Icon name="back" size={16} /> Got it</button>
    </div>
  );
}
