import { Chess } from 'chess.js';

export const SAMPLE_PGN = `[Event "示範對局"]
[Site "Local"]
[Date "2026.10.07"]
[Round "1"]
[White "白方"]
[Black "黑方"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. e5 d5 7. Bb5 Ne4 8. cxd4 Bb4+ 9. Bd2 Nxd2 10. Nbxd2 O-O *`;

export function readPgn(pgn) {
  const game = new Chess();
  try { game.loadPgn(pgn.trim()); }
  catch (error) { throw new Error(`無法讀取棋譜：${error.message}`); }
  const moves = game.history({ verbose: true });
  if (!moves.length) throw new Error('棋譜中找不到任何合法著法。請貼上完整 PGN。');
  return { moves, headers: game.getHeaders() };
}

export function moveFromUci(fen, uci) {
  if (!uci || uci === '(none)') return '—';
  const position = new Chess(fen);
  try {
    return position.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })?.san ?? uci;
  } catch { return uci; }
}

/**
 * UCI scores and WDL are from the perspective of the side to move in `fen`.
 * This function is the only place that translates them to the app-wide white
 * perspective; callers must never flip a score again based on move colour.
 */
export function normalizeEvaluation(result, fen) {
  const multiplier = new Chess(fen).turn() === 'w' ? 1 : -1;
  const score = result.mate !== null
    ? { kind: 'mate', value: result.mate * multiplier }
    : { kind: 'cp', value: (result.cp ?? 0) * multiplier };
  const wdl = result.wdl ? (multiplier === 1 ? result.wdl : [result.wdl[2], result.wdl[1], result.wdl[0]]) : null;
  return { ...result, score, wdl };
}

export function terminalEvaluation(fen) {
  const position = new Chess(fen);
  if (position.isCheckmate()) {
    // The side to move is checkmated. A value of ±1 means mate in the current
    // position; it is deliberately kept separate from centipawn evaluations.
    return { score: { kind: 'mate', value: position.turn() === 'w' ? -1 : 1 }, wdl: null, terminal: 'checkmate' };
  }
  if (position.isDraw()) return { score: { kind: 'cp', value: 0 }, wdl: [0, 1000, 0], terminal: 'draw' };
  return null;
}

/** A private ranking scale for classification; never render this as a cp score. */
export function comparableWhiteCp(evaluation) {
  const { score } = evaluation;
  if (score.kind === 'cp') return score.value;
  return Math.sign(score.value || 1) * (100000 - Math.min(999, Math.abs(score.value)) * 100);
}

export function lossCp(best, actual, moveColor) {
  const difference = comparableWhiteCp(best) - comparableWhiteCp(actual);
  return Math.max(0, moveColor === 'w' ? difference : -difference);
}

export function formatEvaluation(evaluation) {
  if (evaluation.score.kind === 'mate') return evaluation.score.value > 0 ? `#${evaluation.score.value}` : `-#${Math.abs(evaluation.score.value)}`;
  const value = evaluation.score.value / 100;
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

export function whiteWinChance(evaluation) {
  if (evaluation.score.kind === 'mate') return evaluation.score.value > 0 ? 100 : 0;
  if (evaluation.wdl) {
    const total = evaluation.wdl.reduce((sum, part) => sum + part, 0);
    // A drawn game is worth half a point. This is the expected score shown by
    // common chess review UIs and avoids treating a near-certain draw as 0%.
    if (total > 0) return ((evaluation.wdl[0] + evaluation.wdl[1] / 2) / total) * 100;
  }
  return 100 / (1 + Math.exp(-evaluation.score.value / 260));
}

export function classify(loss) {
  if (loss <= 15) return { label: '最佳著', tone: 'best' };
  if (loss <= 45) return { label: '好著', tone: 'good' };
  if (loss <= 100) return { label: '可改進', tone: 'inaccuracy' };
  if (loss <= 250) return { label: '失誤', tone: 'mistake' };
  return { label: '大失誤', tone: 'blunder' };
}

export function makeInsight(item) {
  const side = item.color === 'w' ? '白方' : '黑方';
  const direction = item.afterEvaluation.score.value >= 0 ? '白方' : '黑方';
  if (item.classification.tone === 'best') return `${side}下出接近引擎首選的 ${item.san}。局面評估為 ${formatEvaluation(item.afterEvaluation)}，${direction}稍佔優勢。`;
  const drop = (item.lossCp / 100).toFixed(2);
  return `${side}的 ${item.san} 讓局面少了約 ${drop} 兵的評估；引擎偏好 ${item.bestSan}。走後評估 ${formatEvaluation(item.afterEvaluation)}，勝率明顯往${direction}傾斜。`;
}
