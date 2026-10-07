import { Chess } from 'chess.js';
import { inferredSignals, pvSignals } from './commentary.js';
import { materialBalance } from './facts.js';

export { materialBalance };

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** `selectedPly === 0` always means "the position before the first move". */
export const START_PLY = 0;

export const SAMPLE_PGN = `[Event "示範對局"]
[Site "Local"]
[Date "2026.10.07"]
[Round "1"]
[White "白方"]
[Black "黑方"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. e5 d5 7. Bb5 Ne4 8. cxd4 Bb4+ 9. Bd2 Nxd2 10. Nbxd2 O-O *`;

/**
 * Classification thresholds are product policy, not chess truth. They are
 * defined once here so no component invents its own cutoffs.
 */
export const CLASSIFICATION_THRESHOLDS = [
  { maxLossCp: 15, label: '最佳著', tone: 'best' },
  { maxLossCp: 45, label: '好著', tone: 'good' },
  { maxLossCp: 100, label: '可改進', tone: 'inaccuracy' },
  { maxLossCp: 250, label: '失誤', tone: 'mistake' },
  { maxLossCp: Infinity, label: '大失誤', tone: 'blunder' },
];

export function readPgn(pgn) {
  const game = new Chess();
  try { game.loadPgn(pgn.trim()); }
  catch (error) { throw new Error(`無法讀取棋譜：${error.message}`); }
  const moves = game.history({ verbose: true }).map((move, index) => ({
    ply: index + 1,
    fullmove: Number(move.before.split(' ')[5]),
    color: move.color,
    san: move.san,
    uci: move.lan,
    beforeFen: move.before,
    afterFen: move.after,
    flags: move.flags,
  }));
  if (!moves.length) throw new Error('棋譜中找不到任何合法著法。請貼上完整 PGN。');
  const headers = game.getHeaders();
  return {
    headers,
    // The PGN may start from a custom position; ply 0 must reflect that FEN.
    initialFen: moves[0].beforeFen,
    moves,
    lastPly: moves.length,
  };
}

export function moveAtPly(game, ply) {
  if (!game || ply <= START_PLY) return null;
  return game.moves[ply - 1] ?? null;
}

export function fenAtPly(game, ply) {
  if (!game) return START_FEN;
  if (ply <= START_PLY) return game.initialFen;
  return moveAtPly(game, ply)?.afterFen ?? game.moves.at(-1).afterFen;
}

export function clampPly(game, ply) {
  if (!game) return START_PLY;
  return Math.max(START_PLY, Math.min(game.lastPly, Math.round(ply)));
}

export function plyLabel(game, ply) {
  const move = moveAtPly(game, ply);
  if (!move) return '初始局面';
  return `${move.fullmove}${move.color === 'w' ? '.' : '...'} ${move.san}`;
}

export function moveFromUci(fen, uci) {
  if (!uci || uci === '(none)') return '—';
  const position = new Chess(fen);
  try {
    return position.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })?.san ?? uci;
  } catch { return uci; }
}

export function replayPv(startFen, pv) {
  const position = new Chess(startFen);
  const moves = [];
  for (const uci of pv) {
    const beforeFen = position.fen();
    try {
      const move = position.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (!move) throw new Error('沒有合法著法');
      moves.push({ uci, san: move.san, beforeFen, afterFen: position.fen() });
    } catch {
      return { moves, error: `引擎主變例含無法重播的著法：${uci}` };
    }
  }
  return { moves, error: null };
}

/**
 * UCI scores and WDL are from the perspective of the side to move in `fen`.
 * This function is the only place that translates them to the app-wide white
 * perspective; callers must never flip a score again based on move colour.
 */
