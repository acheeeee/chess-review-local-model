import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Stockfish } from './engine.js';
import { SAMPLE_PGN, classify, makeInsight, moveFromUci, readPgn, scoreToWhiteCp, whiteWinChance } from './review.js';

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
  const white = Math.max(3, Math.min(97, value));
  return <div className="eval-bar" title={`白方勝率 ${value.toFixed(1)}%`}><div style={{ height: `${white}%` }} /></div>;
}

function Chart({ items, active, onPick }) {
  if (!items.length) return <div className="chart-empty">完成分析後，這裡會顯示白方勝率走勢。</div>;
  const width = 700, height = 160, pad = 9;
  const points = items.map((item, index) => {
    const x = pad + (index / Math.max(1, items.length - 1)) * (width - pad * 2);
    const y = height - pad - (item.whiteChance / 100) * (height - pad * 2);
    return `${x},${y}`;
  }).join(' ');
  return <div className="chart-wrap"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="白方勝率趨勢">
    <line x1="0" x2={width} y1={height / 2} y2={height / 2} className="midline" />
    <polyline points={points} className="trend" />
    {items.map((item, index) => {
      const [x, y] = points.split(' ')[index].split(',');
      return <circle key={item.ply} cx={x} cy={y} r={active === index ? 5 : 3} className={`dot ${item.classification.tone}`} onClick={() => onPick(index)} />;
    })}
  </svg><div className="chart-legend"><span>黑方優勢</span><span>均勢</span><span>白方優勢</span></div></div>;
}

