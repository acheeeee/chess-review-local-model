import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Stockfish } from './engine.js';
import {
  SAMPLE_PGN,
  START_PLY,
  analysisAt,
  buildReviewMove,
  chanceAtPly,
  chartPoints,
  clampPly,
  formatEvaluation,
  plyLabel,
  readPgn,
  selectPlyView,
  summarize,
  terminalEvaluation,
  withReviewMove,
} from './review.js';

const PIECES = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚', P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕', K: '♔' };

function Board({ fen, lastMove }) {
  const board = useMemo(() => new Chess(fen).board(), [fen]);
  const last = lastMove ? [lastMove.slice(0, 2), lastMove.slice(2, 4)] : [];
  return <div className="board" aria-label="棋盤">
    {board.flatMap((row, rank) => row.map((piece, file) => {
      const square = `${'abcdefgh'[file]}${8 - rank}`;
      const dark = (rank + file) % 2 === 1;
      return <div className={`square ${dark ? 'dark' : 'light'} ${last.includes(square) ? 'last' : ''}`} key={square}>
        {file === 0 && <span className="rank">{8 - rank}</span>}
        {rank === 7 && <span className="file">{'abcdefgh'[file]}</span>}
        <span className={`piece ${piece?.color === 'w' ? 'white' : 'black'}`}>{piece ? PIECES[piece.color === 'w' ? piece.type.toUpperCase() : piece.type] : ''}</span>
      </div>;
    }))}
  </div>;
}

function EvaluationBar({ value }) {
  const white = Math.max(3, Math.min(97, value ?? 50));
  return <div className="eval-bar" title={value === null ? '尚未分析' : `白方期望得分 ${value.toFixed(1)}%`}><div style={{ height: `${white}%` }} /></div>;
}

function Chart({ points, activePly, onPick }) {
  if (!points.length) return <div className="chart-empty">完成分析後，這裡會顯示白方勝率走勢。</div>;
  const width = 700, height = 160, pad = 9;
  const coords = points.map((point, index) => ({
    x: pad + (index / Math.max(1, points.length - 1)) * (width - pad * 2),
    y: height - pad - (point.whiteWinChance / 100) * (height - pad * 2),
  }));
  return <div className="chart-wrap"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="白方勝率趨勢">
    <line x1="0" x2={width} y1={height / 2} y2={height / 2} className="midline" />
    <polyline points={coords.map(({ x, y }) => `${x},${y}`).join(' ')} className="trend" />
    {points.map((point, index) => <circle
      key={point.ply}
      cx={coords[index].x}
      cy={coords[index].y}
      r={activePly === point.ply ? 5 : 3}
      className={`dot ${point.tone}`}
      onClick={() => onPick(point.ply)}
    ><title>{`${point.label} · ${point.whiteWinChance.toFixed(0)}%`}</title></circle>)}
  </svg><div className="chart-legend"><span>黑方優勢</span><span>均勢</span><span>白方優勢</span></div></div>;
}

