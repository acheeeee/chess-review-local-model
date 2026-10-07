import assert from 'node:assert/strict';
import test from 'node:test';
import {
  centerControl,
  developedMinors,
  kingShield,
  loosePieces,
  materialBalance,
  moveFacts,
  pawnStructure,
  squarePressure,
} from '../src/facts.js';
import { inferredSignals, pvSignals } from '../src/commentary.js';
import { buildReviewMove, readPgn } from '../src/review.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function engineResult({ cp = null, mate = null, pv = [], bestMove = '(none)' }) {
  return { depth: 13, cp, mate, wdl: null, pv, bestMove };
}

function reviewOf(pgn, index, best = engineResult({ cp: 20, pv: [], bestMove: '(none)' })) {
  const game = readPgn(pgn);
  return buildReviewMove({ move: game.moves[index], best, after: engineResult({ cp: -20 }) });
}

test('material balance counts pawn units and ignores kings', () => {
  assert.equal(materialBalance(START), 0);
  assert.equal(materialBalance('4k3/8/8/8/8/8/8/3QK3 w - - 0 1'), 9);
  assert.equal(materialBalance('3qk3/8/8/8/8/8/8/4K3 w - - 0 1'), -9);
});

test('squarePressure counts attackers and defenders of a square', () => {
  const fen = 'rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 4';
  assert.equal(squarePressure(fen, 'e5', 'w'), 1, 'the f3 knight attacks e5');
  assert.equal(squarePressure(fen, 'e5', 'b'), 1, 'the d6 pawn defends e5');
  assert.equal(squarePressure(fen, 'h6', 'w'), 0);
});

test('loosePieces finds own pieces attacked more often than defended', () => {
  // The black e5 pawn is attacked by the knight and defended by nobody.
  const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';
  const black = loosePieces(fen, 'b');
  assert.deepEqual(black.map((piece) => piece.square), ['e5']);
  assert.deepEqual(black[0], { square: 'e5', type: 'p', attackers: 1, defenders: 0 });
  assert.deepEqual(loosePieces(fen, 'w'), [], 'white has nothing loose here');
  assert.deepEqual(loosePieces(START, 'w'), []);
});

test('pawnStructure reports doubled, isolated and passed pawns with evidence', () => {
  const start = pawnStructure(START, 'w');
  assert.equal(start.count, 8);
  assert.equal(start.doubled, 0);
  assert.equal(start.isolated, 0);
  assert.equal(start.passed, 0);

  const doubled = pawnStructure('4k3/8/8/8/8/2P5/2P5/4K3 w - - 0 1', 'w');
  assert.equal(doubled.doubled, 1);
  assert.deepEqual(doubled.doubledFiles, ['c']);
  assert.equal(doubled.isolated, 2, 'both c pawns are isolated');
  assert.deepEqual(doubled.isolatedFiles, ['c']);
  assert.equal(doubled.passed, 2, 'no black pawn can stop them');

  const blocked = pawnStructure('4k3/2p5/8/8/8/8/2P5/4K3 w - - 0 1', 'w');
  assert.equal(blocked.passed, 0, 'the c7 pawn is in front of the c2 pawn');
  const blackSide = pawnStructure('4k3/2p5/8/8/8/8/2P5/4K3 w - - 0 1', 'b');
  assert.equal(blackSide.passed, 0, 'passed is measured in the right direction for black');
});

test('kingShield and centerControl measure king cover and central presence', () => {
  const castled = kingShield('r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 8', 'w');
  assert.equal(castled.square, 'g1');
  assert.equal(castled.pawns, 3, 'f2, g2 and h2 still shield the king');
  assert.equal(castled.openFile, false);

  const exposed = kingShield('r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2P1P/R1BQ1RK1 w - - 0 8', 'w');
  assert.equal(exposed.pawns, 2, 'the g pawn is gone');
  assert.equal(exposed.openFile, true, 'the king now stands on a file with no own pawn');

  assert.equal(centerControl(START, 'w'), 0, 'at the start nothing attacks or occupies the four central squares');
  const withPawn = centerControl('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', 'w');
  assert.equal(withPawn, 2, 'the e4 pawn occupies e4 and attacks d5');
  assert.equal(developedMinors(START, 'w'), 0);
  assert.equal(developedMinors('rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1', 'w'), 1);
});

