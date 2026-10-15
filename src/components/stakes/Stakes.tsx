// Twenty-One Stakes: the game shell (title, run screens, saving, sound, the swirling background)
import { useEffect, useRef, useState, type ReactNode } from 'react';
import '../../stakes/stakes.css';
import { BOSSES } from '../../stakes/data';
import { randomSeedCode, type RunState } from '../../stakes/engine';
import { clearBoard, loadBoard, loadRun, loadSettings, newRun, rankEntries, recordRun, saveRun, saveSettings, type BoardEntry, type StakesSettings } from '../../stakes/run';
import { stakesSound } from '../../stakes/audio';
import { Swirl } from './Swirl';
import { Sidebar, StakesUI } from './Panels';
import { TableScreen } from './Table';
import { Board, Cashout, End, HowTo, Options, Pack, RunInfo, Select, Shop, Title, Won } from './Screens';

type View = 'title' | 'game' | 'board';

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0');
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}
function paletteFor(view: View, run: RunState | null): [string, string, string] {
  if (view !== 'game' || !run) return ['#1b1f4a', '#3b2d7a', '#8a2f6a'];
  if (run.screen === 'end') return run.end?.won ? ['#3d2a08', '#b8862b', '#6a2f8a'] : ['#33080f', '#8a2234', '#3b1550'];
  if (run.screen === 'won') return ['#3d2a08', '#c9962f', '#2f6a8a'];
  const t = run.table;
  if (t?.boss) { const c = BOSSES[t.boss].color; return [shade(c, 0.22), shade(c, 0.6), '#2a1a4a']; }
  if (t?.stage === 'high') return ['#0f1d4a', '#2a55c0', '#167a80'];
  if (t) return ['#0b2f22', '#1d7048', '#22507a'];
  if (run.screen === 'shop' || run.screen === 'pack') return ['#14303a', '#2a6a64', '#5a3a8a'];
  return ['#13283a', '#24566a', '#4a3a7a'];
}

export default function Stakes() {
  const [settings, setSettingsState] = useState<StakesSettings>(loadSettings);
  const [run, setRunState] = useState<RunState | null>(loadRun);
  const [view, setView] = useState<View>('title');
  const [board, setBoard] = useState<BoardEntry[]>(loadBoard);
  const [rank, setRank] = useState(0);
  const [modal, setModal] = useState<'info' | 'options' | 'howto' | null>(null);
  const recorded = useRef<number | null>(null);

  const setSettings = (p: Partial<StakesSettings>) => setSettingsState((s) => { const n = { ...s, ...p }; saveSettings(n); return n; });
  const setRun = (fn: (r: RunState) => RunState) => setRunState((r) => (r ? fn(r) : r));

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

  useEffect(() => {
    if (document.getElementById('sk-fonts')) return;
    const l = document.createElement('link');
    l.id = 'sk-fonts';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Jersey+15&display=swap';
    document.head.appendChild(l);
  }, []);

  useEffect(() => { stakesSound.set(settings.sound, settings.music); return () => stakesSound.set(false, false); }, [settings.sound, settings.music]);

  useEffect(() => {
    if (!modal) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setModal(null); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [modal]);

  const start = (seed: string | null, daily: boolean) => {
    if (run && !run.end && run.stats.tablesWon > 0 && !confirm('Abandon your current run? It goes on the high scores as it stands.')) return;
    if (run && !run.end && run.stats.tablesWon > 0) { recordRun({ ...run, end: { won: false, reason: 'Walked away mid-run.' } }); setBoard(loadBoard()); }
    setRunState(newRun(seed ?? randomSeedCode(), daily));
    setRank(0);
    setView('game');
    if (!settings.seenHowTo) { setModal('howto'); setSettings({ seenHowTo: true }); }
    stakesSound.play('buy');
  };

  const inGame = view === 'game' && !!run;
  const best = [...board].sort(rankEntries)[0] ?? null;
  const ui = { openInfo: () => setModal('info'), openOptions: () => setModal('options') };

  let body: ReactNode = null;
  if (view === 'title') body = <Title saved={run} best={best} onStart={start} onContinue={() => setView('game')} onBoard={() => setView('board')} onHowTo={() => setModal('howto')} />;
  else if (view === 'board') body = <Board board={board} onBack={() => setView(run?.end ? 'game' : 'title')} onPlay={(s) => start(s, false)} onClear={() => { clearBoard(); setBoard([]); }} />;
  else if (run) {
    if (run.screen === 'table' && run.table) body = <TableScreen run={run} setRun={setRun} speed={settings.speed} />;
    else if (run.screen === 'end') body = <End run={run} rank={rank} onNew={() => start(null, false)} onReplay={() => start(run.seedLabel, run.daily)} onBoard={() => setView('board')} onTitle={() => setView('title')} />;
    else body = (
      <div className="sk-game">
        <Sidebar run={run} />
        <main className="sk-main">
          {run.screen === 'select' && <Select run={run} setRun={setRun} />}
          {run.screen === 'cashout' && run.cashout && <Cashout run={run} setRun={setRun} />}
          {run.screen === 'shop' && run.shop && <Shop run={run} setRun={setRun} />}
          {run.screen === 'pack' && run.pack && <Pack run={run} setRun={setRun} />}
          {run.screen === 'won' && <Won run={run} setRun={setRun} />}
        </main>
      </div>
    );
  }

  return (
    <StakesUI.Provider value={ui}>
      <div className={`sk${inGame ? ` scr-${run.screen}` : ` v-${view}`}`}>
        <Swirl palette={paletteFor(view, run)} />
        <div className="sk-crt" aria-hidden="true" />
        <div className="sk-stage" key={inGame ? `${run.screen}-${run.ante}-${run.stage}` : view}>{body}</div>
        {modal === 'info' && run && <RunInfo run={run} onClose={() => setModal(null)} />}
        {modal === 'options' && <Options settings={settings} setSettings={setSettings} inRun={inGame} onClose={() => setModal(null)} onQuit={() => { setModal(null); setView('title'); }} />}
        {modal === 'howto' && <HowTo onClose={() => setModal(null)} />}
        {view === 'title' && (
          <button type="button" className="sk-sound" onClick={() => setSettings({ sound: !settings.sound })} aria-pressed={settings.sound}>{settings.sound ? '🔊' : '🔇'} Sound</button>
        )}
      </div>
    </StakesUI.Provider>
  );
}
