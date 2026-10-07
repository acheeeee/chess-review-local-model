/**
 * Original vector piece set drawn for this project in a 45x45 box.
 * They are deliberately hand-made so the app ships no third-party artwork and
 * needs no network request or extra licence obligation.
 */

const PAWN = [
  { d: 'M22.5 10c-2.9 0-5.3 2.4-5.3 5.3 0 1.4.6 2.7 1.5 3.6-2.3 1.3-3.9 3.8-3.9 6.6 0 2.4 1.2 4.1 2.4 5.3 1 1 1.6 1.9 1.8 3.2h-5.6c-1.1 0-2 .9-2 2v2.5h22.8V36c0-1.1-.9-2-2-2H26c.2-1.3.8-2.2 1.8-3.2 1.2-1.2 2.4-2.9 2.4-5.3 0-2.8-1.6-5.3-3.9-6.6.9-.9 1.5-2.2 1.5-3.6 0-2.9-2.4-5.3-5.3-5.3z' },
];

const ROOK = [
  { d: 'M13.5 15.9V9.6c0-.4.3-.7.7-.7h2.9c.4 0 .7.3.7.7V12h3.4V9.6c0-.4.3-.7.7-.7h2.2c.4 0 .7.3.7.7V12h3.4V9.6c0-.4.3-.7.7-.7h2.9c.4 0 .7.3.7.7v6.3h-19z' },
  { d: 'M12.5 19.5v-2.7c0-.5.4-.9.9-.9h18.2c.5 0 .9.4.9.9v2.7h-20z' },
  { d: 'M15 31.5v-12h15v12H15z' },
  { d: 'M13.5 33.7v-2.2h18v2.2h-18z' },
  { d: 'M11.5 37.5v-2.8c0-.6.4-1 1-1h20c.6 0 1 .4 1 1v2.8h-22z' },
];

const KNIGHT = [
  { d: 'M13.4 37.5c-.4-4.8.5-9 2.6-12.6.4-.7-.3-1.5-1.1-1.2l-2.2.9c-1.7.6-3.5.1-4.2-1.4-.7-1.7.3-3.6 2.1-5.2 2-1.8 3.8-3.9 5.3-6.4l2.4-4 1.5 2.9 2.7-2.6 1.6 3.4c-1.1.4-2 1.2-2.2 2.4-.2 1.3.4 2.4 1.4 3 3 2.1 6.2 4.8 8 9.4 1.3 3.4 1.9 7.1 1.9 11.4h-19.4z' },
  { circle: { cx: 17.2, cy: 16.6, r: 1.1 } },
];

const BISHOP = [
  { circle: { cx: 22.5, cy: 9.4, r: 2 } },
  { d: 'M22.5 11.6c-3.4 2.9-6.6 7-6.6 11.3 0 2.3 1.1 3.9 2.3 5.1h8.6c1.2-1.2 2.3-2.8 2.3-5.1 0-4.3-3.2-8.4-6.6-11.3z' },
  { line: { d: 'M24.6 15.6l-3.6 4', width: 1.5 } },
  { d: 'M14.8 34.3c-1.4 0-2.4-1.3-1.9-2.6.3-.9 1.3-1.3 2.2-1 1.6.5 3.4.8 5.4.8h4c2 0 3.8-.3 5.4-.8.9-.3 1.9.1 2.2 1 .5 1.3-.5 2.6-1.9 2.6H14.8z' },
  { d: 'M11.5 37.5v-2c0-.6.4-1 1-1h20c.6 0 1 .4 1 1v2h-22z' },
];

const QUEEN = [
  { d: 'M9.5 14.2l3.3 6.9h19.4l3.3-6.9-5.7 3.9-3.4-6.7-4 6.9-4-6.9-3.4 6.7-5.5-3.9z' },
  { circle: { cx: 9.5, cy: 12.4, r: 2.1 } },
  { circle: { cx: 15.6, cy: 10.9, r: 2.1 } },
  { circle: { cx: 22.5, cy: 9.6, r: 2.2 } },
  { circle: { cx: 29.4, cy: 10.9, r: 2.1 } },
  { circle: { cx: 35.5, cy: 12.4, r: 2.1 } },
  { d: 'M12.8 21.1h19.4c.7 0 1.2.6 1.1 1.3l-1.5 8.7c-.1.6-.6 1-1.2 1H14.4c-.6 0-1.1-.4-1.2-1l-1.5-8.7c-.1-.7.4-1.3 1.1-1.3z' },
  { d: 'M13.2 32.1h18.6l.6 2.2H12.6l.6-2.2z' },
  { d: 'M11.5 37.5v-2.2c0-.6.4-1 1-1h20c.6 0 1 .4 1 1v2.2h-22z' },
];

const KING = [
  { d: 'M21.2 6h2.6v3h3v2.6h-3v3.2h-2.6v-3.2h-3V9h3V6z' },
  { d: 'M22.5 14.6c-5.6 0-10.1 3.7-10.1 8.3 0 1.6.5 3 1.3 4.2l2.3-5.3 1.4 6.5h10.2l1.4-6.5 2.3 5.3c.8-1.2 1.3-2.6 1.3-4.2 0-4.6-4.5-8.3-10.1-8.3z' },
  { d: 'M16.6 28.3h11.8l.5 2.4H16.1l.5-2.4z' },
  { line: { d: 'M15.6 25.4c2.3-2.1 4.6-3.2 6.9-3.2s4.6 1.1 6.9 3.2', width: 1.5 } },
  { d: 'M13.1 31.1h18.8c.6 0 1 .5.9 1.1l-.4 2.3H12.6l-.4-2.3c-.1-.6.3-1.1.9-1.1z' },
  { d: 'M11.5 37.5v-2.3c0-.6.4-1 1-1h20c.6 0 1 .4 1 1v2.3h-22z' },
];

const SHAPES = { p: PAWN, r: ROOK, n: KNIGHT, b: BISHOP, q: QUEEN, k: KING };

export const PIECE_NAMES = { p: '兵', n: '騎士', b: '主教', r: '城堡', q: '皇后', k: '國王' };

export function Piece({ type, color }) {
  const shapes = SHAPES[type];
  if (!shapes) return null;
  return <svg className={`piece piece-${color}`} viewBox="0 0 45 45" aria-hidden="true" focusable="false">
    {shapes.map((shape, index) => {
      if (shape.circle) return <circle key={index} {...shape.circle} className="piece-fill" />;
      if (shape.line) return <path key={index} d={shape.line.d} className="piece-line" strokeWidth={shape.line.width ?? 1.9} />;
      return <path key={index} d={shape.d} className="piece-fill" opacity={shape.opacity} />;
    })}
  </svg>;
}
