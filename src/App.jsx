import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stockfish } from './engine.js';
import { Piece } from './pieces.jsx';
import { canStep, interactiveBoard, moveRows, stepPly } from './navigation.js';
import {
  SAMPLE_PGN,
  START_PLY,
  buildReviewMove,
  chanceAtPly,
  chartPoints,
  formatEvaluation,
  plyLabel,
  readPgn,
  selectPlyView,
  summarize,
  terminalEvaluation,
  withReviewMove,
} from './review.js';

const PLAYBACK_MS = 900;

export function Board({ view, caption }) {
  return <div className="board" role="group" aria-label={caption}>
    {view.squares.map((square) => <div
      key={square.square}
      className={[
        'square',
        square.dark ? 'dark' : 'light',
        square.isLastFrom || square.isLastTo ? 'last' : '',
        square.isSuggestionFrom || square.isSuggestionTo ? 'suggested' : '',
      ].filter(Boolean).join(' ')}
    >
      {square.rankLabel && <span className="rank">{square.rankLabel}</span>}
      {square.fileLabel && <span className="file">{square.fileLabel}</span>}
      {square.piece && <Piece type={square.piece.type} color={square.piece.color} />}
    </div>)}
  </div>;
}

export function EvaluationBar({ value, orientation }) {
  const white = value === null ? 50 : Math.max(3, Math.min(97, value));
  const fill = <div style={{ height: `${white}%` }} />;
  return <div className={`eval-bar ${orientation === 'b' ? 'flipped' : ''}`} title={value === null ? '這一手尚未分析' : `白方期望得分 ${value.toFixed(1)}%`}>{fill}</div>;
}

export function Chart({ points, activePly, onPick }) {
  if (!points.length) return <div className="chart-empty">完成分析後，這裡會顯示白方勝率走勢。</div>;
  const width = 700, height = 160, pad = 9;
  const coords = points.map((point, index) => ({
    x: pad + (index / Math.max(1, points.length - 1)) * (width - pad * 2),
    y: height - pad - (point.whiteWinChance / 100) * (height - pad * 2),
  }));
  const area = `${coords.map(({ x, y }) => `${x},${y}`).join(' ')} ${coords.at(-1).x},${height} ${coords[0].x},${height}`;
  return <div className="chart-wrap"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="白方勝率趨勢，點選節點可跳到該局面">
    <polygon points={area} className="trend-area" />
    <line x1="0" x2={width} y1={height / 2} y2={height / 2} className="midline" />
    <polyline points={coords.map(({ x, y }) => `${x},${y}`).join(' ')} className="trend" />
    {points.map((point, index) => <circle
      key={point.ply}
      cx={coords[index].x}
      cy={coords[index].y}
      r={activePly === point.ply ? 5.5 : 3}
      className={`dot ${point.tone}`}
      tabIndex={0}
      role="button"
      aria-label={`${point.label}，白方 ${point.whiteWinChance.toFixed(0)}%`}
      onClick={() => onPick(point.ply)}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onPick(point.ply); } }}
    ><title>{`${point.label} · 白方 ${point.whiteWinChance.toFixed(0)}%`}</title></circle>)}
  </svg><div className="chart-legend"><span>黑方優勢</span><span>均勢</span><span>白方優勢</span></div></div>;
}

export function MoveCell({ cell, selectedPly, onSelect }) {
  if (!cell) return <span className="move-cell empty">—</span>;
  const { move, analysis } = cell;
  return <button
    className={`move-cell ${selectedPly === move.ply ? 'active' : ''} ${analysis ? analysis.classification.tone : 'pending'}`}
    onClick={() => onSelect(move.ply)}
    aria-current={selectedPly === move.ply}
    title={analysis ? `${analysis.classification.label} · 白方 ${analysis.whiteWinChance.toFixed(0)}%` : '尚未分析'}
  >
    <b>{move.san}</b>
    {analysis && <em className={analysis.classification.tone}>{analysis.classification.label}</em>}
  </button>;
}

