import { Chess } from 'chess.js';

/**
 * Verifiable board facts.
 *
 * Nothing here interprets or explains: every function answers a question that
 * can be re-checked on the board (how many attackers, how many doubled pawns,
 * which pieces are loose). Commentary wording is built on top of these facts so
 * a rule-based sentence can always cite what it is based on.
 */

export const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9 };
export const CENTER_SQUARES = ['d4', 'e4', 'd5', 'e5'];
export const FILE_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const MINOR_HOME = { w: ['b1', 'c1', 'f1', 'g1'], b: ['b8', 'c8', 'f8', 'g8'] };

const other = (color) => (color === 'w' ? 'b' : 'w');

function pieceList(fen) {
  const list = [];
  new Chess(fen).board().forEach((row, rankIndex) => row.forEach((piece, fileIndex) => {
    if (piece) list.push({ ...piece, file: fileIndex, rank: 8 - rankIndex });
  }));
  return list;
}

/** White minus black material in pawn units; kings are excluded. */
export function materialBalance(fen) {
  return pieceList(fen).reduce((total, piece) => {
    if (piece.type === 'k') return total;
    const value = PIECE_VALUES[piece.type] ?? 0;
    return total + (piece.color === 'w' ? value : -value);
  }, 0);
}

export function squarePressure(fen, square, color) {
  return new Chess(fen).attackers(square, color).length;
}

/**
 * Own pieces that are attacked more times than they are defended. This is the
 * cheap, checkable part of "loose piece" tactics; it is not a full SEE.
 */
export function loosePieces(fen, color) {
  const position = new Chess(fen);
  return pieceList(fen)
    .filter((piece) => piece.color === color && piece.type !== 'k')
    .map((piece) => ({
      square: piece.square,
      type: piece.type,
      attackers: position.attackers(piece.square, other(color)).length,
      defenders: position.attackers(piece.square, color).length,
    }))
    .filter((piece) => piece.attackers > 0 && piece.defenders < piece.attackers);
}

export function pawnStructure(fen, color) {
  const pieces = pieceList(fen);
  const own = pieces.filter((piece) => piece.type === 'p' && piece.color === color);
  const enemy = pieces.filter((piece) => piece.type === 'p' && piece.color === other(color));
  const perFile = Array(8).fill(0);
  for (const pawn of own) perFile[pawn.file] += 1;
  const forward = color === 'w' ? 1 : -1;
  const doubled = perFile.reduce((total, count) => total + Math.max(0, count - 1), 0);
  const isolatedFiles = perFile
    .map((count, file) => ({ count, file }))
    .filter(({ count, file }) => count > 0 && (perFile[file - 1] ?? 0) === 0 && (perFile[file + 1] ?? 0) === 0)
    .map(({ file }) => FILE_NAMES[file]);
  const passed = own.filter((pawn) => !enemy.some((rival) => Math.abs(rival.file - pawn.file) <= 1 && (rival.rank - pawn.rank) * forward > 0));
  const doubledFiles = perFile.map((count, file) => (count > 1 ? FILE_NAMES[file] : null)).filter(Boolean);
  return {
    count: own.length,
    doubled,
    doubledFiles,
    // Counted in pawns, not files: two pawns on a lonely file are two isolated pawns.
    isolated: isolatedFiles.reduce((total, name) => total + perFile[FILE_NAMES.indexOf(name)], 0),
    isolatedFiles,
    passed: passed.length,
    passedSquares: passed.map((pawn) => pawn.square),
  };
}

/** Own pawns directly in front of the king (up to two ranks, three files). */
export function kingShield(fen, color) {
  const pieces = pieceList(fen);
  const king = pieces.find((piece) => piece.type === 'k' && piece.color === color);
  if (!king) return { square: null, pawns: 0, openFile: false };
  const forward = color === 'w' ? 1 : -1;
  const pawns = pieces.filter((piece) => piece.type === 'p'
    && piece.color === color
    && Math.abs(piece.file - king.file) <= 1
    && (piece.rank - king.rank) * forward > 0
    && Math.abs(piece.rank - king.rank) <= 2);
  // Semi-open towards the king: no *own* pawn left on the king's file.
  const openFile = !pieces.some((piece) => piece.type === 'p' && piece.color === color && piece.file === king.file);
  return { square: king.square, pawns: pawns.length, openFile };
}

/** Occupation plus attacks on the four central squares. */
export function centerControl(fen, color) {
  const position = new Chess(fen);
  return CENTER_SQUARES.reduce((total, square) => {
    const piece = position.get(square);
    return total + position.attackers(square, color).length + (piece && piece.color === color ? 1 : 0);
  }, 0);
}

export function developedMinors(fen, color) {
  return pieceList(fen).filter((piece) => piece.color === color
    && (piece.type === 'n' || piece.type === 'b')
    && !MINOR_HOME[color].includes(piece.square)).length;
}

export function castlingRights(fen, color) {
  return new Chess(fen).getCastlingRights(color);
}

function hasCastled(fen, color) {
  const position = new Chess(fen);
  const king = position.get(color === 'w' ? 'g1' : 'g8') ?? position.get(color === 'w' ? 'c1' : 'c8');
  return !!king && king.type === 'k' && king.color === color;
}

/**
 * Everything a commentary rule may look at for one played move, measured on
 * both sides of the move so a rule can talk about what changed.
 */
export function moveFacts(move) {
  const { beforeFen, afterFen, color, san, uci } = move;
  const afterPosition = new Chess(afterFen);
  const opponent = other(color);
  const toSquare = uci?.slice(2, 4) ?? null;
  const movedPiece = toSquare ? afterPosition.get(toSquare) : null;
  const before = {
    loose: loosePieces(beforeFen, color),
    pawns: pawnStructure(beforeFen, color),
    shield: kingShield(beforeFen, color),
    center: centerControl(beforeFen, color),
    minors: developedMinors(beforeFen, color),
    rights: castlingRights(beforeFen, color),
  };
  const after = {
    loose: loosePieces(afterFen, color),
    pawns: pawnStructure(afterFen, color),
    shield: kingShield(afterFen, color),
    center: centerControl(afterFen, color),
    minors: developedMinors(afterFen, color),
    rights: castlingRights(afterFen, color),
  };
  return {
    color,
    san,
    materialShift: materialBalance(afterFen) - materialBalance(beforeFen),
    isCheck: afterPosition.isCheck(),
    isCheckmate: afterPosition.isCheckmate(),
    capture: !!move.flags?.includes('c') || !!move.flags?.includes('e'),
    movedTo: toSquare,
    movedPieceType: movedPiece?.type ?? null,
    // Safety of the square the piece landed on, in the position that follows.
    landing: toSquare && movedPiece && movedPiece.type !== 'k'
      ? {
        attackers: afterPosition.attackers(toSquare, opponent).length,
        defenders: afterPosition.attackers(toSquare, color).length,
      }
      : null,
    before,
    after,
    lostCastlingRights: (before.rights.k || before.rights.q) && !(after.rights.k || after.rights.q) && !hasCastled(afterFen, color),
    opponentLoose: loosePieces(afterFen, opponent),
  };
}
