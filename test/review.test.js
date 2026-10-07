import assert from 'node:assert/strict';
import test from 'node:test';
import { classify, formatEvaluation, lossCp, normalizeEvaluation, readPgn, terminalEvaluation, whiteWinChance } from '../src/review.js';

const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const blackToMoveFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1';

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