export default function App() {
  const engine = useRef(new Stockfish());
  const analysisRun = useRef(null);
  const [pgn, setPgn] = useState(SAMPLE_PGN);
  const [game, setGame] = useState(null);
  // Analysis state is keyed by ply, so an unanalysed position stays selectable.
  const [analysisByPly, setAnalysisByPly] = useState({});
  // The single source of truth shared by board, chart, move list and panel.
  const [selectedPly, setSelectedPly] = useState(START_PLY);
  const [variationIndex, setVariationIndex] = useState(null);
  const [orientation, setOrientation] = useState('w');
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('貼上棋譜後開始本機分析');
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [depth, setDepth] = useState(13);

  // Every interaction goes through here, so no component keeps its own board.
  const selectPly = useCallback((ply) => {
    setSelectedPly(ply);
    setVariationIndex(null);
  }, []);

  useEffect(() => () => {
    analysisRun.current?.controller.abort();
    engine.current.stop();
  }, []);

  useEffect(() => {
    if (!playing || !game) return undefined;
    if (selectedPly >= game.lastPly) { setPlaying(false); return undefined; }
    const timer = setTimeout(() => selectPly(stepPly(game, selectedPly, 1)), PLAYBACK_MS);
    return () => clearTimeout(timer);
  }, [playing, game, selectedPly, selectPly]);

  useEffect(() => {
    if (!game) return undefined;
    function onKey(event) {
      if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
      if (event.key === 'ArrowLeft') { setPlaying(false); selectPly(stepPly(game, selectedPly, -1)); }
      else if (event.key === 'ArrowRight') { setPlaying(false); selectPly(stepPly(game, selectedPly, 1)); }
      else if (event.key === 'Home') { setPlaying(false); selectPly(START_PLY); }
      else if (event.key === 'End') { setPlaying(false); selectPly(game.lastPly); }
      else return;
      event.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game, selectedPly, selectPly]);

  async function analyseGame() {
    analysisRun.current?.controller.abort();
    const run = { id: crypto.randomUUID(), controller: new AbortController() };
    analysisRun.current = run;
    setError('');
    setAnalysisByPly({});
    setPlaying(false);
    selectPly(START_PLY);
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
        setAnalysisByPly((previous) => withReviewMove(previous, buildReviewMove({ move, best, after })));
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
  const plyView = selectPlyView(game, analysisByPly, selectedPly);
  const board = useMemo(
    () => interactiveBoard(game, analysisByPly, { selectedPly: plyView.selectedPly, orientation, variationIndex }),
    [game, analysisByPly, plyView.selectedPly, orientation, variationIndex],
  );
  const current = plyView.analysis;
  const points = useMemo(() => chartPoints(game, analysisByPly), [game, analysisByPly]);
  const summary = useMemo(() => summarize(analysisByPly), [analysisByPly]);
  const rows = useMemo(() => moveRows(game, analysisByPly), [game, analysisByPly]);
  const variation = board.variation;

  return <main>
    <section className="hero"><div><p className="eyebrow">LOCAL · PRIVATE · STOCKFISH 19</p><h1>棋見<span>。</span></h1><p className="tagline">把每一步下得更明白。</p></div><div className="privacy"><span>⌁</span><p><strong>完全本地運算</strong><br />棋譜與分析不會離開你的電腦</p></div></section>
    <section className="input-card"><div className="input-heading"><div><h2>貼上你的棋譜</h2><p>支援標準 PGN；可包含對局資訊與註解。</p></div><button className="text-button" onClick={() => setPgn(SAMPLE_PGN)}>載入示範棋局</button></div><textarea value={pgn} onChange={(event) => setPgn(event.target.value)} spellCheck="false" aria-label="PGN 棋譜" />
      <div className="actions"><label>分析深度 <select value={depth} onChange={(event) => setDepth(Number(event.target.value))} disabled={!!progress}><option value="10">快速（深度 10）</option><option value="13">平衡（深度 13）</option><option value="16">仔細（深度 16）</option></select></label>{progress ? <button className="cancel" onClick={cancelAnalysis}>取消分析（{progress.current}/{progress.total}）</button> : <button className="analyse" onClick={analyseGame}>開始檢討 →</button>}</div>
      {error && <p className="error">{error}</p>}<p className="status"><i className={progress ? 'pulse' : ''} />{status}</p>
    </section>
    <section className="results">
      <div className="board-card">
        <div className="game-meta"><span>{headers.White ?? '白方'} <b>vs</b> {headers.Black ?? '黑方'}</span><small>{headers.Result ?? '*'}</small></div>
        <div className="board-area">
          <EvaluationBar value={plyView.whiteWinChance} orientation={orientation} />
          <Board view={board.view} caption={variation ? `引擎變例預覽：${variation.san}` : `局面：${plyView.label}`} />
        </div>
        <div className={`board-caption ${variation ? 'variation' : ''}`}>
          {variation
            ? <><b>變例預覽</b><span>引擎建議線第 {variation.index + 1} 步：{variation.san}</span><button className="text-button" onClick={() => setVariationIndex(null)}>回到實戰</button></>
            : <><b>{plyView.isStart ? '初始局面' : plyView.label}</b><span>{plyView.move ? `${plyView.move.color === 'w' ? '白方' : '黑方'}走 · 第 ${plyView.move.fullmove} 回合` : '白方走第一手之前'}</span></>}
        </div>
        {game && <div className="move-nav" role="group" aria-label="棋局回放">
          <button onClick={() => { setPlaying(false); selectPly(START_PLY); }} disabled={!canStep(game, selectedPly, -1)} aria-label="回到初始局面">⏮</button>
          <button onClick={() => { setPlaying(false); selectPly(stepPly(game, selectedPly, -1)); }} disabled={!canStep(game, selectedPly, -1)} aria-label="上一步">◀</button>
          <button className="play" onClick={() => setPlaying(!playing)} disabled={!canStep(game, selectedPly, 1) && !playing} aria-label={playing ? '暫停回放' : '播放回放'}>{playing ? '⏸' : '▶'}</button>
          <button onClick={() => { setPlaying(false); selectPly(stepPly(game, selectedPly, 1)); }} disabled={!canStep(game, selectedPly, 1)} aria-label="下一步">▶</button>
          <button onClick={() => { setPlaying(false); selectPly(game.lastPly); }} disabled={!canStep(game, selectedPly, 1)} aria-label="跳到最後一手">⏭</button>
          <button className="flip" onClick={() => setOrientation(orientation === 'w' ? 'b' : 'w')} aria-label="翻轉棋盤">⇅ {orientation === 'w' ? '白方視角' : '黑方視角'}</button>
        </div>}
      </div>
      <div className="review-card">
        <div className="card-title"><div><p className="eyebrow">ENGINE REVIEW</p><h2>勝率走勢</h2></div>{plyView.whiteWinChance !== null && <div className="chance" title="引擎估計的期望得分，不是實際對局勝率"><b>{plyView.whiteWinChance.toFixed(0)}%</b><span>白方期望得分</span></div>}</div>
        <Chart points={points} activePly={plyView.selectedPly} onPick={selectPly} />
        <p className="honesty">曲線是引擎估計的白方期望得分（勝算 1、和局 0.5），不是實際對局勝率。</p>
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
          <div className="best-line">
            <span>引擎建議</span>
            <b>{current.bestSan}</b>
            <div className="pv">
              {current.pv.moves.length === 0 && <small>—</small>}
              {current.pv.moves.map((move, index) => <button
                key={`${move.uci}-${index}`}
                className={variationIndex === index ? 'active' : ''}
                onClick={() => setVariationIndex(index)}
                title="在棋盤上預覽這一步"
              >{move.san}</button>)}
            </div>
          </div>
          {current.pv.error && <p className="error">{current.pv.error}</p>}
          <p className="honesty">講評僅陳述引擎評估與可驗證的盤面事實；策略性推論尚未啟用。</p>
        </article> : <article className="insight">
          {plyView.isStart && plyView.evaluation ? <>
            <div className="move-head"><span className="badge pending">起始</span><h3>{plyView.label}</h3><strong>{formatEvaluation(plyView.evaluation)}</strong></div>
            <ul className="commentary"><li>這是棋局的起始局面，引擎在第 1 手前的評估為 {formatEvaluation(plyView.evaluation)}（白方視角）。</li></ul>
          </> : <div className="empty-review"><span>♞</span><p>{game ? '這一手還沒分析完成' : '還沒有分析結果'}</p><small>{game ? '分析會依序完成每一個半回合；你仍然可以先瀏覽棋盤。' : '貼上棋譜，開始看懂每一個關鍵轉折。'}</small></div>}
        </article>}
      </div>
    </section>
    {game && <section className="move-list">
      <div className="card-title"><h2>逐步檢討</h2><button className={`text-button ${selectedPly === START_PLY ? 'active' : ''}`} onClick={() => selectPly(START_PLY)}>回到初始局面</button></div>
      <div className="rows">{rows.map((row) => <div className="row" key={`${row.fullmove}-${row.white?.move.ply ?? row.black?.move.ply}`}>
        <span className="number">{row.fullmove}.</span>
        <MoveCell cell={row.white} selectedPly={selectedPly} onSelect={selectPly} />
        <MoveCell cell={row.black} selectedPly={selectedPly} onSelect={selectPly} />
      </div>)}</div>
      <p className="hint">鍵盤：← → 上下一步，Home／End 跳到頭尾。{chanceAtPly(analysisByPly, START_PLY) !== null && ` 初始局面引擎評估：白方 ${chanceAtPly(analysisByPly, START_PLY).toFixed(0)}%。`}</p>
    </section>}
  </main>;
}
