/**
 * Static visual preview of the review UI.
 *
 * It renders the real components with synthetic engine results, so the board,
 * piece set, highlights, move list and variation panel can be checked without
 * waiting for a full local Stockfish run. No engine, no network, no PGN of a
 * real person. Output: `preview/review-ui.html` (git-ignored).
 */
import { renderToString } from 'react-dom/server';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Board, Chart, EvaluationBar, MoveCell } from '../src/App.jsx';
import { interactiveBoard, moveRows } from '../src/navigation.js';
import { buildReviewMove, chartPoints, plyLabel, readPgn, summarize, withReviewMove } from '../src/review.js';

const PGN = `[White "Anna"]
[Black "Bo"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 1-0`;

// White-perspective centipawns before each move, chosen so the preview shows
// every classification colour (best → blunder) in one screen.
const WHITE_CP = [30, 25, 35, 30, 60, 50, 70, 40, 90, 40, 95, 60, 90, 40, 320, 300, 330, 60, 220, 300, 340];
const SELECTED_PLY = 14;

const game = readPgn(PGN);
const engineResult = (cp, pv, bestMove) => ({ depth: 13, cp, mate: null, wdl: null, pv, bestMove });

let analysisByPly = {};
game.moves.forEach((move, index) => {
  const sideSign = move.color === 'w' ? 1 : -1;
  const before = WHITE_CP[index] ?? 0;
  const after = WHITE_CP[index + 1] ?? before;
  const line = [move.uci, game.moves[index + 1]?.uci, game.moves[index + 2]?.uci].filter(Boolean);
  analysisByPly = withReviewMove(analysisByPly, buildReviewMove({
    move,
    best: engineResult(before * sideSign, line, move.uci),
    after: engineResult(-after * sideSign, [], '(none)'),
  }));
});

const played = interactiveBoard(game, analysisByPly, { selectedPly: SELECTED_PLY, orientation: 'w', variationIndex: null });
const preview = interactiveBoard(game, analysisByPly, { selectedPly: SELECTED_PLY, orientation: 'b', variationIndex: 0 });
const current = analysisByPly[SELECTED_PLY];
const summary = summarize(analysisByPly);
const rows = moveRows(game, analysisByPly);
const points = chartPoints(game, analysisByPly);

const html = renderToString(<main>
  <section className="results">
    <div className="board-card">
      <div className="game-meta"><span>{game.headers.White} <b>vs</b> {game.headers.Black}</span><small>{game.headers.Result}</small></div>
      <div className="board-area"><EvaluationBar value={current.whiteWinChance} orientation="w" /><Board view={played.view} caption="實戰局面" /></div>
      <div className="board-caption"><b>{plyLabel(game, SELECTED_PLY)}</b><span>{current.color === 'w' ? '白方' : '黑方'}走 · 第 {current.fullmove} 回合</span></div>
      <div className="move-nav"><button>⏮</button><button>◀</button><button className="play">▶</button><button>▶</button><button>⏭</button><button className="flip">⇅ 白方視角</button></div>
    </div>
    <div className="review-card">
      <div className="card-title"><div><p className="eyebrow">ENGINE REVIEW</p><h2>勝率走勢</h2></div><div className="chance"><b>{current.whiteWinChance.toFixed(0)}%</b><span>白方期望得分</span></div></div>
      <Chart points={points} activePly={SELECTED_PLY} onPick={() => {}} />
      <p className="honesty">曲線是引擎估計的白方期望得分（勝算 1、和局 0.5），不是實際對局勝率。</p>
      <div className="summary">
        <span><b>{summary.byTone.blunder}</b> 大失誤</span>
        <span><b>{summary.byTone.mistake}</b> 失誤</span>
        <span><b>{summary.byTone.best}</b> 最佳著</span>
        <span><b>{(summary.byColor.w.averageLossCp ?? 0).toFixed(0)}</b> 白方平均失分 cp</span>
        <span><b>{(summary.byColor.b.averageLossCp ?? 0).toFixed(0)}</b> 黑方平均失分 cp</span>
      </div>
      <article className="insight">
        <div className="move-head"><span className={`badge ${current.classification.tone}`}>{current.classification.label}</span><h3>{plyLabel(game, SELECTED_PLY)}</h3><strong>{current.afterWhiteCp === null ? '—' : `${current.afterWhiteCp >= 0 ? '+' : ''}${(current.afterWhiteCp / 100).toFixed(2)}`}</strong></div>
        <ul className="commentary">{current.commentary.confirmed.map((line) => <li key={line}>{line}</li>)}</ul>
        <div className="best-line"><span>引擎建議</span><b>{current.bestSan}</b><div className="pv">{current.pv.moves.map((move, index) => <button key={`${move.uci}-${index}`} className={index === 0 ? 'active' : ''}>{move.san}</button>)}</div></div>
        <p className="honesty">講評僅陳述引擎評估與可驗證的盤面事實；策略性推論尚未啟用。</p>
      </article>
    </div>
  </section>
  <section className="results" style={{ marginTop: '22px' }}>
    <div className="board-card">
      <div className="game-meta"><span>變例預覽 · 黑方視角</span><small>翻轉</small></div>
      <div className="board-area"><EvaluationBar value={current.whiteWinChance} orientation="b" /><Board view={preview.view} caption="引擎變例" /></div>
      <div className="board-caption variation"><b>變例預覽</b><span>引擎建議線第 1 步：{preview.variation.san}</span><button className="text-button">回到實戰</button></div>
    </div>
    <div className="move-list">
      <div className="card-title"><h2>逐步檢討</h2><button className="text-button">回到初始局面</button></div>
      <div className="rows">{rows.map((row) => <div className="row" key={row.fullmove}>
        <span className="number">{row.fullmove}.</span>
        <MoveCell cell={row.white} selectedPly={SELECTED_PLY} onSelect={() => {}} />
        <MoveCell cell={row.black} selectedPly={SELECTED_PLY} onSelect={() => {}} />
      </div>)}</div>
      <p className="hint">鍵盤：← → 上下一步，Home／End 跳到頭尾。</p>
    </div>
  </section>
</main>);

// The external font import is dropped so the preview renders fully offline.
const css = readFileSync('src/styles.css', 'utf8').replace(/@import url\([^)]*\);/, '');
mkdirSync('preview', { recursive: true });
writeFileSync('preview/review-ui.html', `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>棋見 · 介面預覽</title><style>${css}</style></head>
<body><div id="root">${html}</div></body></html>
`);
console.log('已輸出 preview/review-ui.html（可直接在瀏覽器開啟檢視介面）');