export default function App() {
  const engine = useRef(new Stockfish());
  const analysisRun = useRef(null);
  const [pgn, setPgn] = useState(SAMPLE_PGN);
  const [game, setGame] = useState(null);
  // Analysis state is keyed by ply, so an unanalysed position stays selectable.
  const [analysisByPly, setAnalysisByPly] = useState({});
  const [selectedPly, setSelectedPly] = useState(START_PLY);
  const [status, setStatus] = useState('貼上棋譜後開始本機分析');
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [depth, setDepth] = useState(13);

  useEffect(() => () => {
    analysisRun.current?.controller.abort();
    engine.current.stop();
  }, []);

  async function analyseGame() {
    analysisRun.current?.controller.abort();
    const run = { id: crypto.randomUUID(), controller: new AbortController() };
    analysisRun.current = run;
    setError('');
    setAnalysisByPly({});
    setSelectedPly(START_PLY);
    let parsed;
    try { parsed = readPgn(pgn); }
    catch (reason) { setGame(null); setError(reason.message); return; }
    setGame(parsed);
    try {
      setStatus('正在載入本機 Stockfish 引擎…');
      await engine.current.start();
      for (const move of parsed.moves) {
        if (run.controller.signal.aborted) throw new DOMException('分析已取消', 'AbortError');
        setProgress({ current: move.ply, total: parsed.lastPly });
        setStatus(`分析第 ${move.fullmove} 回合：${move.san}`);
        const best = await engine.current.analyse(move.beforeFen, { depth, signal: run.controller.signal });
        const terminal = terminalEvaluation(move.afterFen);
        const after = terminal ?? await engine.current.analyse(move.afterFen, { depth, signal: run.controller.signal });
        if (run.controller.signal.aborted || analysisRun.current?.id !== run.id) return;
        const reviewMove = buildReviewMove({ move, best, after });
        setAnalysisByPly((previous) => withReviewMove(previous, reviewMove));
      }
      if (analysisRun.current?.id === run.id) setStatus('分析完成：所有計算均在此裝置的瀏覽器內進行。');
    } catch (reason) {
      if (analysisRun.current?.id !== run.id) return;
      if (reason?.name === 'AbortError') setStatus('已取消分析。你可以調整棋譜或設定後重新開始。');
      else {
        setError(reason.message || '分析中斷，請重新嘗試。');
        setStatus('分析未完成');
      }
    } finally {
      if (analysisRun.current?.id === run.id) {
        setProgress(null);
        analysisRun.current = null;
      }
    }
  }

  function cancelAnalysis() { analysisRun.current?.controller.abort(); }

  const headers = game?.headers ?? {};
  const view = selectPlyView(game, analysisByPly, selectedPly);
  const current = view.analysis;
  const points = useMemo(() => chartPoints(game, analysisByPly), [game, analysisByPly]);
  const summary = useMemo(() => summarize(analysisByPly), [analysisByPly]);

  return <main>
    <section className="hero"><div><p className="eyebrow">LOCAL · PRIVATE · STOCKFISH 19</p><h1>棋見<span>。</span></h1><p className="tagline">把每一步下得更明白。</p></div><div className="privacy"><span>⌁</span><p><strong>完全本地運算</strong><br />棋譜與分析不會離開你的電腦</p></div></section>
    <section className="input-card"><div className="input-heading"><div><h2>貼上你的棋譜</h2><p>支援標準 PGN；可包含對局資訊與註解。</p></div><button className="text-button" onClick={() => setPgn(SAMPLE_PGN)}>載入示範棋局</button></div><textarea value={pgn} onChange={(event) => setPgn(event.target.value)} spellCheck="false" aria-label="PGN 棋譜" />
      <div className="actions"><label>分析深度 <select value={depth} onChange={(event) => setDepth(Number(event.target.value))} disabled={!!progress}><option value="10">快速（深度 10）</option><option value="13">平衡（深度 13）</option><option value="16">仔細（深度 16）</option></select></label>{progress ? <button className="cancel" onClick={cancelAnalysis}>取消分析（{progress.current}/{progress.total}）</button> : <button className="analyse" onClick={analyseGame}>開始檢討 →</button>}</div>
      {error && <p className="error">{error}</p>}<p className="status"><i className={progress ? 'pulse' : ''} />{status}</p>
    </section>
    <section className="results">
      <div className="board-card"><div className="game-meta"><span>{headers.White ?? '白方'} <b>vs</b> {headers.Black ?? '黑方'}</span><small>{headers.Result ?? '*'}</small></div><div className="board-area"><EvaluationBar value={view.whiteWinChance} /><Board fen={view.fen} lastMove={view.lastMoveUci} /></div>
        {game && <div className="move-nav">
          <button onClick={() => setSelectedPly(clampPly(game, selectedPly - 1))} disabled={view.isStart} aria-label="上一步">←</button>
          <span>{view.move ? `第 ${view.move.fullmove} 回合 · ${view.move.color === 'w' ? '白方' : '黑方'}走` : '初始局面（還沒走第一步）'}</span>
          <button onClick={() => setSelectedPly(clampPly(game, selectedPly + 1))} disabled={view.isLast} aria-label="下一步">→</button>
        </div>}
      </div>
      <div className="review-card"><div className="card-title"><div><p className="eyebrow">ENGINE REVIEW</p><h2>勝率走勢</h2></div>{view.whiteWinChance !== null && <div className="chance"><b>{view.whiteWinChance.toFixed(0)}%</b><span>白方期望得分（引擎估計）</span></div>}</div><Chart points={points} activePly={view.selectedPly} onPick={setSelectedPly} />
        {summary.analysed > 0 && <div className="summary">
          <span><b>{summary.byTone.blunder}</b> 大失誤</span>
          <span><b>{summary.byTone.mistake}</b> 失誤</span>
          <span><b>{summary.byTone.best}</b> 最佳著</span>
          <span><b>{(summary.byColor.w.averageLossCp ?? 0).toFixed(0)}</b> 白方平均失分 cp</span>
          <span><b>{(summary.byColor.b.averageLossCp ?? 0).toFixed(0)}</b> 黑方平均失分 cp</span>
        </div>}
        {current ? <article className="insight">
          <div className="move-head"><span className={`badge ${current.classification.tone}`}>{current.classification.label}</span><h3>{plyLabel(game, current.ply)}</h3><strong>{formatEvaluation(current.actual)}</strong></div>
          <ul className="commentary">{current.commentary.confirmed.map((line) => <li key={line}>{line}</li>)}</ul>
          {current.commentary.inferred.length > 0 && <ul className="commentary inferred">{current.commentary.inferred.map((line) => <li key={line}>{line}（推論）</li>)}</ul>}
          <div className="best-line"><span>引擎建議</span><b>{current.bestSan}</b><small>{current.pv.moves.map((move) => move.san).join(' · ') || '—'}</small></div>
          {current.pv.error && <p className="error">{current.pv.error}</p>}
        </article> : <article className="insight">
          {view.isStart && view.evaluation ? <>
            <div className="move-head"><span className="badge pending">起始</span><h3>{view.label}</h3><strong>{formatEvaluation(view.evaluation)}</strong></div>
            <ul className="commentary"><li>這是棋局的起始局面，引擎在第 1 手前的評估為 {formatEvaluation(view.evaluation)}（白方視角）。</li></ul>
          </> : <div className="empty-review"><span>♞</span><p>{game ? '這一手還沒分析完成' : '還沒有分析結果'}</p><small>{game ? '分析會依序完成每一個半回合。' : '貼上棋譜，開始看懂每一個關鍵轉折。'}</small></div>}
        </article>}
      </div>
    </section>
    {game && <section className="move-list"><h2>逐步檢討</h2><div>
      <button onClick={() => setSelectedPly(START_PLY)} className={selectedPly === START_PLY ? 'active' : ''}><span>0.</span><b>初始局面</b><em className="pending">起始</em><small>{chanceAtPly(analysisByPly, START_PLY) === null ? '—' : `白方 ${chanceAtPly(analysisByPly, START_PLY).toFixed(0)}%`}</small></button>
      {game.moves.map((move) => {
        const analysis = analysisAt(analysisByPly, move.ply);
        return <button key={move.ply} onClick={() => setSelectedPly(move.ply)} className={selectedPly === move.ply ? 'active' : ''}>
          <span>{move.fullmove}{move.color === 'w' ? '.' : '...'}</span>
          <b>{move.san}</b>
          <em className={analysis ? analysis.classification.tone : 'pending'}>{analysis ? analysis.classification.label : '待分析'}</em>
          <small>{analysis ? `白方 ${analysis.whiteWinChance.toFixed(0)}%` : '—'}</small>
        </button>;
      })}
    </div></section>}
  </main>;
}
