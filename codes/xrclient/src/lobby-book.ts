import { CanvasTexture, SRGBColorSpace, type Mesh, type MeshBasicMaterial, type Object3D, type Texture } from '@iwsdk/core';
import { getLang } from './settings.js';

/**
 * The desk menu's open book as its notice board: MY BEST on the left page,
 * ME on the right (the seat's name, class, Folds and its places on the
 * leaderboards, or a guest's Folds and how to get on the boards). Written in
 * ink over each page's own blurred pencil maths, which stay all around the
 * words; the pencil comes back when a game starts.
 */

export interface Places {
  strike?: number;
  city?: number;
}

export interface LobbyFacts {
  best?: { points: number; stars: number };
  /** A signed-in seat; a guest has none. */
  seat?: { name: string; classLabel: string; seat: number };
  folds?: number;
  buildings?: number;
  /** The seat's best points in one race the server judged. */
  raceBest?: number;
  classPlace?: Places;
  worldPlace?: Places;
  /** Why the places are missing: still asked, or no internet. */
  places?: 'loading' | 'offline' | 'ready';
}

const TEXT = {
  en: {
    best: 'MY BEST',
    pts: 'PTS',
    bestAbout: 'Best on this device.',
    noBest: 'No best yet.',
    noBestAbout: 'Finish a game to set one.',
    raceBest: 'BEST RACE',
    pick: 'Pick a game!',
    me: 'ME',
    guest: 'GUEST',
    guestAbout: 'Playing on this device.',
    seat: (label: string, n: number) => `${label}, seat ${String(n).padStart(2, '0')}`,
    folds: 'FOLDS',
    buildings: 'BUILDINGS',
    myClass: 'CLASS',
    world: 'WORLD',
    strike: 'HIGH STRIKE',
    city: 'CITY BUILDER',
    loading: 'Finding your places...',
    offline: 'Places show when online.',
    signIn: "Sign in with I'M IN A CLASS to join the leaderboards.",
  },
  id: {
    best: 'TERBAIKKU',
    pts: 'POIN',
    bestAbout: 'Terbaik di perangkat ini.',
    noBest: 'Belum ada skor terbaik.',
    noBestAbout: 'Selesaikan satu permainan.',
    raceBest: 'LOMBA TERBAIK',
    pick: 'Pilih permainan!',
    me: 'SAYA',
    guest: 'TAMU',
    guestAbout: 'Bermain di perangkat ini.',
    seat: (label: string, n: number) => `${label}, kursi ${String(n).padStart(2, '0')}`,
    folds: 'FOLDS',
    buildings: 'BANGUNAN',
    myClass: 'KELAS',
    world: 'DUNIA',
    strike: 'HIGH STRIKE',
    city: 'CITY BUILDER',
    loading: 'Mencari peringkatmu...',
    offline: 'Peringkat tampil saat online.',
    signIn: 'Masuk lewat AKU DI KELAS untuk masuk papan peringkat.',
  },
};
type Words = (typeof TEXT)['en'];

/** The page canvas, the page's own proportions (0.15 by 0.21 m) like its pencil maths. */
const W = 1024;
const H = 1434;
/** Drawn this much taller than wide: the page is seen from a slant, in the headset and on screen. */
const STRETCH = 1.8;
const INK = 'rgba(58, 63, 75, 0.94)';
const SOFT = 'rgba(58, 63, 75, 0.7)';
const TEAL = '#2f8f7d';
const GOLD = '#f2c14e';
const FONT = "'Atkinson Hyperlegible', 'Segoe UI', system-ui, sans-serif";

/** One page's ink, drawn in two passes: first a clear margin through the pencil, then the ink. */
type Stroke = (c: CanvasRenderingContext2D, halo: boolean) => void;

class Pen {
  readonly strokes: Stroke[] = [];
  constructor(
    readonly c: CanvasRenderingContext2D,
    readonly left: number,
    readonly right: number,
  ) {}

  font(size: number, weight: number): string {
    return `${weight} ${size}px ${FONT}`;
  }

  width(text: string, size: number, weight: number): number {
    this.c.font = this.font(size, weight);
    return this.c.measureText(text).width;
  }

