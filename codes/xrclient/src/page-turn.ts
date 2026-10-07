import { FrontSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, type Material, type Object3D, type Texture } from '@iwsdk/core';
import { PAGE_D, PAGE_TOP, PAGE_W } from './art/models.js';
import { bookPage } from './lobby-book.js';

/**
 * A page of the desk book turning over from right to left, as each new
 * creature comes: a sheet of the book's own paper with the right page's
 * pencil on its face and the left page's on its back, so it lands looking
 * like the left page and leaves the right page as a fresh one.
 */

/** How long a page takes to turn over. */
export const PAGE_TURN_S = 0.7;
/** The page's middle off the spine, as the book's pencil pages are. */
const PAGE_X = 0.09;
/** Just over the pages, so the sheet lies on them without flicker. */
const PAGE_LIFT = 0.0012;
const PAPER_FALLBACK = 0xfff8ec;

interface Turn {
  pivot: Group;
  t: number;
  covered: boolean;
  onCover?: () => void;
  onLand?: () => void;
}

export class PageTurn {
  private turns: Turn[] = [];

  constructor(private readonly book: () => Object3D | undefined) {}

  /**
   * Turns a page over. `onCover` runs as it stands up over the spine, the
   * moment anything there is hidden under it; `onLand` once it lies on the left.
   */
  turn(onCover?: () => void, onLand?: () => void): void {
    const book = this.book();
    if (!book) {
      onCover?.();
      onLand?.();
      return;
    }
    const paper = bookPaper(book);
    const pivot = new Group();
    pivot.name = 'page-turn';
    pivot.position.set(0, PAGE_TOP + PAGE_LIFT, 0);
    pivot.add(face(paper, bookPage(book, 1)?.pencil ?? null, false), face(paper, bookPage(book, -1)?.pencil ?? null, true));
    book.add(pivot);
    this.turns.push({ pivot, t: 0, covered: false, onCover, onLand });
  }

  update(delta: number): void {
    for (let i = this.turns.length - 1; i >= 0; i -= 1) {
      const tn = this.turns[i];
      tn.t = Math.min(1, tn.t + delta / PAGE_TURN_S);
      const k = tn.t * tn.t * (3 - 2 * tn.t);
      tn.pivot.rotation.z = Math.PI * k;
      if (!tn.covered && k >= 0.5) {
        tn.covered = true;
        tn.onCover?.();
      }
      if (tn.t >= 1) {
        this.turns.splice(i, 1);
        drop(tn.pivot);
        tn.onLand?.();
      }
    }
  }

  /** Takes every turning page away at once, without their callbacks. */
  clear(): void {
    for (const tn of this.turns) drop(tn.pivot);
    this.turns = [];
  }
}

/** The book's own paper (lit as its pages are), or plain paper if it has none. */
function bookPaper(book: Object3D): Material {
  let found: Material | undefined;
  book.traverse((o) => {
    const m = (o as Mesh).material;
    if (found || !m || Array.isArray(m)) return;
    if (m.name === 'paper') found = m;
  });
  const paper = found ? found.clone() : new MeshBasicMaterial({ color: PAPER_FALLBACK });
  paper.side = FrontSide;
  return paper;
}

/**
 * One side of the sheet in the turning frame: the face up from the right
 * page, or the back facing down, laid out so that after the half turn it
 * reads as the left page does.
 */
function face(paper: Material, pencil: Texture | null, back: boolean): Group {
  const g = new Group();
  const sheet = new Mesh(new PlaneGeometry(PAGE_W, PAGE_D), paper);
  g.add(sheet);
  if (pencil) {
    const marks = new Mesh(new PlaneGeometry(PAGE_W, PAGE_D), new MeshBasicMaterial({ map: pencil, transparent: true, depthWrite: false }));
    marks.position.z = 0.0003;
    g.add(marks);
  }
  g.position.set(PAGE_X, back ? -0.0004 : 0.0004, 0);
  // Face up along +Y, its top to the book's back; the back turned over about its width too.
  if (back) g.rotation.set(-Math.PI / 2, Math.PI, 0);
  else g.rotation.x = -Math.PI / 2;
  return g;
}

function drop(pivot: Group): void {
  pivot.removeFromParent();
  pivot.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    // The pencil textures stay: they are the book's own.
    (m.material as Material).dispose();
  });
}