export default function App() {
  const engine = useRef(new Stockfish());
  const [pgn, setPgn] = useState(SAMPLE_PGN);
  const [review, setReview] = useState([]);
  const [headers, setHeaders] = useState({});
  const [selected, setSelected] = useState(0);
  const [status, setStatus] = useState('貼上棋譜後開始本機分析');
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [depth, setDepth] = useState(13);

  useEffect(() => () => engine.current.stop(), []);

  async function analyseGame() {
    setError(''); setReview([]); setSelected(0);
    let game;
    try { game = readPgn(pgn); }
    catch (reason) { setError(reason.message); return; }
    setHeaders(game.headers);
    try {
      setStatus('正在載入本機 Stockfish 引擎…');
      await engine.current.start();
      const analysed = [];
      for (let index = 0; index < game.moves.length; index += 1) {
        const move = game.moves[index];
        setProgress({ current: index + 1, total: game.moves.length });
        setStatus(`分析第 ${Math.floor(index / 2) + 1} 回合：${move.san}`);
        const [best, played] = await Promise.all([
          engine.current.analyse(move.before, depth),
          // Engine searches are serial; this call starts after the first result by design.
        ].filter(Boolean));
        const actual = await engine.current.analyse(move.after, depth);
        const bestWhiteCp = scoreToWhiteCp(best);
        const afterWhiteCp = scoreToWhiteCp(actual);
        const playerScore = move.color === 'w' ? afterWhiteCp : -afterWhiteCp;
        const playerBest = move.color === 'w' ? bestWhiteCp : -bestWhiteCp;
        const loss = Math.max(0, playerBest - playerScore);
        const item = { ply: index + 1, fullmove: Math.floor(index / 2) + 1, color: move.color, san: move.san, uci: move.lan, before: move.before, after: move.after, bestSan: moveFromUci(move.before, best.bestMove), bestLine: best.pv.slice(0, 6).map((uci, i) => i === 0 ? moveFromUci(move.before, uci) : uci).join(' · '), bestWhiteCp, afterWhiteCp, whiteChance: whiteWinChance(afterWhiteCp), loss, classification: classify(loss) };
        item.insight = makeInsight(item);
        analysed.push(item);
        setReview([...analysed]);
      }
      setStatus('分析完成：所有計算均在此裝置的瀏覽器內進行。');
    } catch (reason) {
      setError(reason.message || '分析中斷，請重新嘗試。');
      setStatus('分析未完成');
    } finally { setProgress(null); }
  }

  const current = review[selected];
  const shownFen = current?.after ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const counts = review.reduce((all, item) => ({ ...all, [item.classification.tone]: (all[item.classification.tone] ?? 0) + 1 }), {});

  return <main>
    <section className="hero"><div><p className="eyebrow">LOCAL · PRIVATE · STOCKFISH 19</p><h1>棋見<span>。</span></h1><p className="tagline">把每一步下得更明白。</p></div><div className="privacy"><span>⌁</span><p><strong>完全本地運算</strong><br />棋譜與分析不會離開你的電腦</p></div></section>
    <section className="input-card"><div className="input-heading"><div><h2>貼上你的棋譜</h2><p>支援標準 PGN；可包含對局資訊與註解。</p></div><button className="text-button" onClick={() => setPgn(SAMPLE_PGN)}>載入示範棋局</button></div><textarea value={pgn} onChange={(event) => setPgn(event.target.value)} spellCheck="false" aria-label="PGN 棋譜" />
      <div className="actions"><label>分析深度 <select value={depth} onChange={(event) => setDepth(Number(event.target.value))}><option value="10">快速（深度 10）</option><option value="13">平衡（深度 13）</option><option value="16">仔細（深度 16）</option></select></label><button className="analyse" onClick={analyseGame} disabled={!!progress}> {progress ? `分析中 ${progress.current}/${progress.total}` : '開始檢討 →'} </button></div>
      {error && <p className="error">{error}</p>}<p className="status"><i className={progress ? 'pulse' : ''} />{status}</p>
    </section>
    <section className="results">
      <div className="board-card"><div className="game-meta"><span>{headers.White ?? '白方'} <b>vs</b> {headers.Black ?? '黑方'}</span><small>{headers.Result ?? '*'}</small></div><div className="board-area"><EvaluationBar value={current?.whiteChance ?? 50} /><Board fen={shownFen} lastMove={current?.uci} /></div>{current && <div className="move-nav"><button onClick={() => setSelected(Math.max(0, selected - 1))} disabled={selected === 0}>←</button><span>第 {current.fullmove} 回合 · {current.color === 'w' ? '白方' : '黑方'}走</span><button onClick={() => setSelected(Math.min(review.length - 1, selected + 1))} disabled={selected === review.length - 1}>→</button></div>}</div>
      <div className="review-card"><div className="card-title"><div><p className="eyebrow">ENGINE REVIEW</p><h2>勝率走勢</h2></div>{current && <div className="chance"><b>{current.whiteChance.toFixed(0)}%</b><span>白方勝率</span></div>}</div><Chart items={review} active={selected} onPick={setSelected} />
        {review.length > 0 && <div className="summary"><span><b>{counts.blunder ?? 0}</b> 大失誤</span><span><b>{counts.mistake ?? 0}</b> 失誤</span><span><b>{counts.best ?? 0}</b> 最佳著</span></div>}
        {current ? <article className="insight"><div className="move-head"><span className={`badge ${current.classification.tone}`}>{current.classification.label}</span><h3>{current.fullmove}{current.color === 'w' ? '.' : '...'} {current.san}</h3><strong>{current.afterWhiteCp >= 0 ? '+' : ''}{(current.afterWhiteCp / 100).toFixed(2)}</strong></div><p>{current.insight}</p><div className="best-line"><span>引擎建議</span><b>{current.bestSan}</b><small>{current.bestLine}</small></div></article> : <div className="empty-review"><span>♞</span><p>還沒有分析結果</p><small>貼上棋譜，開始看懂每一個關鍵轉折。</small></div>}
      </div>
    </section>
    {review.length > 0 && <section className="move-list"><h2>逐步檢討</h2><div>{review.map((item, index) => <button key={item.ply} onClick={() => setSelected(index)} className={selected === index ? 'active' : ''}><span>{item.fullmove}{item.color === 'w' ? '.' : '...'}</span><b>{item.san}</b><em className={item.classification.tone}>{item.classification.label}</em><small>白方 {item.whiteChance.toFixed(0)}%</small></button>)}</div></section>}
  </main>;
}
