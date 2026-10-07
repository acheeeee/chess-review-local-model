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
 * All lines the user may preview for one move: after a deep re-analysis these
 * are the MultiPV candidates, otherwise just the engine main line.
 */
export function candidateLines(reviewMove) {
  if (!reviewMove) return [];
  const deepLines = reviewMove.deep?.lines ?? [];
  if (deepLines.length) {
    return deepLines
      .filter((line) => line.pv.moves.length)
      .map((line) => ({
        key: `deep-${line.rank}`,
        rank: line.rank,
        san: line.san,
        evaluation: line.evaluation,
        lossCp: line.lossCp,
        depth: line.depth,
        deep: true,
        moves: line.pv.moves,
        error: line.pv.error,
      }));
  }
  if (!reviewMove.pv?.moves?.length) return [];
  return [{
    key: 'pv',
    rank: 1,
    san: reviewMove.bestSan,
    evaluation: reviewMove.best,
    lossCp: 0,
    depth: reviewMove.best?.depth ?? null,
    deep: false,
    moves: reviewMove.pv.moves,
    error: reviewMove.pv.error,
  }];
}

/**
 * Variation preview is an explicit second mode on top of `selectedPly`:
 * `null` means "show the real game"; `{ key, step }` means "show step `step` of
 * candidate line `key`".
 */
export function variationView(reviewMove, selection) {
  const lines = candidateLines(reviewMove);
  if (!reviewMove || !selection || !lines.length) return null;
  const line = lines.find((candidate) => candidate.key === selection.key) ?? lines[0];
  const step = Math.max(0, Math.min(line.moves.length - 1, selection.step ?? 0));
  const entry = line.moves[step];
  return {
    key: line.key,
    rank: line.rank,
    step,
    fen: entry.afterFen,
    lastMoveUci: entry.uci,
    san: entry.san,
    lineSan: line.san,
    evaluation: line.evaluation,
    lines,
    line,
    isLast: step === line.moves.length - 1,
  };
}

/** Board + highlights for the current selection, including variation preview. */
export function interactiveBoard(game, analysisByPly, { selectedPly, orientation = 'w', variation: selection = null }) {
  const analysis = analysisAt(analysisByPly, selectedPly);
  const variation = variationView(analysis, selection);
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