  /** `text` at `x`, its baseline at `y`, shrunk to fit `max` wide; returns its width. */
  text(text: string, x: number, y: number, size: number, weight: number, colour = INK, align: CanvasTextAlign = 'left', max = align === 'left' ? this.right - x : x - this.left): number {
    const wide = this.width(text, size, weight);
    const fit = wide > max ? (size * max) / wide : size;
    const font = this.font(fit, weight);
    this.strokes.push((c, halo) => {
      c.font = font;
      c.textAlign = align;
      if (halo) c.strokeText(text, x, y);
      else {
        c.fillStyle = colour;
        c.fillText(text, x, y);
      }
    });
    return Math.min(wide, max);
  }

  /** Lines of `text` wrapped to the page; returns the baseline after the last. */
  para(text: string, y: number, size: number, weight: number, step: number, colour = INK): number {
    this.c.font = this.font(size, weight);
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && this.c.measureText(next).width > this.right - this.left) {
        this.text(line, this.left, y, size, weight, colour);
        y += step;
        line = word;
      } else line = next;
    }
    if (line) this.text(line, this.left, y, size, weight, colour);
    return y + step;
  }

  /** A pencil line, a little wavy like a hand drew it. */
  line(x0: number, y: number, x1: number, width: number, colour = INK): void {
    this.strokes.push((c, halo) => {
      if (halo) return;
      c.strokeStyle = colour;
      c.lineWidth = width;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x0, y);
      c.quadraticCurveTo((x0 + x1) / 2, y + 6, x1, y - 2);
      c.stroke();
    });
  }

  /** A heading with its underline. */
  head(text: string, y: number): void {
    const w = this.text(text, this.left, y, 96, 800);
    this.line(this.left, y + 24, this.left + w, 7, TEAL);
  }

  /** A label on the left and its value on the right, a faint dotted line between. */
  row(label: string, value: string, y: number): void {
    const lw = this.text(label, this.left, y, 62, 800, SOFT);
    const vw = this.width(value, 84, 800);
    this.text(value, this.right, y, 84, 800, INK, 'right');
    const from = this.left + lw + 24;
    const to = this.right - vw - 24;
    if (to > from)
      this.strokes.push((c, halo) => {
        if (halo) return;
        c.fillStyle = 'rgba(58, 63, 75, 0.35)';
        for (let x = from; x < to; x += 22) c.fillRect(x, y - 8, 6, 6);
      });
  }

  /** A five-point star, gold when won, outlined in ink. */
  star(x: number, y: number, r: number, won: boolean): void {
    this.strokes.push((c, halo) => {
      c.beginPath();
      for (let i = 0; i < 10; i += 1) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const d = i % 2 === 0 ? r : r * 0.45;
        c.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
      }
      c.closePath();
      if (halo) return void c.stroke();
      if (won) {
        c.fillStyle = GOLD;
        c.fill();
      }
      c.strokeStyle = INK;
      c.lineWidth = 5;
      c.lineJoin = 'round';
      c.stroke();
    });
  }

  /** The page: its pencil, a clear margin through it round every word, then the ink. */
  draw(pencil?: CanvasImageSource): void {
    const c = this.c;
    c.clearRect(0, 0, W, H);
    if (pencil) c.drawImage(pencil, 0, 0, W, H);
    c.save();
    c.scale(1, STRETCH);
    c.textBaseline = 'alphabetic';
    c.globalCompositeOperation = 'destination-out';
    c.strokeStyle = '#000';
    c.lineWidth = 26;
    c.lineJoin = 'round';
    c.filter = 'blur(6px)';
    for (const s of this.strokes) s(c, true);
    c.filter = 'none';
    c.globalCompositeOperation = 'source-over';
    for (const s of this.strokes) s(c, false);
    c.restore();
  }
}

function leftPage(pen: Pen, t: Words, f: LobbyFacts): void {
  pen.head(t.best, 110);
  if (f.best) {
    const w = pen.text(String(f.best.points), pen.left, 330, 230, 800, TEAL);
    pen.text(t.pts, pen.left + w + 24, 330, 84, 800);
    for (let i = 0; i < 3; i += 1) pen.star(pen.left + 58 + i * 132, 440, 52, i < f.best.stars);
    pen.text(t.bestAbout, pen.left, 560, 62, 700, SOFT);
  } else {
    pen.para(t.noBest, 260, 84, 800, 96);
    pen.para(t.noBestAbout, 470, 62, 700, 76, SOFT);
  }
  if (f.raceBest !== undefined) pen.row(t.raceBest, `${f.raceBest}`, 660);
  const w = pen.text(t.pick, pen.left, 765, 72, 800);
  pen.line(pen.left, 788, pen.left + w, 5, SOFT);
}

