import { Chess } from 'chess.js';
import { START_PLY, analysisAt, moveAtPly } from './review.js';

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
export const RANKS = [8, 7, 6, 5, 4, 3, 2, 1];

function squaresOf(uci) {
  if (!uci || uci.length < 4) return [null, null];
  return [uci.slice(0, 2), uci.slice(2, 4)];
}

/**
 * Pure board description for the dumb <Board> component: squares already in
 * display order, with highlight flags and the coordinate labels that belong to
 * the current orientation.
 */
export function boardView(fen, { orientation = 'w', lastMove = null, suggestion = null } = {}) {
  const board = new Chess(fen).board();
  const [lastFrom, lastTo] = squaresOf(lastMove);
  const [bestFrom, bestTo] = squaresOf(suggestion);
  const files = orientation === 'b' ? [...FILES].reverse() : FILES;
  const ranks = orientation === 'b' ? [...RANKS].reverse() : RANKS;
  const squares = [];
  ranks.forEach((rank, row) => {
    files.forEach((file, column) => {
      const square = `${file}${rank}`;
      const piece = board[8 - rank][FILES.indexOf(file)];
      squares.push({
        square,
        piece: piece ? { type: piece.type, color: piece.color } : null,
        // a1 is dark: file index + rank is odd on dark squares.
        dark: (FILES.indexOf(file) + rank) % 2 === 1,
        rankLabel: column === 0 ? String(rank) : null,
        fileLabel: row === 7 ? file : null,
        isLastFrom: square === lastFrom,
        isLastTo: square === lastTo,
        isSuggestionFrom: square === bestFrom,
        isSuggestionTo: square === bestTo,
      });
    });
  });
  return { orientation, squares };
}

/** Navigation always returns a ply inside the game, so callers cannot drift. */
export function stepPly(game, ply, delta) {
  if (!game) return START_PLY;
  return Math.max(START_PLY, Math.min(game.lastPly, ply + delta));
}

export function canStep(game, ply, delta) {
  return !!game && stepPly(game, ply, delta) !== ply;
}

/**
 * Move list rows grouped by full move. A PGN that starts with Black to move
 * leaves the white cell empty instead of shifting the pairing.
 */
export function moveRows(game, analysisByPly = {}) {
  if (!game) return [];
  const rows = [];
  for (const move of game.moves) {
    const cell = { move, analysis: analysisAt(analysisByPly, move.ply) };
    const last = rows.at(-1);
    if (last && last.fullmove === move.fullmove && move.color === 'b' && !last.black) last.black = cell;
    else rows.push({ fullmove: move.fullmove, white: move.color === 'w' ? cell : null, black: move.color === 'b' ? cell : null });
  }
  return rows;
}

/** The engine main line of one ReviewMove, as selectable steps. */
export function variationLine(reviewMove) {
  if (!reviewMove) return [];
  return reviewMove.pv.moves.map((entry, index) => ({
    index,
    san: entry.san,
    uci: entry.uci,
    fen: entry.afterFen,
    color: index % 2 === 0 ? reviewMove.color : (reviewMove.color === 'w' ? 'b' : 'w'),
  }));
}

/**
 * Variation preview is an explicit second mode on top of `selectedPly`: index
 * `null` means "show the real game", a number means "show the engine line".
 */
export function variationView(reviewMove, index) {
  const line = variationLine(reviewMove);
  if (!reviewMove || index === null || index === undefined || !line.length) return null;
  const clamped = Math.max(0, Math.min(line.length - 1, index));
  const step = line[clamped];
  return { index: clamped, fen: step.fen, lastMoveUci: step.uci, san: step.san, line, isLast: clamped === line.length - 1 };
}

/** Board + highlights for the current selection, including variation preview. */
export function interactiveBoard(game, analysisByPly, { selectedPly, orientation = 'w', variationIndex = null }) {
  const analysis = analysisAt(analysisByPly, selectedPly);
  const variation = variationView(analysis, variationIndex);
  if (variation) {
    // In preview mode the highlighted squares belong to the engine line, which
    // is why the UI must label this board as a variation, not as the game.
    return {
      fen: variation.fen,
      view: boardView(variation.fen, { orientation, suggestion: variation.lastMoveUci }),
      variation,
      analysis,
    };
  }
  const move = moveAtPly(game, selectedPly);
  const fen = move?.afterFen ?? game?.initialFen ?? new Chess().fen();
  return {
    fen,
    // Only the move actually played is highlighted here; the engine suggestion
    // belongs to the pre-move position and is shown through the variation.
    view: boardView(fen, { orientation, lastMove: move?.uci ?? null }),
    variation: null,
    analysis,
  };
}
