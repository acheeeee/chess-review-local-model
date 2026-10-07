import assert from 'node:assert/strict';
import test from 'node:test';
import { boardView, canStep, interactiveBoard, moveRows, stepPly, variationLine, variationView } from '../src/navigation.js';
import { START_PLY, buildReviewMove, readPgn, withReviewMove } from '../src/review.js';

function engineResult({ cp = null, mate = null, wdl = null, pv = [], bestMove = '(none)' }) {
  return { depth: 13, cp, mate, wdl, pv, bestMove };
}

const squareAt = (view, name) => view.squares.find((square) => square.square === name);

test('boardView lays squares out in display order with correct colours and labels', () => {
  const view = boardView('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  assert.equal(view.squares.length, 64);
  assert.equal(view.squares[0].square, 'a8');
  assert.equal(view.squares.at(-1).square, 'h1');
  assert.deepEqual(view.squares[0].piece, { type: 'r', color: 'b' });
  assert.deepEqual(squareAt(view, 'e1').piece, { type: 'k', color: 'w' });
  assert.equal(squareAt(view, 'e4').piece, null);
  assert.equal(squareAt(view, 'a8').dark, false, 'a8 is a light square');
  assert.equal(squareAt(view, 'h8').dark, true, 'h8 is a dark square');
  assert.equal(view.squares[0].rankLabel, '8');
  assert.equal(view.squares[1].rankLabel, null);
  assert.equal(view.squares.at(-1).fileLabel, 'h');
  assert.equal(view.squares[0].fileLabel, null);
});

test('flipping the board only changes display order, not the position', () => {
  const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const black = boardView(fen, { orientation: 'b' });
  assert.equal(black.orientation, 'b');
  assert.equal(black.squares[0].square, 'h1');
  assert.equal(black.squares.at(-1).square, 'a8');
  assert.deepEqual(squareAt(black, 'e1').piece, { type: 'k', color: 'w' }, 'pieces keep their squares');
  assert.equal(squareAt(black, 'h8').dark, true, 'square colours do not change when flipping');
  assert.equal(black.squares[0].rankLabel, '1');
  assert.equal(black.squares.at(-1).fileLabel, 'a');
});

test('boardView marks the played move and the engine suggestion separately', () => {
  const view = boardView('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', { lastMove: 'e2e4', suggestion: 'd2d4' });
  assert.equal(squareAt(view, 'e2').isLastFrom, true);
  assert.equal(squareAt(view, 'e4').isLastTo, true);
  assert.equal(squareAt(view, 'e4').isSuggestionTo, false);
  assert.equal(squareAt(view, 'd2').isSuggestionFrom, true);
  assert.equal(squareAt(view, 'd4').isSuggestionTo, true);
  assert.equal(squareAt(view, 'd2').isLastFrom, false);
});

test('stepping stays inside the game', () => {
  const game = readPgn('1. e4 e5 2. Nf3 *');
  assert.equal(stepPly(game, START_PLY, -1), START_PLY);
  assert.equal(stepPly(game, START_PLY, 1), 1);
  assert.equal(stepPly(game, 3, 1), 3, 'the last ply is the end of the line');
  assert.equal(canStep(game, 3, 1), false);
  assert.equal(canStep(game, 3, -1), true);
  assert.equal(canStep(game, START_PLY, -1), false);
  assert.equal(stepPly(null, 5, 1), START_PLY);
});

test('move rows pair white and black by full move, including a black-first PGN', () => {
  const game = readPgn('1. e4 e5 2. Nf3 *');
  const analysisByPly = withReviewMove({}, buildReviewMove({
    move: game.moves[0],
    best: engineResult({ cp: 30, pv: ['e2e4'], bestMove: 'e2e4' }),
    after: engineResult({ cp: -30 }),
  }));
  const rows = moveRows(game, analysisByPly);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.fullmove), [1, 2]);
  assert.equal(rows[0].white.move.san, 'e4');
  assert.equal(rows[0].white.analysis.classification.tone, 'best');
  assert.equal(rows[0].black.move.san, 'e5');
  assert.equal(rows[0].black.analysis, null, 'an unanalysed move still gets a cell');
  assert.equal(rows[1].black, null, 'a row without a black move keeps an empty cell');

  const blackFirst = moveRows(readPgn('[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 b - - 0 40"]\n\n40... Kd7 41. e4 *'));
  assert.equal(blackFirst[0].fullmove, 40);
  assert.equal(blackFirst[0].white, null, 'a black-first PGN must not shift the pairing');
  assert.equal(blackFirst[0].black.move.san, 'Kd7');
  assert.equal(blackFirst[1].white.move.san, 'e4');
  assert.deepEqual(moveRows(null), []);
});

