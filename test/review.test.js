import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLASSIFICATION_THRESHOLDS,
  START_PLY,
  analysedPlies,
  analysisAt,
  buildReviewMove,
  chanceAtPly,
  chartPoints,
  clampPly,
  classify,
  evaluationAtPly,
  fenAtPly,
  formatEvaluation,
  lossCp,
  materialBalance,
  moveAtPly,
  normalizeEvaluation,
  plyLabel,
  readPgn,
  selectPlyView,
  summarize,
  terminalEvaluation,
  whiteWinChance,
  withReviewMove,
} from '../src/review.js';

const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const blackToMoveFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1';

/** Minimal engine result shaped like `Stockfish.analyse()` output. */
function engineResult({ cp = null, mate = null, wdl = null, pv = [], bestMove = '(none)' }) {
  return { depth: 13, cp, mate, wdl, pv, bestMove };
}

test('normalizes UCI cp, mate, and WDL from side-to-move to white perspective', () => {
  assert.deepEqual(normalizeEvaluation({ cp: 80, mate: null, wdl: [400, 300, 300] }, initialFen).score, { kind: 'cp', value: 80 });
  const blackResult = normalizeEvaluation({ cp: 80, mate: null, wdl: [400, 300, 300] }, blackToMoveFen);
  assert.deepEqual(blackResult.score, { kind: 'cp', value: -80 });
  assert.deepEqual(blackResult.wdl, [300, 300, 400]);
  assert.deepEqual(normalizeEvaluation({ cp: null, mate: -3, wdl: null }, blackToMoveFen).score, { kind: 'mate', value: 3 });
});

test('loss always measures deterioration for the player who made the move', () => {
  const whiteBest = normalizeEvaluation({ cp: 100, mate: null, wdl: null }, initialFen);
  const whiteActual = normalizeEvaluation({ cp: -50, mate: null, wdl: null }, blackToMoveFen);
  assert.equal(lossCp(whiteBest, whiteActual, 'w'), 50, 'after FEN changes turn, so -50 black-perspective is +50 white');

  const blackBest = normalizeEvaluation({ cp: 100, mate: null, wdl: null }, blackToMoveFen);
  const blackActual = normalizeEvaluation({ cp: 50, mate: null, wdl: null }, initialFen);
  assert.equal(lossCp(blackBest, blackActual, 'b'), 150);
});

test('WDL produces white win chance before the cp fallback and mate renders explicitly', () => {
  const wdl = normalizeEvaluation({ cp: 0, mate: null, wdl: [700, 200, 100] }, initialFen);
  assert.equal(whiteWinChance(wdl), 80);
  const mate = normalizeEvaluation({ cp: null, mate: -2, wdl: null }, blackToMoveFen);
  assert.equal(formatEvaluation(mate), '#2');
  assert.equal(whiteWinChance(mate), 100);
});