test('moveFacts measures both sides of one played move', () => {
  const game = readPgn('1. e4 e5 2. Nf3 Nc6 3. Nxe5 *');
  const capture = moveFacts(game.moves[4]);
  assert.equal(capture.color, 'w');
  assert.equal(capture.san, 'Nxe5');
  assert.equal(capture.materialShift, 1, 'white wins a pawn');
  assert.equal(capture.capture, true);
  assert.equal(capture.isCheck, false);
  assert.equal(capture.movedTo, 'e5');
  assert.equal(capture.movedPieceType, 'n');
  assert.equal(capture.landing.attackers, 1, 'the c6 knight attacks the knight on e5');
  assert.equal(capture.landing.defenders, 0);
  assert.equal(capture.lostCastlingRights, false);

  const quiet = moveFacts(readPgn('1. e4 *').moves[0]);
  assert.equal(quiet.materialShift, 0);
  assert.ok(quiet.after.center > quiet.before.center, 'e4 increases central control');
});

test('inferred signals cite the counts they are based on', () => {
  const hanging = reviewOf('1. e4 e5 2. Nf3 Nc6 3. Nxe5 *', 4);
  assert.ok(hanging.commentary.inferred.length > 0);
  const landing = hanging.commentary.inferred.find((line) => line.includes('e5'));
  assert.ok(landing, `expected a line about the landing square: ${JSON.stringify(hanging.commentary.inferred)}`);
  assert.match(landing, /1 子攻擊、只有 0 子保護/);
  assert.ok(hanging.commentary.inferred.length <= 3, 'commentary stays short');

  const opening = reviewOf('1. Nf3 *', 0);
  assert.ok(opening.commentary.inferred.some((line) => line.includes('開局階段又出動一個子')), JSON.stringify(opening.commentary.inferred));
});

test('king safety and pawn structure rules fire with their evidence', () => {
  const lostRights = reviewOf('1. e4 e5 2. Ke2 *', 2);
  assert.ok(lostRights.commentary.inferred.some((line) => line.includes('失去易位權')), JSON.stringify(lostRights.commentary.inferred));

  const doubled = reviewOf('1. e4 d5 2. exd5 *', 2);
  assert.ok(
    doubled.commentary.inferred.some((line) => /疊兵|孤兵|通兵/.test(line)) || doubled.commentary.confirmed.some((line) => line.includes('子力差')),
    JSON.stringify(doubled.commentary),
  );
});

test('checkmate is reported as a confirmed fact without strategy guessing', () => {
  const game = readPgn('1. f3 e5 2. g4 Qh4# 0-1');
  const mate = buildReviewMove({
    move: game.moves[3],
    best: engineResult({ mate: 1, pv: ['d8h4'], bestMove: 'd8h4' }),
    after: { score: { kind: 'mate', value: -1 }, wdl: null, terminal: 'checkmate' },
  });
  assert.ok(mate.commentary.confirmed.some((line) => line.includes('將死')));
  assert.deepEqual(mate.commentary.inferred, [], 'a finished game needs no strategy advice');
});

test('pv signals only state what the engine line itself shows', () => {
  const capture = reviewOf('1. e4 e5 2. Nf3 Nc6 3. Bb5 *', 4, engineResult({ cp: 25, pv: ['f3e5', 'c6e5'], bestMove: 'f3e5' }));
  assert.ok(capture.commentary.confirmed.some((line) => line.includes('以吃子 Nxe5 開始')), JSON.stringify(capture.commentary.confirmed));

  const mateLine = reviewOf('1. f3 e5 2. g4 *', 2, engineResult({ mate: 1, pv: ['g2g4', 'd8h4'], bestMove: 'g2g4' }));
  assert.ok(mateLine.commentary.confirmed.some((line) => line.includes('步內將死')), JSON.stringify(mateLine.commentary.confirmed));

  assert.deepEqual(pvSignals({ pv: { moves: [] } }), []);
  assert.deepEqual(inferredSignals(null), []);
});