test('variation preview walks the engine line and never leaks into the real game', () => {
  const game = readPgn('1. e4 e5 2. Nf3 Qf6 *');
  const review = buildReviewMove({
    move: game.moves[3],
    best: engineResult({ cp: 120, pv: ['b8c6', 'f1b5', 'g8f6'], bestMove: 'b8c6' }),
    after: engineResult({ cp: 200 }),
  });
  const line = variationLine(review);
  assert.deepEqual(line.map((step) => step.san), ['Nc6', 'Bb5', 'Nf6']);
  assert.deepEqual(line.map((step) => step.color), ['b', 'w', 'b'], 'the line alternates from the mover');
  assert.deepEqual(variationLine(null), []);

  assert.equal(variationView(review, null), null, 'null index means the real game');
  const first = variationView(review, 0);
  assert.equal(first.index, 0);
  assert.equal(first.san, 'Nc6');
  assert.equal(first.lastMoveUci, 'b8c6');
  assert.equal(first.fen, review.pv.moves[0].afterFen);
  assert.notEqual(first.fen, review.afterFen, 'the variation board differs from the played position');
  assert.equal(variationView(review, 99).index, 2, 'index is clamped to the line');
  assert.equal(variationView(review, 2).isLast, true);
});

test('interactiveBoard is the single derivation for board, highlights and preview', () => {
  const game = readPgn('1. e4 e5 2. Nf3 Qf6 *');
  const review = buildReviewMove({
    move: game.moves[3],
    best: engineResult({ cp: 120, pv: ['b8c6', 'f1b5'], bestMove: 'b8c6' }),
    after: engineResult({ cp: 200 }),
  });
  const analysisByPly = withReviewMove({}, review);

  const start = interactiveBoard(game, analysisByPly, { selectedPly: START_PLY, orientation: 'w', variationIndex: null });
  assert.equal(start.fen, game.initialFen);
  assert.equal(start.variation, null);
  assert.equal(start.view.squares.filter((square) => square.isLastFrom || square.isLastTo).length, 0);

  const played = interactiveBoard(game, analysisByPly, { selectedPly: 4, orientation: 'w', variationIndex: null });
  assert.equal(played.fen, review.afterFen);
  assert.equal(squareAt(played.view, 'd8').isLastFrom, true);
  assert.equal(squareAt(played.view, 'f6').isLastTo, true);
  assert.equal(played.view.squares.some((square) => square.isSuggestionTo), false, 'the played board never shows the suggestion as if it happened');

  const preview = interactiveBoard(game, analysisByPly, { selectedPly: 4, orientation: 'b', variationIndex: 0 });
  assert.equal(preview.fen, review.pv.moves[0].afterFen);
  assert.equal(preview.variation.san, 'Nc6');
  assert.equal(preview.view.orientation, 'b');
  assert.equal(squareAt(preview.view, 'c6').isSuggestionTo, true, 'variation moves are marked as engine suggestions');
  assert.equal(preview.view.squares.some((square) => square.isLastTo), false);

  const unanalysed = interactiveBoard(game, analysisByPly, { selectedPly: 2, orientation: 'w', variationIndex: 0 });
  assert.equal(unanalysed.variation, null, 'a ply without analysis has no variation to preview');
  assert.equal(unanalysed.fen, game.moves[1].afterFen);
});
