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

export function scoreToWhiteCp(result) {
  if (result.mate !== null) return Math.sign(result.mate || 1) * (100000 - Math.min(999, Math.abs(result.mate)) * 100);
  return result.cp ?? 0;
}

export function whiteWinChance(whiteCp) {
  // Smooth centipawn-to-expected-score conversion, intentionally conservative.
  return 100 / (1 + Math.exp(-whiteCp / 260));
}

export function classify(loss) {
  if (loss <= 15) return { label: '最佳著', tone: 'best' };
  if (loss <= 45) return { label: '好著', tone: 'good' };
  if (loss <= 100) return { label: '可改進', tone: 'inaccuracy' };
  if (loss <= 250) return { label: '失誤', tone: 'mistake' };
  return { label: '大失誤', tone: 'blunder' };
}

function formatEval(whiteCp) {
  if (Math.abs(whiteCp) > 90000) return whiteCp > 0 ? '白方將殺優勢' : '黑方將殺優勢';
  const sign = whiteCp > 0 ? '+' : '';
  return `${sign}${(whiteCp / 100).toFixed(2)}（白方）`;
}

export function makeInsight(item) {
  const side = item.color === 'w' ? '白方' : '黑方';
  const direction = item.afterWhiteCp >= 0 ? '白方' : '黑方';
  if (item.classification.tone === 'best') return `${side}下出接近引擎首選的 ${item.san}。局面評估為 ${formatEval(item.afterWhiteCp)}，${direction}稍佔優勢。`;
  const drop = (item.loss / 100).toFixed(2);
  return `${side}的 ${item.san} 讓局面少了約 ${drop} 兵的評估；引擎偏好 ${item.bestSan}。走後評估 ${formatEval(item.afterWhiteCp)}，勝率明顯往${direction}傾斜。`;
}
