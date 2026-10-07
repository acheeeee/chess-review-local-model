import { CENTER_SQUARES, moveFacts } from './facts.js';

/**
 * Rule-based strategy commentary.
 *
 * These sentences are *inferred*: they are produced by fixed rules over board
 * facts, not by the engine and not by a language model. Every sentence must
 * quote the counts it is based on so the reader can verify it on the board, and
 * the UI must label them as inferences. If a rule cannot cite evidence, it does
 * not belong here.
 */

const PIECE_LABELS = { p: '兵', n: '騎士', b: '主教', r: '城堡', q: '皇后', k: '國王' };
const MAX_SIGNALS = 3;
const OPENING_PLY = 20;

const side = (color) => (color === 'w' ? '白方' : '黑方');
const label = (type) => PIECE_LABELS[type] ?? '子';
const fileOf = (square) => square[0];

function safetySignals(facts) {
  const signals = [];
  if (facts.landing && facts.landing.attackers > facts.landing.defenders) {
    signals.push({
      priority: 1,
      text: `剛走到 ${facts.movedTo} 的${label(facts.movedPieceType)}被 ${facts.landing.attackers} 子攻擊、只有 ${facts.landing.defenders} 子保護，對手可能先處理這個子。`,
    });
  }
  const newLoose = facts.after.loose.filter((piece) => piece.square !== facts.movedTo
    && !facts.before.loose.some((old) => old.square === piece.square));
  if (newLoose.length) {
    const piece = newLoose[0];
    signals.push({
      priority: 2,
      text: `這步後 ${piece.square} 的${label(piece.type)}變成 ${piece.attackers} 攻 ${piece.defenders} 守，容易成為戰術目標。`,
    });
  }
  return signals;
}

function kingSignals(facts) {
  const signals = [];
  if (facts.lostCastlingRights) {
    signals.push({ priority: 2, text: `這步讓${side(facts.color)}失去易位權，國王短期內只能留在原地。` });
  }
  if (facts.after.shield.pawns < facts.before.shield.pawns) {
    signals.push({
      priority: 3,
      text: `國王前方的兵從 ${facts.before.shield.pawns} 個減為 ${facts.after.shield.pawns} 個，王的周圍更開放。`,
    });
  } else if (!facts.before.shield.openFile && facts.after.shield.openFile && facts.after.shield.square) {
    signals.push({
      priority: 3,
      text: `國王所在的 ${fileOf(facts.after.shield.square)} 列已經沒有自己的兵，對手的直線攻擊更容易展開。`,
    });
  }
  return signals;
}

function pawnSignals(facts) {
  const signals = [];
  const before = facts.before.pawns;
  const after = facts.after.pawns;
  if (after.doubled > before.doubled) {
    const file = after.doubledFiles.find((name) => !before.doubledFiles.includes(name)) ?? after.doubledFiles[0];
    signals.push({ priority: 3, text: `這步造成 ${file} 列疊兵（疊兵數 ${before.doubled} → ${after.doubled}），這一列的兵較難推進。` });
  }
  if (after.isolated > before.isolated) {
    const file = after.isolatedFiles.find((name) => !before.isolatedFiles.includes(name)) ?? after.isolatedFiles[0];
    signals.push({ priority: 3, text: `${file} 兵變成孤兵（孤兵數 ${before.isolated} → ${after.isolated}），少了同伴兵的保護。` });
  }
  if (after.passed > before.passed) {
    const square = after.passedSquares.find((name) => !before.passedSquares.includes(name)) ?? after.passedSquares[0];
    signals.push({ priority: 2, text: `${side(facts.color)}多了一個通兵（${square}），殘局時更有機會。` });
  }
  return signals;
}

function spaceSignals(facts, ply) {
  const signals = [];
  const delta = facts.after.center - facts.before.center;
  if (Math.abs(delta) >= 2) {
    signals.push({
      priority: 4,
      text: delta > 0
        ? `對中心四格（${CENTER_SQUARES.join('／')}）的控制從 ${facts.before.center} 增加到 ${facts.after.center}，中央空間變大。`
        : `對中心四格（${CENTER_SQUARES.join('／')}）的控制從 ${facts.before.center} 降到 ${facts.after.center}，中央主導權讓了出去。`,
    });
  }
  if (ply <= OPENING_PLY && facts.after.minors > facts.before.minors) {
    signals.push({
      priority: 4,
      text: `開局階段又出動一個子（已出動的騎士與主教 ${facts.before.minors} → ${facts.after.minors}）。`,
    });
  }
  return signals;
}

function opportunitySignals(facts) {
  const target = facts.opponentLoose.find((piece) => piece.attackers > piece.defenders);
  if (!target) return [];
  return [{
    priority: 2,
    text: `對手的 ${target.square} ${label(target.type)}目前 ${target.attackers} 攻 ${target.defenders} 守，接下來值得算一下這個目標。`,
  }];
}

/**
 * Rule-based sentences for one ReviewMove. Returns at most `MAX_SIGNALS`
 * strings, highest priority first; an empty array is a valid, honest answer.
 */
export function inferredSignals(move) {
  if (!move?.beforeFen || !move?.afterFen) return [];
  const facts = moveFacts(move);
  if (facts.isCheckmate) return [];
  const signals = [
    ...safetySignals(facts),
    ...kingSignals(facts),
    ...pawnSignals(facts),
    ...opportunitySignals(facts),
    ...spaceSignals(facts, move.ply ?? 1),
  ];
  return signals
    .sort((left, right) => left.priority - right.priority)
    .slice(0, MAX_SIGNALS)
    .map((signal) => signal.text);
}

/** Facts that come straight from the engine's own main line. */
export function pvSignals(move) {
  const moves = move?.pv?.moves ?? [];
  if (!moves.length) return [];
  const lines = [];
  const mateIndex = moves.findIndex((entry) => entry.san.endsWith('#'));
  if (mateIndex >= 0) lines.push(`引擎主變例在 ${mateIndex + 1} 步內將死（${moves.slice(0, mateIndex + 1).map((entry) => entry.san).join(' ')}）。`);
  else if (moves[0].san.includes('x')) lines.push(`引擎主變例以吃子 ${moves[0].san} 開始。`);
  return lines;
}
