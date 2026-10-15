// Count & Conquer: the game shell (title, run screens, top bar, saving)
import { useEffect, useRef, useState } from 'react';
import '../../conquer/conquer.css';
import { money } from '../../lib/format';
import { CITIES, RELICS, type RelicId } from '../../conquer/data';
import { randomSeedCode } from '../../conquer/engine';
import {
  clearBoard, loadBoard, loadRun, loadSettings, MAX_STARS, newRun, recordRun, saveRun, saveSettings, scoreOf,
  type BoardEntry, type ConquerSettings, type RunState,
} from '../../conquer/run';
import { sound } from '../../conquer/audio';
import { CasinoTable } from './CasinoTable';
import { MapView } from './MapView';
import { ActScreen, EndScreen, EventScreen, MotelScreen, RelicCard, RetryScreen, RewardScreen, ShopScreen } from './Screens';
import { HowTo, Leaderboard, TitleScreen } from './Menus';
import { Icon } from './art';

type View = 'title' | 'game' | 'board' | 'howto';
const ROMAN = ['', 'I', 'II', 'III'];

export default function Conquer() {
  const [settings, setSettingsState] = useState<ConquerSettings>(loadSettings);
  const [run, setRunState] = useState<RunState | null>(loadRun);
  const [view, setView] = useState<View>('title');
  const [board, setBoard] = useState<BoardEntry[]>(loadBoard);
  const [rank, setRank] = useState(0);
  const [help, setHelp] = useState(false);
  const [relic, setRelic] = useState<RelicId | null>(null);
  const [seedCopied, setSeedCopied] = useState(false);
  const recorded = useRef<number | null>(null);

  const setSettings = (patch: Partial<ConquerSettings>) => setSettingsState((s) => { const n = { ...s, ...patch }; saveSettings(n); return n; });
  const setRun = (fn: (r: RunState) => RunState) => setRunState((r) => (r ? fn(r) : r));

  // the run is saved after every move; a finished run goes on the leaderboard once, then the save is cleared
  useEffect(() => {
    if (!run) return;
    if (run.end) {
      if (recorded.current !== run.startedAt) {
        recorded.current = run.startedAt;
        const res = recordRun(run);
        setBoard(res.board);
        setRank(res.rank);
      }
      saveRun(null);
    } else saveRun(run);
  }, [run]);

  // the display fonts load only when someone opens the game
  useEffect(() => {
    if (document.getElementById('cq-fonts')) return;
    const l = document.createElement('link');
    l.id = 'cq-fonts';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Monoton&display=swap';
    document.head.appendChild(l);
  }, []);

  // sound follows the setting and goes quiet when you leave the tab
  useEffect(() => { sound.setEnabled(settings.sound); return () => sound.setEnabled(false); }, [settings.sound]);

  useEffect(() => {
    if (!relic && !help) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { setRelic(null); setHelp(false); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [relic, help]);

  const start = (seed: string | null, daily: boolean) => {
    if (run && !run.end && run.stats.tables > 0) {
      if (!confirm('Abandon your current run? It goes on the leaderboard as it stands.')) return;
      recordRun({ ...run, end: { won: false, reason: 'Walked away mid-run.', score: scoreOf(run, false) } });
      setBoard(loadBoard());
    }
    const r = newRun(seed ?? randomSeedCode(), settings.assisted, daily);
    setRunState(r);
    setRank(0);
    setView('game');
    if (!settings.seenHowTo) { setHelp(true); setSettings({ seenHowTo: true }); }
    sound.play('shuffle');
  };

  const bankroll = run?.table ? run.table.bankroll : run?.bankroll ?? 0;
  const focus = run?.table ? run.table.focus : run?.focus ?? 0;
  const inGame = view === 'game' && run;

  return (
    <div className={`cq${inGame ? ` act-${run.act}` : ''}`}>
      <div className="cq-bg" aria-hidden="true"><i className="fog a" /><i className="fog b" /><i className="grain" /></div>

      {inGame && (
        <header className="cq-topbar">
          <button type="button" className="cq-iconbtn" onClick={() => setView('title')} aria-label="Back to the title screen (your run is saved)" title="Menu (your run is saved)"><Icon name="back" size={18} /></button>
          <div className="cq-tb-city"><span>Act {ROMAN[run.act]}</span><strong>{CITIES[run.act - 1].name}</strong></div>
          <div className="cq-tb-stat" title="Bankroll"><Icon name="cash" size={16} /><strong>{money(bankroll)}</strong></div>
          <div className="cq-tb-stars" title={`Notoriety: ${run.notoriety} of ${MAX_STARS} stars. At ${MAX_STARS} you're blacklisted.`} aria-label={`Notoriety ${run.notoriety} of ${MAX_STARS}`}>
            {Array.from({ length: MAX_STARS }, (_, i) => <Icon key={i} name="star" size={15} className={i < run.notoriety ? 'on' : ''} />)}
          </div>
          <div className="cq-tb-focus" title={`Focus ${focus} of ${run.maxFocus}`} aria-label={`Focus ${focus} of ${run.maxFocus}`}>
            {Array.from({ length: run.maxFocus }, (_, i) => <i key={i} className={i < focus ? 'on' : ''} />)}
          </div>
          <div className="cq-relics" aria-label="Your gear">
            {run.relics.length === 0 && <span className="cq-dim">No gear yet</span>}
            {run.relics.map((id) => (
              <button key={id} type="button" className={`cq-relic-pip r-${RELICS[id].rarity}`} onClick={() => setRelic(id)} title={`${RELICS[id].name}: ${RELICS[id].text}`} aria-label={RELICS[id].name}>
                <Icon name={id} size={17} />
              </button>
            ))}
          </div>
          <div className="cq-tb-tools">
            <button type="button" className="cq-seedbtn" title="Copy the seed" onClick={async () => { try { await navigator.clipboard.writeText(run.seedLabel); setSeedCopied(true); window.setTimeout(() => setSeedCopied(false), 1500); } catch { /* blocked */ } }}>
              {seedCopied ? 'Copied' : run.seedLabel}{run.assisted && <em>assisted</em>}
            </button>
            <button type="button" className="cq-iconbtn text" onClick={() => setSettings({ speed: settings.speed === 3 ? 1 : ((settings.speed + 1) as 2 | 3) })} title="Dealing speed">{settings.speed}×</button>
            <button type="button" className={`cq-iconbtn${settings.sound ? ' on' : ''}`} onClick={() => setSettings({ sound: !settings.sound })} aria-pressed={settings.sound} aria-label="Sound" title="Sound"><Icon name={settings.sound ? 'sound' : 'mute'} size={18} /></button>
            <button type="button" className="cq-iconbtn" onClick={() => setHelp(true)} aria-label="How to play" title="How to play"><Icon name="help" size={18} /></button>
          </div>
        </header>
      )}

      <div className="cq-stage" key={inGame ? `${run.screen}-${run.at}-${run.act}-${run.bossTries}` : view}>
        {view === 'title' && (
          <TitleScreen saved={run} assisted={settings.assisted} setAssisted={(v) => setSettings({ assisted: v })} best={board[0]?.score ?? 0}
            onStart={start} onContinue={() => setView('game')} onHowTo={() => setView('howto')} onBoard={() => setView('board')} />
        )}
        {view === 'howto' && <HowTo onBack={() => setView('title')} />}
        {view === 'board' && (
          <Leaderboard board={board} onBack={() => setView(run && !run.end ? 'title' : run?.end ? 'game' : 'title')} onPlay={(s) => start(s, false)}
            onClear={() => { clearBoard(); setBoard([]); }} />
        )}
        {inGame && (
          <>
            {run.screen === 'map' && <MapView run={run} setRun={setRun} />}
            {run.screen === 'table' && run.table && <CasinoTable run={run} setRun={setRun} speed={settings.speed} />}
            {run.screen === 'reward' && <RewardScreen run={run} setRun={setRun} />}
            {run.screen === 'shop' && <ShopScreen run={run} setRun={setRun} />}
            {run.screen === 'event' && <EventScreen run={run} setRun={setRun} />}
            {run.screen === 'motel' && <MotelScreen run={run} setRun={setRun} />}
            {run.screen === 'act' && <ActScreen run={run} setRun={setRun} />}
            {run.screen === 'retry' && <RetryScreen run={run} setRun={setRun} />}
            {run.screen === 'end' && (
              <EndScreen run={run} rank={rank} board={board} onNew={() => start(null, false)} onReplay={() => start(run.seedLabel, run.daily)}
                onBoard={() => setView('board')} onTitle={() => setView('title')} />
            )}
          </>
        )}
      </div>

      {relic && (
        <div className="cq-modal fixed" role="dialog" aria-modal="true" aria-label={RELICS[relic].name} onClick={() => setRelic(null)}>
          <div onClick={(e) => e.stopPropagation()}><RelicCard id={relic} /><button type="button" className="cq-btn ghost small cq-close" onClick={() => setRelic(null)}>Close</button></div>
        </div>
      )}
      {help && (
        <div className="cq-modal fixed scroll" role="dialog" aria-modal="true" aria-label="How to play">
          <div className="cq-modal-sheet"><HowTo onBack={() => setHelp(false)} /></div>
        </div>
      )}
    </div>
  );
}