export function normalizeEvaluation(result, fen) {
  const multiplier = new Chess(fen).turn() === 'w' ? 1 : -1;
  const score = result.mate !== null && result.mate !== undefined
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

/** The renderable white centipawn value; mate scores deliberately return null. */
export function whiteCp(evaluation) {
  return evaluation?.score?.kind === 'cp' ? evaluation.score.value : null;
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
  const band = CLASSIFICATION_THRESHOLDS.find((entry) => loss <= entry.maxLossCp) ?? CLASSIFICATION_THRESHOLDS.at(-1);
  return { label: band.label, tone: band.tone };
}

/**
 * Commentary separates engine/board facts from interpretation. Rule-based
 * strategy text belongs in `inferred` and must never be presented as a
 * confirmed engine statement.
 */
export function makeCommentary(move) {
  const side = move.color === 'w' ? '白方' : '黑方';
  const confirmed = [`${side}實戰下 ${move.san}；走後引擎評估 ${formatEvaluation(move.actual)}（白方視角）。`];
  if (move.bestSan && move.bestSan !== '—' && move.bestSan !== move.san) {
    const drop = move.lossCp === null ? null : (move.lossCp / 100).toFixed(2);
    confirmed.push(drop === null || move.lossCp <= 15
      ? `引擎首選 ${move.bestSan}，與實戰著評估接近。`
      : `引擎首選 ${move.bestSan}；實戰著比首選差約 ${drop} 兵。`);
  }
  const materialShift = materialBalance(move.afterFen) - materialBalance(move.beforeFen);
  if (materialShift !== 0) confirmed.push(`盤面子力差（白減黑）因此著變化 ${materialShift > 0 ? '+' : ''}${materialShift}。`);
  if (move.actual.terminal === 'checkmate') confirmed.push('此著將死對方，棋局結束。');
  else if (move.actual.terminal === 'draw') confirmed.push('此著後局面依規則判和。');
  else if (new Chess(move.afterFen).isCheck()) confirmed.push('此著對對方國王將軍。');
  confirmed.push(...pvSignals(move));
  return { confirmed, inferred: inferredSignals(move) };
}

function toEvaluation(result, fen) {
  // Terminal evaluations are already white-perspective and carry no UCI score.
  return result?.score ? result : normalizeEvaluation(result, fen);
}

/**
 * The single place where a `GameMove` plus engine results become the
 * `ReviewMove` contract consumed by the UI. Keep every derived field here so
 * components never recompute perspective, loss or classification.
 */
export function buildReviewMove({ move, best, after, pvLength = 6 }) {
  const bestEvaluation = toEvaluation(best, move.beforeFen);
  const afterEvaluation = toEvaluation(after, move.afterFen);
  const loss = lossCp(bestEvaluation, afterEvaluation, move.color);
  const reviewMove = {
    ply: move.ply,
    fullmove: move.fullmove,
    color: move.color,
    san: move.san,
    uci: move.uci,
    beforeFen: move.beforeFen,
    afterFen: move.afterFen,
    flags: move.flags,
    best: bestEvaluation,
    actual: afterEvaluation,
    bestWhiteCp: whiteCp(bestEvaluation),
    afterWhiteCp: whiteCp(afterEvaluation),
    bestSan: moveFromUci(move.beforeFen, bestEvaluation.bestMove),
    pv: replayPv(move.beforeFen, (bestEvaluation.pv ?? []).slice(0, pvLength)),
    lossCp: loss,
    classification: classify(loss),
    whiteWinChance: whiteWinChance(afterEvaluation),
  };
  reviewMove.commentary = makeCommentary(reviewMove);
  return reviewMove;
}

/** Analysis state is keyed by ply so the UI can select unanalysed positions. */
export function withReviewMove(analysisByPly, reviewMove) {
  return { ...analysisByPly, [reviewMove.ply]: reviewMove };
}

export function analysisAt(analysisByPly, ply) {
  return analysisByPly?.[ply] ?? null;
}

export function analysedPlies(analysisByPly) {
  return Object.keys(analysisByPly ?? {}).map(Number).sort((a, b) => a - b);
}

/**
 * The white win chance to show for any ply, including ply 0: the engine
 * evaluation before move 1 is exactly the `best` evaluation of ply 1.
 */
export function chanceAtPly(analysisByPly, ply) {
  if (ply > START_PLY) {
    const analysis = analysisAt(analysisByPly, ply);
    return analysis ? analysis.whiteWinChance : null;
  }
  const first = analysisAt(analysisByPly, 1);
  return first ? whiteWinChance(first.best) : null;
}

export function evaluationAtPly(analysisByPly, ply) {
  if (ply > START_PLY) return analysisAt(analysisByPly, ply)?.actual ?? null;
  return analysisAt(analysisByPly, 1)?.best ?? null;
}

/**
 * Everything the board, evaluation bar and side panel need for one ply.
 * Components must derive their position from here instead of keeping their own
 * copy of the selection.
 */
export function selectPlyView(game, analysisByPly, ply) {
  const selectedPly = clampPly(game, ply);
  const move = moveAtPly(game, selectedPly);
  return {
    selectedPly,
    isStart: selectedPly === START_PLY,
    isLast: !game || selectedPly === game.lastPly,
    fen: fenAtPly(game, selectedPly),
    move,
    lastMoveUci: move?.uci ?? null,
    label: plyLabel(game, selectedPly),
    analysis: analysisAt(analysisByPly, selectedPly),
    evaluation: evaluationAtPly(analysisByPly, selectedPly),
    whiteWinChance: chanceAtPly(analysisByPly, selectedPly),
  };
}

/** Contiguous curve points from ply 0 up to the last analysed ply. */
export function chartPoints(game, analysisByPly) {
  if (!game) return [];
  const points = [];
  if (analysisAt(analysisByPly, 1)) {
    points.push({ ply: START_PLY, whiteWinChance: chanceAtPly(analysisByPly, START_PLY), tone: 'start', label: '初始局面' });
  }
  for (const move of game.moves) {
    const analysis = analysisAt(analysisByPly, move.ply);
    if (!analysis) break;
    points.push({ ply: move.ply, whiteWinChance: analysis.whiteWinChance, tone: analysis.classification.tone, label: plyLabel(game, move.ply) });
  }
  return points;
}

function emptyCounts() {
  return CLASSIFICATION_THRESHOLDS.reduce((all, band) => ({ ...all, [band.tone]: 0 }), {});
}

/** Whole-game summary derived only from completed ReviewMoves. */
export function summarize(analysisByPly) {
  const moves = analysedPlies(analysisByPly).map((ply) => analysisByPly[ply]);
  const summary = {
    analysed: moves.length,
    byTone: emptyCounts(),
    byColor: {
      w: { moves: 0, totalLossCp: 0, averageLossCp: null, byTone: emptyCounts() },
      b: { moves: 0, totalLossCp: 0, averageLossCp: null, byTone: emptyCounts() },
    },
    worst: null,
  };
  for (const move of moves) {
    const tone = move.classification.tone;
    const side = summary.byColor[move.color];
    summary.byTone[tone] += 1;
    side.moves += 1;
    side.byTone[tone] += 1;
    side.totalLossCp += move.lossCp ?? 0;
    if (move.lossCp !== null && (!summary.worst || move.lossCp > summary.worst.lossCp)) summary.worst = move;
  }
  for (const side of Object.values(summary.byColor)) {
    side.averageLossCp = side.moves ? side.totalLossCp / side.moves : null;
  }
  return summary;
}