function rightPage(pen: Pen, t: Words, f: LobbyFacts): void {
  pen.head(t.me, 110);
  pen.text(f.seat ? f.seat.name.toUpperCase() : t.guest, pen.left, 240, 116, 800, TEAL);
  if (f.seat) pen.text(t.seat(f.seat.classLabel, f.seat.seat), pen.left, 315, 60, 700, SOFT);
  let y = f.seat ? 400 : 380;
  if (f.folds !== undefined) {
    pen.row(t.folds, String(f.folds), y);
    pen.row(t.buildings, String(f.buildings ?? 0), y + 95);
    y += 205;
  }
  if (!f.seat) return void pen.para(t.signIn, y, 62, 700, 76);
  if (f.places !== 'ready') return void pen.para(f.places === 'offline' ? t.offline : t.loading, y, 62, 700, 76, SOFT);
  // A small table: the seat's place in its class and in the world, on two boards.
  const col = [pen.right - 250, pen.right];
  pen.text(t.myClass, col[0], y, 52, 800, SOFT, 'right');
  pen.text(t.world, col[1], y, 52, 800, SOFT, 'right');
  const place = (n?: number) => (n ? `#${n}` : '-');
  const rows: [string, keyof Places][] = [
    [t.strike, 'strike'],
    [t.city, 'city'],
  ];
  rows.forEach(([label, key], i) => {
    const at = y + 75 + i * 80;
    pen.text(label, pen.left, at, 58, 800, INK, 'left', col[0] - 170 - pen.left);
    pen.text(place(f.classPlace?.[key]), col[0], at, 76, 800, TEAL, 'right');
    pen.text(place(f.worldPlace?.[key]), col[1], at, 76, 800, TEAL, 'right');
  });
}

interface Page {
  sheet: Mesh;
  canvas: HTMLCanvasElement;
  texture: CanvasTexture;
  pencil: Texture | null;
  key: string;
}

/** The book's pencil page on a side (-1 left), with the pencil it was made with kept on it. */
export function bookPage(book: Object3D | undefined, side: number): { sheet: Mesh; pencil: Texture | null } | undefined {
  const sheet = book?.children.find((o) => o.name === 'page-sketch' && Math.sign(o.position.x) === side) as Mesh | undefined;
  if (!sheet) return undefined;
  const paper = sheet.material as MeshBasicMaterial;
  sheet.userData.pencil ??= paper.map;
  return { sheet, pencil: sheet.userData.pencil as Texture | null };
}

export class LobbyBook {
  private pages: Page[] = [];

  constructor(private readonly book: () => Object3D | undefined) {}

  /** Writes the facts on both pages; redrawn only when they change. */
  write(f: LobbyFacts): void {
    const t = TEXT[getLang() === 'id' ? 'id' : 'en'];
    const key = JSON.stringify([getLang(), f]);
    [-1, 1].forEach((side, i) => {
      const page = this.page(side, i);
      if (!page) return;
      if (page.key !== key) {
        page.key = key;
        const c = page.canvas.getContext('2d')!;
        // Clear of the spine: the left page's on its right, the right page's on its left.
        const pen = side < 0 ? new Pen(c, 92, 900) : new Pen(c, 130, 940);
        (side < 0 ? leftPage : rightPage)(pen, t, f);
        pen.draw(page.pencil?.image as CanvasImageSource | undefined);
        page.texture.needsUpdate = true;
      }
      const paper = page.sheet.material as MeshBasicMaterial;
      if (paper.map !== page.texture) {
        paper.map = page.texture;
        paper.needsUpdate = true;
      }
    });
  }

  /** Gives both pages their pencil maths back. */
  erase(): void {
    for (const p of this.pages) {
      const paper = p.sheet.material as MeshBasicMaterial;
      if (paper.map === p.texture) {
        paper.map = p.pencil;
        paper.needsUpdate = true;
      }
    }
  }

  private page(side: number, i: number): Page | undefined {
    const found = bookPage(this.book(), side);
    if (!found) return undefined;
    if (this.pages[i]?.sheet === found.sheet) return this.pages[i];
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    // Sharp at the slant the page is seen from (clamped to what the device has).
    texture.anisotropy = 16;
    this.pages[i]?.texture.dispose();
    this.pages[i] = { sheet: found.sheet, canvas, texture, pencil: found.pencil, key: '' };
    return this.pages[i];
  }
}