test('recognizes checkmate and draw terminal positions without inventing a 0 cp engine result', () => {
  const mate = terminalEvaluation('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
  assert.deepEqual(mate.score, { kind: 'mate', value: -1 });
  assert.equal(formatEvaluation(mate), '-#1');
  const draw = terminalEvaluation('7k/5Q2/7K/8/8/8/8/8 b - - 0 1');
  assert.equal(draw.score.value, 0);
  assert.equal(whiteWinChance(draw), 50);
});

test('reads PGN main line and preserves verbose before/after positions', () => {
  const game = readPgn('[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/7K/8 w - - 0 1"]\n\n1. a8=N 1/2-1/2');
  assert.equal(game.moves.length, 1);
  assert.equal(game.moves[0].san, 'a8=N');
  assert.equal(game.moves[0].beforeFen, '7k/P7/8/8/8/8/7K/8 w - - 0 1');
  assert.equal(classify(15).tone, 'best');
  assert.equal(classify(16).tone, 'good');
});

test('classification bands come from the single shared threshold table', () => {
  assert.deepEqual(CLASSIFICATION_THRESHOLDS.map((band) => band.maxLossCp), [15, 45, 100, 250, Infinity]);
  assert.deepEqual(CLASSIFICATION_THRESHOLDS.map((band) => band.tone), ['best', 'good', 'inaccuracy', 'mistake', 'blunder']);
  assert.equal(classify(0).tone, 'best');
  assert.equal(classify(100).tone, 'inaccuracy');
  assert.equal(classify(101).tone, 'mistake');
  assert.equal(classify(250).tone, 'mistake');
  assert.equal(classify(5000).tone, 'blunder');
});

test('ply 0 is the position before move 1, including for a PGN with a custom start FEN', () => {
  const standard = readPgn('1. e4 e5 *');
  assert.equal(START_PLY, 0);
  assert.equal(standard.initialFen, initialFen);
  assert.equal(fenAtPly(standard, START_PLY), initialFen);
  assert.equal(moveAtPly(standard, START_PLY), null);
  assert.equal(plyLabel(standard, START_PLY), '初始局面');
  assert.equal(fenAtPly(standard, 1), standard.moves[0].afterFen);
  assert.equal(plyLabel(standard, 2), '1... e5');
  assert.equal(standard.lastPly, 2);

  const custom = readPgn('[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 40"]\n\n40. e4 Kd7 *');
  assert.equal(fenAtPly(custom, START_PLY), '4k3/8/8/8/8/8/4P3/4K3 w - - 0 40');
  assert.equal(custom.moves[0].fullmove, 40);
  assert.equal(plyLabel(custom, 1), '40. e4');

  assert.equal(clampPly(standard, -5), START_PLY);
  assert.equal(clampPly(standard, 99), standard.lastPly);
  assert.equal(fenAtPly(null, 3), initialFen);
});

test('buildReviewMove exposes the full ReviewMove contract for a black blunder', () => {
  // Black plays 2... Nf6?? losing a piece-sized evaluation chunk.
  const game = readPgn('1. e4 e5 2. Nf3 Qf6 *');
  const move = game.moves[3];
  assert.equal(move.color, 'b');
  const review = buildReviewMove({
    move,
    // Before Black's move the engine likes the position for Black (+120 for
    // the side to move, i.e. -120 white).
    best: engineResult({ cp: 120, pv: ['b8c6', 'f1b5'], bestMove: 'b8c6' }),
    // After the blunder White is to move and is +200, i.e. +200 white.
    after: engineResult({ cp: 200, pv: ['f3e5'], bestMove: 'f3e5' }),
  });

  assert.deepEqual(Object.keys(review).sort(), [
    'actual', 'afterFen', 'afterWhiteCp', 'beforeFen', 'best', 'bestSan', 'bestWhiteCp',
    'classification', 'color', 'commentary', 'flags', 'fullmove', 'lossCp', 'ply', 'pv',
    'san', 'uci', 'whiteWinChance',
  ]);
  assert.equal(review.ply, 4);
  assert.equal(review.fullmove, 2);
  assert.equal(review.san, 'Qf6');
  assert.equal(review.uci, 'd8f6');
  assert.equal(review.bestWhiteCp, -120);
  assert.equal(review.afterWhiteCp, 200);
  assert.equal(review.lossCp, 320, 'black losing 320 cp must be a black blunder, not a white one');
  assert.equal(review.classification.tone, 'blunder');
  assert.equal(review.bestSan, 'Nc6', 'engine bestmove is replayed in the pre-move position');
  assert.deepEqual(review.pv.moves.map((entry) => entry.san), ['Nc6', 'Bb5']);
  assert.equal(review.pv.error, null);
  assert.ok(review.commentary.confirmed.some((line) => line.includes('黑方實戰下 Qf6')));
  assert.ok(review.commentary.confirmed.some((line) => line.includes('引擎首選 Nc6')));
  assert.deepEqual(review.commentary.inferred, [], 'no rule has evidence for this move, so nothing is invented');
});

test('a white move that keeps the engine top choice is not penalised', () => {
  const game = readPgn('1. e4 *');
  const review = buildReviewMove({
    move: game.moves[0],
    best: engineResult({ cp: 30, pv: ['e2e4', 'e7e5'], bestMove: 'e2e4' }),
    after: engineResult({ cp: -30, pv: ['e7e5'], bestMove: 'e7e5' }),
  });
  assert.equal(review.lossCp, 0);
  assert.equal(review.classification.tone, 'best');
  assert.equal(review.bestWhiteCp, 30);
  assert.equal(review.afterWhiteCp, 30);
});

test('terminal, promotion, castling and en passant moves survive the contract', () => {
  const mateGame = readPgn('1. f3 e5 2. g4 Qh4# 0-1');
  const mateMove = mateGame.moves.at(-1);
  const mateReview = buildReviewMove({
    move: mateMove,
    best: engineResult({ mate: 1, pv: ['d8h4'], bestMove: 'd8h4' }),
    after: terminalEvaluation(mateMove.afterFen),
  });
  assert.equal(mateReview.color, 'b');
  assert.deepEqual(mateReview.actual.score, { kind: 'mate', value: -1 });
  assert.equal(formatEvaluation(mateReview.actual), '-#1');
  assert.equal(mateReview.afterWhiteCp, null, 'mate must never be flattened into a cp number');
  assert.equal(mateReview.whiteWinChance, 0);
  assert.equal(mateReview.lossCp, 0);
  assert.ok(mateReview.commentary.confirmed.some((line) => line.includes('將死')));

  const promotion = readPgn('[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/7K/8 w - - 0 1"]\n\n1. a8=Q *');
  const promotionReview = buildReviewMove({
    move: promotion.moves[0],
    best: engineResult({ cp: 900, pv: ['a7a8q'], bestMove: 'a7a8q' }),
    after: engineResult({ cp: -900, pv: ['h8g7'], bestMove: 'h8g7' }),
  });
  assert.equal(promotionReview.san, 'a8=Q+', 'promotion in this position also gives check');
  assert.equal(promotionReview.bestSan, 'a8=Q+');
  assert.equal(promotionReview.lossCp, 0);
  assert.ok(promotionReview.commentary.confirmed.some((line) => line.includes('子力差')), 'promotion changes material');

  const castle = readPgn('1. e4 e5 2. Nf3 Nf6 3. Bc4 Bc5 4. O-O O-O *');
  assert.equal(castle.moves[6].san, 'O-O');
  assert.equal(castle.moves[6].flags.includes('k'), true);
  const castleReview = buildReviewMove({
    move: castle.moves[6],
    best: engineResult({ cp: 20, pv: ['e1g1'], bestMove: 'e1g1' }),
    after: engineResult({ cp: -20, pv: ['e8g8'], bestMove: 'e8g8' }),
  });
  assert.equal(castleReview.bestSan, 'O-O');
  assert.equal(materialBalance(castleReview.afterFen), 0, 'castling moves no material');

  const enPassant = readPgn('1. e4 Nf6 2. e5 d5 3. exd6 *');
  const epMove = enPassant.moves.at(-1);
  assert.equal(epMove.flags.includes('e'), true);
  const epReview = buildReviewMove({
    move: epMove,
    best: engineResult({ cp: 60, pv: ['e5d6'], bestMove: 'e5d6' }),
    after: engineResult({ cp: -60, pv: ['c8d7'], bestMove: 'c8d7' }),
  });
  assert.equal(epReview.lossCp, 0);
  assert.equal(materialBalance(epReview.afterFen) - materialBalance(epReview.beforeFen), 1, 'en passant captures a pawn');
});

test('rejects PGN without a legal main line', () => {
  assert.throws(() => readPgn('1. e4 e9 *'), /無法讀取棋譜|找不到任何合法著法/);
  assert.throws(() => readPgn('[White "a"]\n[Result "*"]\n\n*'), /找不到任何合法著法/);
});

test('analysis keyed by ply keeps unanalysed plies selectable and the curve contiguous', () => {
  const game = readPgn('1. e4 e5 2. Nf3 Nc6 *');
  const makeMove = (index, bestCp, afterCp) => buildReviewMove({
    move: game.moves[index],
    best: engineResult({ cp: bestCp, pv: [game.moves[index].uci], bestMove: game.moves[index].uci }),
    after: engineResult({ cp: afterCp, pv: [], bestMove: '(none)' }),
  });

  let analysisByPly = {};
  assert.equal(analysisAt(analysisByPly, 1), null);
  assert.equal(chanceAtPly(analysisByPly, START_PLY), null);
  assert.equal(evaluationAtPly(analysisByPly, START_PLY), null);
  assert.deepEqual(chartPoints(game, analysisByPly), []);

  analysisByPly = withReviewMove(analysisByPly, makeMove(0, 30, -30));
  analysisByPly = withReviewMove(analysisByPly, makeMove(1, 30, -25));
  // Ply 3 is deliberately skipped to prove the model is not an array.
  analysisByPly = withReviewMove(analysisByPly, makeMove(3, 40, -10));

  assert.deepEqual(analysedPlies(analysisByPly), [1, 2, 4]);
  assert.equal(analysisAt(analysisByPly, 3), null, 'an unanalysed ply reports no analysis instead of shifting indexes');
  assert.equal(analysisAt(analysisByPly, 4).san, 'Nc6');
  // Ply 0 chance comes from the pre-move evaluation of ply 1.
  assert.equal(evaluationAtPly(analysisByPly, START_PLY).score.value, 30);
  assert.equal(chanceAtPly(analysisByPly, START_PLY), whiteWinChance(analysisAt(analysisByPly, 1).best));
  assert.equal(chanceAtPly(analysisByPly, 2), analysisAt(analysisByPly, 2).whiteWinChance);
  assert.deepEqual(chartPoints(game, analysisByPly).map((point) => point.ply), [0, 1, 2], 'curve stops at the first gap');
  assert.equal(chartPoints(game, analysisByPly)[0].tone, 'start');
});

test('selectPlyView derives board, label and evaluation for the single selected ply', () => {
  const game = readPgn('1. e4 e5 2. Nf3 *');
  const analysed = buildReviewMove({
    move: game.moves[0],
    best: engineResult({ cp: 30, pv: ['e2e4'], bestMove: 'e2e4' }),
    after: engineResult({ cp: -30, pv: [], bestMove: '(none)' }),
  });
  const analysisByPly = withReviewMove({}, analysed);

  const start = selectPlyView(game, analysisByPly, START_PLY);
  assert.equal(start.isStart, true);
  assert.equal(start.isLast, false);
  assert.equal(start.fen, game.initialFen);
  assert.equal(start.move, null);
  assert.equal(start.lastMoveUci, null);
  assert.equal(start.label, '初始局面');
  assert.equal(start.analysis, null, 'ply 0 has no ReviewMove of its own');
  assert.equal(start.evaluation.score.value, 30, 'ply 0 shows the pre-move evaluation of ply 1');

  const first = selectPlyView(game, analysisByPly, 1);
  assert.equal(first.fen, game.moves[0].afterFen);
  assert.equal(first.lastMoveUci, 'e2e4');
  assert.equal(first.label, '1. e4');
  assert.equal(first.analysis.ply, 1);
  assert.equal(first.whiteWinChance, analysed.whiteWinChance);

  const pending = selectPlyView(game, analysisByPly, 3);
  assert.equal(pending.selectedPly, 3);
  assert.equal(pending.isLast, true);
  assert.equal(pending.fen, game.moves[2].afterFen, 'an unanalysed ply still shows its board position');
  assert.equal(pending.analysis, null);
  assert.equal(pending.whiteWinChance, null);

  assert.equal(selectPlyView(game, analysisByPly, 99).selectedPly, game.lastPly, 'selection is clamped to the game');
  assert.equal(selectPlyView(null, {}, 4).selectedPly, START_PLY);
});

test('summary aggregates per tone and per colour without mixing sides', () => {
  const game = readPgn('1. e4 e5 2. Nf3 Qf6 *');
  const whiteGood = buildReviewMove({
    move: game.moves[0],
    best: engineResult({ cp: 30, pv: ['e2e4'], bestMove: 'e2e4' }),
    after: engineResult({ cp: -10, pv: [], bestMove: '(none)' }),
  });
  const blackBlunder = buildReviewMove({
    move: game.moves[3],
    best: engineResult({ cp: 120, pv: ['b8c6'], bestMove: 'b8c6' }),
    after: engineResult({ cp: 200, pv: [], bestMove: '(none)' }),
  });
  const summary = summarize(withReviewMove(withReviewMove({}, whiteGood), blackBlunder));

  assert.equal(summary.analysed, 2);
  assert.equal(summary.byTone.good, 1);
  assert.equal(summary.byTone.blunder, 1);
  assert.equal(summary.byColor.w.byTone.blunder, 0, 'the black blunder must not be charged to white');
  assert.equal(summary.byColor.b.byTone.blunder, 1);
  assert.equal(summary.byColor.w.averageLossCp, 20);
  assert.equal(summary.byColor.b.averageLossCp, 320);
  assert.equal(summary.worst.ply, blackBlunder.ply);
  assert.equal(summarize({}).worst, null);
});
