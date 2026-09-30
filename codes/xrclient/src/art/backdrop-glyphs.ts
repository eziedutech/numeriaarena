/**
 * Numbers and math signs folded from paper ribbon, painted into the browser
 * backdrop like a faded wallpaper print. They are part of the wall texture,
 * not objects: nothing to point at, no hover, always behind the play area.
 * They stay faint, soft and still, at the edges of the view, so the bright
 * crisp paper in front is what reads as something to touch.
 */

type Pt = [number, number];
/** A glyph: ribbon strokes on a 2 by 4 grid (y down), and small squares (dots). */
interface Glyph {
  strokes: Pt[][];
  dots?: Pt[];
}

const GLYPHS: Record<string, Glyph> = {
  '0': { strokes: [[[0, 0], [2, 0], [2, 4], [0, 4], [0, 0]]] },
  '1': { strokes: [[[0.4, 0.9], [1.2, 0], [1.2, 4]]] },
  '2': { strokes: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 4], [2, 4]]] },
  '3': { strokes: [[[0, 0], [2, 0], [2, 4], [0, 4]], [[0.6, 2], [2, 2]]] },
  '4': { strokes: [[[0, 0], [0, 2.6], [2, 2.6]], [[1.5, 1.2], [1.5, 4]]] },
  '5': { strokes: [[[2, 0], [0, 0], [0, 2], [2, 2], [2, 4], [0, 4]]] },
  '6': { strokes: [[[2, 0], [0, 0], [0, 4], [2, 4], [2, 2], [0, 2]]] },
  '7': { strokes: [[[0, 0], [2, 0], [0.9, 4]]] },
  '8': { strokes: [[[0, 2], [0, 0], [2, 0], [2, 4], [0, 4], [0, 2], [2, 2]]] },
  '9': { strokes: [[[2, 2], [0, 2], [0, 0], [2, 0], [2, 4], [0, 4]]] },
  '+': { strokes: [[[1, 0.9], [1, 3.1]], [[0, 2], [2, 2]]] },
  '-': { strokes: [[[0, 2], [2, 2]]] },
  x: { strokes: [[[0.2, 1], [1.8, 3]], [[1.8, 1], [0.2, 3]]] },
  div: { strokes: [[[0, 2], [2, 2]]], dots: [[1, 0.9], [1, 3.1]] },
  '=': { strokes: [[[0, 1.4], [2, 1.4]], [[0, 2.6], [2, 2.6]]] },
  '%': { strokes: [[[1.8, 0.5], [0.2, 3.5]]], dots: [[0.4, 0.8], [1.6, 3.2]] },
};

/**
 * Where each ornament goes: glyph, x and y of its centre (fractions of the
 * canvas), height (fraction of the canvas height), tilt (radians) and colour.
 * Kept to the top band and the far sides, away from the book, the rows of
 * answers and the rival windows.
 */
const PLACES: [string, number, number, number, number, string][] = [
  ['3', 0.06, 0.12, 0.13, -0.15, '#3469c4'],
  ['+', 0.16, 0.05, 0.07, 0.2, '#f2716b'],
  ['7', 0.27, 0.13, 0.1, 0.12, '#3fb6a0'],
  ['=', 0.37, 0.05, 0.06, -0.1, '#b198ea'],
  ['2', 0.63, 0.06, 0.09, -0.12, '#f2716b'],
  ['x', 0.73, 0.14, 0.07, 0.25, '#3469c4'],
  ['5', 0.84, 0.07, 0.12, 0.1, '#b198ea'],
  ['%', 0.95, 0.17, 0.08, -0.2, '#3fb6a0'],
  ['div', 0.03, 0.34, 0.07, 0.1, '#b198ea'],
  ['9', 0.97, 0.36, 0.1, 0.15, '#f2716b'],
  ['1', 0.04, 0.9, 0.12, 0.2, '#3fb6a0'],
  ['-', 0.14, 0.95, 0.05, -0.1, '#3469c4'],
  ['8', 0.87, 0.9, 0.11, -0.15, '#3469c4'],
  ['4', 0.96, 0.78, 0.09, 0.1, '#f2716b'],
  ['6', 0.5, 0.05, 0.07, 0.05, '#3fb6a0'],
  ['0', 0.21, 0.27, 0.06, -0.2, '#f2716b'],
  ['+', 0.8, 0.28, 0.06, 0.1, '#3fb6a0'],
];

/** How strongly the ornaments show over the wall; faint on purpose. */
const STRENGTH = 0.26;

function mix(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k));
  return `rgb(${f((n >> 16) & 255)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

/**
 * One glyph as a folded ribbon: each straight run is a strip, lighter and
 * darker in turn as the ribbon folds, with a small fold triangle at each turn.
 */
function drawGlyph(c: CanvasRenderingContext2D, g: Glyph, unit: number, color: string): void {
  const band = unit * 0.8;
  const light = mix(color, 0.2);
  const dark = mix(color, -0.18);
  const fold = mix(color, -0.32);
  const at = ([x, y]: Pt): Pt => [(x - 1) * unit, (y - 2) * unit];
  c.lineWidth = band;
  c.lineCap = 'square';
  c.lineJoin = 'miter';
  let n = 0;
  for (const stroke of g.strokes) {
    for (let i = 0; i + 1 < stroke.length; i += 1) {
      const [ax, ay] = at(stroke[i]);
      const [bx, by] = at(stroke[i + 1]);
      c.strokeStyle = n % 2 === 0 ? light : dark;
      c.beginPath();
      c.moveTo(ax, ay);
      c.lineTo(bx, by);
      c.stroke();
      n += 1;
    }
    // The crease where the ribbon turns: half the corner square, darker.
    for (let i = 1; i + 1 < stroke.length; i += 1) {
      const [x, y] = at(stroke[i]);
      const h = band / 2;
      c.fillStyle = fold;
      c.beginPath();
      c.moveTo(x - h, y - h);
      c.lineTo(x + h, y + h);
      c.lineTo(x - h, y + h);
      c.closePath();
      c.fill();
    }
  }
  c.fillStyle = light;
  for (const d of g.dots ?? []) {
    const [x, y] = at(d);
    c.fillRect(x - band / 2, y - band / 2, band, band);
  }
}

/** Paints every ornament onto the backdrop canvas `c` of `w` by `h` pixels. */
export function paintBackdropGlyphs(c: CanvasRenderingContext2D, w: number, h: number): void {
  for (const [key, x, y, size, tilt, color] of PLACES) {
    const g = GLYPHS[key];
    const unit = (size * h) / 4;
    // Each glyph is folded whole on its own sheet first, so overlapping
    // strips stay one opaque ribbon, and only then laid faintly on the wall.
    const side = Math.ceil(unit * 7);
    const sheet = document.createElement('canvas');
    sheet.width = side;
    sheet.height = side;
    const s = sheet.getContext('2d')!;
    s.translate(side / 2, side / 2);
    s.rotate(tilt);
    // A soft warm shadow down and to the right, as the paper in front has.
    s.save();
    s.translate(unit * 0.12, unit * 0.2);
    s.filter = `blur(${Math.max(1, unit * 0.12)}px)`;
    s.globalAlpha = 0.35;
    drawGlyph(s, g, unit, '#6b5a3a');
    s.restore();
    drawGlyph(s, g, unit, color);
    c.save();
    c.globalAlpha = STRENGTH;
    // Slightly out of focus, like a print on the far wall.
    c.filter = 'blur(1px)';
    c.drawImage(sheet, x * w - side / 2, y * h - side / 2);
    c.restore();
  }
}
