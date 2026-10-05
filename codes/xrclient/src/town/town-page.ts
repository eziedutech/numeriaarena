import {
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from '@iwsdk/core';
import { getLang, type Lang } from '../settings.js';
import { el, paperText } from '../home/paper.js';
import { online } from '../offline.js';
import { assetOf, footprint, LAND_KINDS, townRulesNow, type LandKind, type Placed } from './town-core.js';
import { classMap, takeCell, TownModel, type ClassMap } from './town-model.js';
import { buildPage, foldUp, Ghost, type PageScene } from './town-scene.js';
import { shelfPictures } from './town-thumbs.js';
import { factsOf, finishQuestion, GRADES, type Grade, type Shape } from './town-facts.js';
import { TOWN_TEXT, waitText, type TownText } from './town-text.js';

/**
 * MY FOLD TOWN on a computer or phone: the page of the town drawn in its own
 * canvas over the home page, the shop's shelf under it, and a card for the
 * building picked. Mouse, touch and keyboard all do the same things.
 */

const INK = '#3a3f4b';
const PAPER = '#fff8ec';
const TEAL = '#3fb6a0';
const ORANGE = '#f28c38';
const KIND_COLOUR: Record<string, string> = { plain: '#9fd27c', river: '#6cc3e0', hills: '#6aa86a', beach: '#f1d58a' };

const CSS = `
#town { position: fixed; inset: 0; z-index: 99999; background: #e9dcc0; display: flex; flex-direction: column;
  font-family: 'Atkinson Hyperlegible', 'Segoe UI', system-ui, sans-serif; color: ${INK}; }
#town [hidden] { display: none !important; }
#town button { border: 0; font: inherit; color: inherit; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
#town button:focus-visible { outline: 3px solid ${INK}; outline-offset: 2px; }
#town .bar { display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: ${PAPER}; flex-wrap: wrap;
  box-shadow: 0 3px 8px rgba(70, 50, 25, 0.2); z-index: 1; }
#town .bar .grow { flex: 1; }
#town .folds { background: ${INK}; color: ${PAPER}; padding: 8px 14px; font-weight: 700; font-size: 18px; }
#town .tab { padding: 8px 14px; min-height: 44px; background: #f1e3c4; font-weight: 700; font-size: 16px; }
#town .tab.on { background: ${INK}; color: ${PAPER}; }
#town .tab:disabled { opacity: 0.45; cursor: default; }
#town .stage { position: relative; flex: 1; min-height: 0; }
#town canvas.world { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }
#town .note { position: absolute; left: 50%; top: 14px; transform: translateX(-50%); background: ${PAPER}; padding: 8px 14px;
  font-size: 16px; box-shadow: 4px 7px 12px rgba(70, 50, 25, 0.25); max-width: 80%; text-align: center; }
#town .note:empty { display: none; }
#town .card { position: absolute; right: 14px; top: 14px; width: 280px; background: ${PAPER}; padding: 14px; display: flex; flex-direction: column;
  gap: 8px; box-shadow: 4px 7px 12px rgba(70, 50, 25, 0.3); }
#town .card h3 { margin: 0; font-size: 20px; }
#town .card p { margin: 0; font-size: 16px; }
#town .card .row { display: flex; gap: 8px; flex-wrap: wrap; }
#town .btn { padding: 10px 14px; min-height: 44px; background: #f1e3c4; font-weight: 700; }
#town .btn.go { background: ${TEAL}; color: #fff; }
#town .btn.warn { background: ${ORANGE}; color: #fff; }
#town .shelf { display: flex; gap: 10px; padding: 10px 14px; background: ${PAPER}; overflow-x: auto; box-shadow: 0 -3px 8px rgba(70, 50, 25, 0.2); }
#town .shelf .label { writing-mode: vertical-rl; transform: rotate(180deg); font-weight: 700; letter-spacing: 2px; }
#town .item { flex: 0 0 auto; width: 120px; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px; background: #f8efdc; }
#town .item img { width: 108px; height: 84px; object-fit: contain; }
#town .item .name { font-size: 14px; font-weight: 700; text-align: center; line-height: 1.15; }
#town .item .price { font-size: 13px; }
#town .item.on { background: ${TEAL}; color: #fff; }
#town .item.off { opacity: 0.5; }
#town .keys { font-size: 13px; color: #7a6f5c; padding: 4px 16px 8px; background: ${PAPER}; }
#town .toast { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); background: ${INK}; color: ${PAPER}; padding: 10px 16px;
  font-size: 16px; opacity: 0; transition: opacity 0.2s; pointer-events: none; }
#town .toast.show { opacity: 1; }
#town .cover { position: absolute; inset: 0; background: rgba(58, 63, 75, 0.45); display: flex; align-items: center; justify-content: center; z-index: 2; }
#town .sheet { width: min(760px, 94vw); max-height: 90vh; overflow-y: auto; box-sizing: border-box; background: ${PAPER}; padding: 24px 28px;
  display: flex; flex-direction: column; gap: 12px; box-shadow: 4px 7px 12px rgba(70, 50, 25, 0.32); }
#town .sheet p { margin: 0; font-size: 17px; }
#town .kinds { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
#town .kind { flex-direction: column; align-items: flex-start; padding: 12px; min-height: 120px; background: #f8efdc; text-align: left; }
#town .kind .swatch { width: 100%; height: 40px; }
#town .kind b { font-size: 18px; }
#town .kind span { font-size: 14px; }
#town .map { display: grid; gap: 3px; }
#town .cell { aspect-ratio: 1; min-height: 34px; background: #f1e3c4; font-size: 11px; overflow: hidden; padding: 2px; flex-direction: column; }
#town .cell.taken { cursor: default; color: ${INK}; }
#town .cell.me { outline: 3px solid ${INK}; }
#town .sheet .row { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
#town .card ul { font-size: 15px; gap: 4px; padding-left: 18px; }
#town .card .grades { display: flex; gap: 6px; align-items: center; font-size: 14px; font-weight: 700; }
#town .card .grades button { min-width: 40px; min-height: 40px; background: #f1e3c4; font-weight: 700; }
#town .card .grades button.on { background: ${INK}; color: ${PAPER}; }
#town .choices { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
#town .choices button { min-height: 64px; font-size: 26px; font-weight: 700; background: #f8efdc; }
#town .choices button.yes { background: ${TEAL}; color: #fff; }
#town .choices button.no { background: ${ORANGE}; color: #fff; }
#town .choices button:disabled { cursor: default; }
#town .sheet p.ask { font-size: 22px; font-weight: 700; }
#town ul { margin: 0; padding-left: 22px; font-size: 17px; display: flex; flex-direction: column; gap: 6px; }
`;

let open: TownPage | null = null;

const GRADE_KEY = 'numeria.town.grade';
const TRIES_KEY = 'numeria.town.tries';
const RETRY_MS = 30_000;

/** FINISH NOW tries by building, kept on the device so a reload does not skip the wait. */
const tries = {
  all(): Record<string, { attempt: number; next_at: number }> {
    try {
      return JSON.parse(localStorage.getItem(TRIES_KEY) ?? '{}') as Record<string, { attempt: number; next_at: number }>;
    } catch {
      return {};
    }
  },
  get(id: string): { attempt: number; next_at: number } | undefined {
    return this.all()[id];
  },
  set(id: string, v: { attempt: number; next_at: number }): void {
    const all = this.all();
    all[id] = v;
    // Only the newest few are worth keeping.
    const kept = Object.entries(all).slice(-50);
    try {
      localStorage.setItem(TRIES_KEY, JSON.stringify(Object.fromEntries(kept)));
    } catch {
      // Without storage no wait can be kept; the next question comes at once.
    }
  },
};

/** Opens the town over the page; one at a time. */
export function openTown(): void {
  if (open) return;
  open = new TownPage();
}

type Mode = { kind: 'idle' } | { kind: 'place'; asset: string; rot: number } | { kind: 'move'; id: string; asset: string; rot: number };

class TownPage {
  private lang: Lang = getLang();
  private t: TownText = TOWN_TEXT[this.lang];
  private root: HTMLDivElement;
  private model?: TownModel;
  private land = 0;
  private mode: Mode = { kind: 'idle' };
  private cursor = { x: 0, y: 0 };
  private selected = '';
  private map?: ClassMap;
  /** Items known to be finished, to fold up those that finish while watching. */
  private readySeen = new Set<string>();

  private renderer?: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(38, 1, 0.1, 100);
  private page?: PageScene;
  private ghost = new Ghost();
  private folding: { obj: Group; start: number }[] = [];
  private frame = 0;
  private tick = 0;

  private bar!: HTMLDivElement;
  private stage!: HTMLDivElement;
  private canvas!: HTMLCanvasElement;
  private note!: HTMLDivElement;
  private card!: HTMLDivElement;
  private shelf!: HTMLDivElement;
  private toast!: HTMLDivElement;
  private toastTimer = 0;
  private cover: HTMLDivElement | null = null;
  private unlisten?: () => void;
  private resize = new ResizeObserver(() => this.fit());

  private onKey = (e: KeyboardEvent) => this.key(e);

  constructor() {
    if (!document.getElementById('town-css')) {
      const style = el('style');
      style.id = 'town-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.root = el('div', '', document.body);
    this.root.id = 'town';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', this.t.title);
    const wait = el('p', 'note', this.root);
    wait.textContent = this.t.loading;
    window.addEventListener('keydown', this.onKey);
    TownModel.open()
      .then((model) => this.start(model))
      .catch((error) => {
        console.warn(`[town] not opened: ${String(error)}`);
        wait.textContent = this.t.failed;
        const close = el('button', 'btn', this.root);
        close.textContent = this.t.close;
        close.addEventListener('click', () => this.close());
      });
  }

  // ------------------------------------------------------------ set up

  private start(model: TownModel): void {
    this.model = model;
    this.root.innerHTML = '';
    this.bar = el('div', 'bar', this.root);
    this.stage = el('div', 'stage', this.root);
    this.canvas = el('canvas', 'world', this.stage);
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', this.t.canvas);
    this.note = el('div', 'note', this.stage);
    this.card = el('div', 'card', this.stage);
    this.card.hidden = true;
    this.toast = el('div', 'toast', this.stage);
    this.toast.setAttribute('aria-live', 'polite');
    this.shelf = el('div', 'shelf', this.root);
    el('div', 'keys', this.root).textContent = this.t.keys;

    try {
      this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true });
      this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    } catch (error) {
      console.warn(`[town] no WebGL here: ${String(error)}`);
      this.note.textContent = this.t.failed;
    }
    this.scene.background = new Color(0xe9dcc0);
    this.scene.add(new AmbientLight(0xffffff, 1.4));
    const sun = new DirectionalLight(0xffffff, 1.6);
    sun.position.set(-4, 9, 6);
    this.scene.add(sun);
    this.scene.add(this.ghost.root);

    this.canvas.addEventListener('pointermove', (e) => this.hover(e));
    this.canvas.addEventListener('pointerdown', (e) => this.press(e));
    this.canvas.addEventListener('pointerleave', () => {
      if (this.mode.kind === 'idle') this.ghost.hide();
    });
    this.resize.observe(this.stage);

    const v = model.view();
    for (const it of v.items) if (it.ready) this.readySeen.add(it.id);
    this.land = Math.max(0, v.lands.length - 1);
    this.unlisten = model.onChange(() => this.redraw());
    this.redraw();
    this.fit();
    this.frame = requestAnimationFrame(this.loop);
    this.tick = window.setInterval(() => this.everySecond(), 1000);

    if (!v.lands.length) this.pickLand(true);
    if (model.seat) {
      void model.sync();
      void this.loadMap();
    }
    if (model.doc.refused.length) this.showRefused();
  }

  private close(): void {
    window.removeEventListener('keydown', this.onKey);
    cancelAnimationFrame(this.frame);
    clearInterval(this.tick);
    clearTimeout(this.toastTimer);
    this.resize.disconnect();
    this.unlisten?.();
    this.model?.dispose();
    this.renderer?.dispose();
    this.root.remove();
    open = null;
  }

  private fit(): void {
    if (!this.renderer) return;
    const w = Math.max(1, this.stage.clientWidth);
    const h = Math.max(1, this.stage.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const r = townRulesNow();
    const centre = new Vector3(r.cols / 2, 0, r.rows / 2);
    // Far enough back that the whole page shows on a narrow screen too.
    const reach = Math.max(r.rows * 1.15, (r.cols * 1.1) / Math.max(0.5, this.camera.aspect));
    this.camera.position.set(centre.x, reach * 1.05, centre.z + reach * 0.95);
    this.camera.lookAt(centre);
    this.camera.updateProjectionMatrix();
  }

  private loop = (time: number) => {
    this.frame = requestAnimationFrame(this.loop);
    this.folding = this.folding.filter((f) => {
      const t = (time - f.start) / 700;
      foldUp(f.obj, f.start ? t : 0);
      if (!f.start) f.start = time;
      return t < 1;
    });
    this.renderer?.render(this.scene, this.camera);
  };

  // ------------------------------------------------------------ drawing

  private redraw(): void {
    const model = this.model;
    if (!model) return;
    const v = model.view();
    if (this.land >= v.lands.length) this.land = Math.max(0, v.lands.length - 1);
    this.drawBar(v.balance, v.lands, v.land_closed);
    this.drawShelf(v.balance, v.buildings);

    if (this.page) this.scene.remove(this.page.root);
    this.page = undefined;
    const kind = v.lands[this.land];
    if (kind) {
      this.page = buildPage(kind, this.land, v.items, model.doc.landmarks[this.land]);
      this.scene.add(this.page.root);
      for (const it of v.items) {
        if (!it.ready || this.readySeen.has(it.id)) continue;
        this.readySeen.add(it.id);
        const obj = this.page.items.get(it.id);
        if (obj) {
          this.folding.push({ obj: obj.children[0] as Group, start: 0 });
          this.say(this.t.finished(this.name(it.asset)));
        }
      }
    }
    if (this.selected && !v.items.some((i) => i.id === this.selected)) this.selected = '';
    this.drawCard(v.items);
    this.drawNote();
    this.showGhost();
  }

  private drawBar(balance: number, lands: LandKind[], closed: string | null): void {
    const t = this.t;
    this.bar.innerHTML = '';
    this.bar.appendChild(paperText(t.title, 26, INK));
    const folds = el('span', 'folds', this.bar);
    folds.textContent = t.folds(balance);
    folds.setAttribute('aria-live', 'polite');
    lands.forEach((_, i) => {
      const b = el('button', `tab${i === this.land ? ' on' : ''}`, this.bar);
      b.textContent = t.land(i + 1);
      b.setAttribute('aria-pressed', String(i === this.land));
      b.addEventListener('click', () => {
        this.land = i;
        this.selected = '';
        this.mode = { kind: 'idle' };
        this.redraw();
      });
    });
    const add = el('button', 'tab', this.bar);
    add.textContent = `+ ${t.newLand}`;
    if (closed && lands.length) {
      add.setAttribute('aria-disabled', 'true');
      add.title = this.closedText(closed, lands.length - 1);
    }
    add.addEventListener('click', () => {
      if (closed && lands.length) this.say(this.closedText(closed, lands.length - 1));
      else this.pickLand(!lands.length);
    });
    if (this.model?.seat && lands.length && this.map && !this.map.cells.some((c) => c.me)) {
      const place = el('button', 'tab', this.bar);
      place.textContent = t.pickCell;
      place.addEventListener('click', () => void this.pickCell(lands[0]));
    }
    el('span', 'grow', this.bar);
    const how = el('button', 'tab', this.bar);
    how.textContent = t.how;
    how.addEventListener('click', () => this.showHow());
    const close = el('button', 'tab', this.bar);
    close.textContent = t.close;
    close.addEventListener('click', () => this.close());
  }

  private closedText(code: string, last: number): string {
    if (code !== 'land_not_full') return this.reason(code);
    const { free, used } = this.pageTiles(last);
    return this.t.landClosed(used, Math.ceil((free * townRulesNow().full_tenths) / 10));
  }

  /** Tiles of page `land` that can be built on, and those built. */
  private pageTiles(land: number): { free: number; used: number } {
    const kind = this.model!.view().lands[land];
    const layout = townRulesNow().lands.find((l) => l.kind === kind)?.layout ?? [];
    const free = layout.join('').split('').filter((c) => c === '.').length;
    let used = 0;
    for (const it of this.model!.view().items) {
      if (it.land !== land) continue;
      const a = assetOf(it.asset);
      if (a) used += a.w * a.h;
    }
    return { free, used };
  }

  // ------------------------------------------------------------ maths

  /** A seat's grade from its class; a guest picks one, grade 5 at first. */
  private grade(): Grade {
    const seat = this.model?.seat;
    let g = seat?.grade;
    if (!seat) {
      try {
        g = Number(localStorage.getItem(GRADE_KEY) ?? localStorage.getItem('numeria.board.grade'));
      } catch {
        g = undefined;
      }
    }
    return (GRADES as readonly number[]).includes(g ?? 0) ? (g as Grade) : 5;
  }

  private gradePicker(): void {
    const row = el('div', 'grades', this.card);
    el('span', '', row).textContent = this.t.grade;
    const now = this.grade();
    for (const g of GRADES) {
      const b = el('button', g === now ? 'on' : '', row);
      b.textContent = String(g);
      b.setAttribute('aria-pressed', String(g === now));
      b.setAttribute('aria-label', `${this.t.grade} ${g}`);
      b.addEventListener('click', () => {
        try {
          localStorage.setItem(GRADE_KEY, String(g));
        } catch {
          // Without storage the grade stays as it was.
        }
        this.redraw();
      });
    }
  }

  private shapeOf(it: Placed): Shape {
    const a = assetOf(it.asset)!;
    const [w, h] = footprint(a, it.rot);
    return { w, h, windows: a.windows, floors: a.floors };
  }

  private finishLabel(b: HTMLButtonElement, id: string): void {
    const wait = (tries.get(id)?.next_at ?? 0) - Date.now();
    b.disabled = wait > 0;
    b.textContent = wait > 0 ? this.t.nextIn(waitText(wait, this.lang)) : this.t.finishNow;
  }

  /** FINISH NOW: one question about the building; right finishes it at once. */
  private askFinish(it: Placed): void {
    const t = this.t;
    const tried = tries.get(it.id) ?? { attempt: 0, next_at: 0 };
    if (tried.next_at > Date.now()) return;
    const q = finishQuestion(this.shapeOf(it), this.grade(), tried.attempt, this.lang);
    const sheet = this.openCover(`${t.finishNow}: ${this.name(it.asset).toUpperCase()}`);
    el('p', '', sheet).textContent = t.finishNote;
    const ask = el('p', 'ask', sheet);
    ask.textContent = q.prompt;
    const choices = el('div', 'choices', sheet);
    const after = el('p', '', sheet);
    after.setAttribute('aria-live', 'polite');
    const row = el('div', 'row', sheet);
    const back = el('button', 'btn', row);
    back.textContent = t.back;
    back.addEventListener('click', () => this.closeCover());
    q.choices.forEach((c, i) => {
      const b = el('button', '', choices);
      b.textContent = c;
      b.addEventListener('click', async () => {
        for (const other of choices.querySelectorAll('button')) other.disabled = true;
        tries.set(it.id, { attempt: tried.attempt + 1, next_at: i === q.right ? 0 : Date.now() + RETRY_MS });
        if (i !== q.right) {
          b.classList.add('no');
          after.textContent = `${t.wrong} ${q.hint}`;
          back.textContent = t.ok;
          back.focus();
          return;
        }
        b.classList.add('yes');
        const reason = await this.model!.act({ type: 'town_finish', place_id: it.id });
        this.closeCover();
        this.say(reason ? this.reason(reason) : t.right(this.name(it.asset)));
      });
    });
    (choices.firstElementChild as HTMLElement | null)?.focus();
  }

  private drawShelf(balance: number, buildings: number): void {
    const t = this.t;
    this.shelf.innerHTML = '';
    const label = el('div', 'label', this.shelf);
    label.textContent = t.shop;
    const r = townRulesNow();
    const pictures = shelfPictures(r.catalog);
    for (const a of r.catalog) {
      const locked = buildings < a.unlock_at;
      const short = a.price - balance;
      const on = this.mode.kind === 'place' && this.mode.asset === a.id;
      const b = el('button', `item${on ? ' on' : ''}${locked || short > 0 ? ' off' : ''}`, this.shelf);
      const pic = pictures.get(a.id);
      if (pic) {
        const img = el('img', '', b);
        img.src = pic;
        img.alt = '';
      }
      el('span', 'name', b).textContent = this.name(a.id);
      const price = el('span', 'price', b);
      price.textContent = locked ? t.lockedAfter(a.unlock_at) : short > 0 ? t.needFolds(short) : t.price(a.price);
      b.setAttribute('aria-pressed', String(on));
      b.addEventListener('click', () => {
        if (locked) return this.say(this.reason('locked'));
        if (short > 0) return this.say(this.reason('not_enough_folds'));
        this.selected = '';
        this.mode = on ? { kind: 'idle' } : { kind: 'place', asset: a.id, rot: 0 };
        this.redraw();
        this.canvas.focus();
      });
    }
  }

  private drawCard(items: Placed[]): void {
    const it = items.find((i) => i.id === this.selected);
    this.card.hidden = !it;
    this.card.innerHTML = '';
    if (!it) return;
    const t = this.t;
    el('h3', '', this.card).textContent = this.name(it.asset);
    const status = el('p', 'status', this.card);
    status.textContent = it.ready ? t.status.ready : t.status.building(waitText(it.ready_at_ms - this.model!.now(), this.lang));
    if (!it.ready) {
      const finish = el('button', 'btn go finish', this.card);
      this.finishLabel(finish, it.id);
      finish.addEventListener('click', () => this.askFinish(it));
    } else {
      const a = assetOf(it.asset);
      if (a && a.group !== 'road' && a.group !== 'nature') {
        el('b', '', this.card).textContent = t.maths;
        const facts = el('ul', '', this.card);
        for (const f of factsOf(this.shapeOf(it), this.pageTiles(it.land), this.grade(), this.lang)) el('li', '', facts).textContent = f;
        if (!this.model!.seat) this.gradePicker();
      }
    }
    const row = el('div', 'row', this.card);
    const move = el('button', 'btn', row);
    move.textContent = t.move;
    move.addEventListener('click', () => {
      this.mode = { kind: 'move', id: it.id, asset: it.asset, rot: it.rot };
      this.cursor = { x: it.x, y: it.y };
      this.redraw();
      this.canvas.focus();
    });
    const remove = el('button', 'btn warn', row);
    remove.textContent = t.refund(it.price);
    remove.addEventListener('click', () => void this.remove(it));
  }

  private drawNote(): void {
    const model = this.model!;
    const t = this.t;
    let text = '';
    if (this.mode.kind !== 'idle') text = `${this.name(this.mode.asset)} · ${t.tile(this.cursor.x, this.cursor.y)}`;
    if (model.seat && (model.syncNote === 'offline' || !online())) text = text ? `${text}. ${t.offline}` : t.offline;
    this.note.textContent = text;
  }

  private showGhost(): void {
    const m = this.mode;
    if (m.kind === 'idle' || !this.page) return this.ghost.hide();
    const fits = this.model!.fits(m.asset, this.land, this.cursor.x, this.cursor.y, m.rot, m.kind === 'move' ? m.id : '');
    this.ghost.show(m.asset, this.cursor.x, this.cursor.y, m.rot, fits === '');
    const held = m.kind === 'move' ? this.page.items.get(m.id) : undefined;
    for (const g of this.page.items.values()) g.visible = g !== held;
  }

  private everySecond(): void {
    const model = this.model;
    if (!model) return;
    const v = model.view();
    if (v.items.some((i) => i.ready && !this.readySeen.has(i.id))) return this.redraw();
    const it = v.items.find((i) => i.id === this.selected);
    const status = this.card.querySelector('.status');
    if (it && !it.ready && status) status.textContent = this.t.status.building(waitText(it.ready_at_ms - model.now(), this.lang));
    const finish = this.card.querySelector<HTMLButtonElement>('.finish');
    if (it && finish) this.finishLabel(finish, it.id);
  }

  // ------------------------------------------------------------ input

  /** The tile under a pointer, by where its ray meets the page. */
  private tileAt(e: PointerEvent): { x: number; y: number } | null {
    const box = this.canvas.getBoundingClientRect();
    const nx = ((e.clientX - box.left) / box.width) * 2 - 1;
    const ny = -((e.clientY - box.top) / box.height) * 2 + 1;
    const p = new Vector3(nx, ny, 0.5).unproject(this.camera);
    const dir = p.sub(this.camera.position).normalize();
    if (dir.y >= 0) return null;
    const s = -this.camera.position.y / dir.y;
    const hit = this.camera.position.clone().addScaledVector(dir, s);
    const r = townRulesNow();
    const x = Math.floor(hit.x);
    const y = Math.floor(hit.z);
    return x >= 0 && y >= 0 && x < r.cols && y < r.rows ? { x, y } : null;
  }

  /** Places the footprint so the pointer is near its middle. */
  private aim(tile: { x: number; y: number }): void {
    const m = this.mode;
    if (m.kind === 'idle') {
      this.cursor = tile;
      return;
    }
    const a = assetOf(m.asset)!;
    const [fw, fh] = footprint(a, m.rot);
    const r = townRulesNow();
    this.cursor = {
      x: Math.min(r.cols - fw, Math.max(0, tile.x - Math.floor((fw - 1) / 2))),
      y: Math.min(r.rows - fh, Math.max(0, tile.y - Math.floor((fh - 1) / 2))),
    };
  }

  private hover(e: PointerEvent): void {
    const tile = this.tileAt(e);
    if (!tile || this.mode.kind === 'idle') return;
    this.aim(tile);
    this.showGhost();
    this.drawNote();
  }

  private press(e: PointerEvent): void {
    this.canvas.focus();
    const tile = this.tileAt(e);
    if (!tile) return;
    this.aim(tile);
    if (this.mode.kind === 'idle') this.select(tile.x, tile.y);
    else void this.commit();
  }

  private select(x: number, y: number): void {
    const it = this.itemAt(x, y);
    this.selected = it?.id ?? '';
    this.redraw();
    if (it) this.say(`${this.name(it.asset)}. ${it.ready ? this.t.status.ready : ''}`);
  }

  private itemAt(x: number, y: number): Placed | undefined {
    return this.model!.view().items.find((it) => {
      if (it.land !== this.land) return false;
      const a = assetOf(it.asset);
      if (!a) return false;
      const [fw, fh] = footprint(a, it.rot);
      return x >= it.x && x < it.x + fw && y >= it.y && y < it.y + fh;
    });
  }

  private key(e: KeyboardEvent): void {
    if (!this.model) return;
    if (this.cover) {
      if (e.key === 'Escape') this.closeCover();
      return;
    }
    const target = e.target as HTMLElement | null;
    const onCanvas = target === this.canvas || target === document.body;
    const r = townRulesNow();
    const m = this.mode;
    const step: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (step[e.key] && onCanvas) {
      e.preventDefault();
      const [fw, fh] = m.kind === 'idle' ? [1, 1] : footprint(assetOf(m.asset)!, m.rot);
      this.cursor = {
        x: Math.min(r.cols - fw, Math.max(0, this.cursor.x + step[e.key][0])),
        y: Math.min(r.rows - fh, Math.max(0, this.cursor.y + step[e.key][1])),
      };
      if (m.kind === 'idle') {
        const it = this.itemAt(this.cursor.x, this.cursor.y);
        this.selected = it?.id ?? '';
        this.redraw();
        this.say(`${this.t.tile(this.cursor.x, this.cursor.y)}: ${it ? this.name(it.asset) : this.t.empty}`);
      } else {
        this.showGhost();
        this.drawNote();
      }
      return;
    }
    if ((e.key === 'r' || e.key === 'R') && m.kind !== 'idle') {
      m.rot = (m.rot + 90) % 360;
      this.aim(this.cursor);
      this.showGhost();
      return;
    }
    if (e.key === 'Enter' && onCanvas && m.kind !== 'idle') {
      e.preventDefault();
      void this.commit();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && onCanvas && this.selected && m.kind === 'idle') {
      const it = this.model.view().items.find((i) => i.id === this.selected);
      if (it) void this.remove(it);
      return;
    }
    if (e.key === 'Escape') {
      if (m.kind !== 'idle' || this.selected) {
        this.mode = { kind: 'idle' };
        this.selected = '';
        this.redraw();
      } else this.close();
    }
  }

  // ------------------------------------------------------------ changes

  private async commit(): Promise<void> {
    const model = this.model!;
    const m = this.mode;
    const { x, y } = this.cursor;
    if (m.kind === 'place') {
      const reason = await model.act({ type: 'town_place', asset: m.asset, land: this.land, x, y, rot: m.rot });
      if (reason) return this.say(this.reason(reason));
      this.say(this.t.placed(this.name(m.asset)));
      const a = assetOf(m.asset)!;
      // Roads and trees are laid one after another; anything else is placed once.
      if (a.price > model.view().balance || (a.group !== 'road' && a.group !== 'nature')) this.mode = { kind: 'idle' };
      this.redraw();
    } else if (m.kind === 'move') {
      const reason = await model.act({ type: 'town_move', place_id: m.id, land: this.land, x, y, rot: m.rot });
      if (reason) return this.say(this.reason(reason));
      this.say(this.t.moved(this.name(m.asset)));
      this.mode = { kind: 'idle' };
      this.selected = m.id;
      this.redraw();
    }
  }

  private async remove(it: Placed): Promise<void> {
    const reason = await this.model!.act({ type: 'town_remove', place_id: it.id });
    if (reason) return this.say(this.reason(reason));
    this.readySeen.delete(it.id);
    this.selected = '';
    this.say(this.t.removed(this.name(it.asset), it.price));
    this.redraw();
  }

  // ------------------------------------------------------------ sheets

  private openCover(label: string): HTMLDivElement {
    this.closeCover();
    this.cover = el('div', 'cover', this.root);
    const sheet = el('div', 'sheet', this.cover);
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', label);
    sheet.appendChild(paperText(label, 28, INK));
    return sheet;
  }

  private closeCover(): void {
    this.cover?.remove();
    this.cover = null;
    this.canvas?.focus();
  }

  /** The kinds of land, for the first land (`first`) or a new page. */
  private pickLand(first: boolean): void {
    const t = this.t;
    const sheet = this.openCover(t.pickLand);
    el('p', '', sheet).textContent = t.pickLandNote;
    const kinds = el('div', 'kinds', sheet);
    for (const kind of LAND_KINDS) {
      const b = el('button', 'kind', kinds);
      el('div', 'swatch', b).style.background = KIND_COLOUR[kind];
      el('b', '', b).textContent = t.kinds[kind][0];
      el('span', '', b).textContent = t.kinds[kind][1];
      b.addEventListener('click', () => void this.openLand(kind, first));
    }
    if (!first) {
      const row = el('div', 'row', sheet);
      const back = el('button', 'btn', row);
      back.textContent = t.back;
      back.addEventListener('click', () => this.closeCover());
    }
    (kinds.firstElementChild as HTMLElement | null)?.focus();
  }

  private async openLand(kind: LandKind, first: boolean): Promise<void> {
    const model = this.model!;
    const reason = await model.act({ type: 'town_land', kind });
    if (reason) {
      this.closeCover();
      return this.say(this.reason(reason));
    }
    this.land = model.view().lands.length - 1;
    this.closeCover();
    this.redraw();
    if (first && model.seat) {
      if (!online()) this.say(this.t.pickCellLater);
      else void this.pickCell(kind);
    }
  }

  private async loadMap(): Promise<void> {
    const s = this.model?.seat;
    if (!s) return;
    const got = await classMap(s);
    if (typeof got === 'string') return;
    this.map = got;
    this.redraw();
    // A first land opened in the headset still needs its square on the class map.
    const first = this.model?.view().lands[0];
    if (first && !got.cells.some((c) => c.me) && !this.cover) void this.pickCell(first);
  }

  /** The class map, to pick the cell of the seat's first land. */
  private async pickCell(kind: LandKind): Promise<void> {
    const s = this.model?.seat;
    if (!s) return;
    const t = this.t;
    const got = await classMap(s);
    if (typeof got === 'string') return this.say(t.pickCellLater);
    this.map = got;
    if (got.cells.some((c) => c.me)) return this.redraw();
    const sheet = this.openCover(t.pickCell);
    el('p', '', sheet).textContent = t.pickCellNote;
    const grid = el('div', 'map', sheet);
    grid.style.gridTemplateColumns = `repeat(${got.cols}, 1fr)`;
    const taken = new Map(got.cells.map((c) => [`${c.x},${c.y}`, c]));
    for (let y = 0; y < got.rows; y++) {
      for (let x = 0; x < got.cols; x++) {
        const c = taken.get(`${x},${y}`);
        const b = el('button', `cell${c ? ' taken' : ''}`, grid);
        if (c) {
          b.style.background = KIND_COLOUR[c.kind] ?? '#ddd';
          b.textContent = c.name;
          b.setAttribute('aria-label', `${t.tile(x, y)}: ${c.name}`);
          b.disabled = true;
          continue;
        }
        b.setAttribute('aria-label', `${t.tile(x, y)}: ${t.empty}`);
        b.addEventListener('click', async () => {
          const err = await takeCell(s, x, y, kind);
          if (err === 'cell_taken') {
            this.say(t.cellTaken);
            return void this.pickCell(kind);
          }
          if (err && err !== 'already_placed') {
            this.closeCover();
            return this.say(t.pickCellLater);
          }
          this.closeCover();
          await this.loadMap();
        });
      }
    }
    const row = el('div', 'row', sheet);
    const later = el('button', 'btn', row);
    later.textContent = t.later;
    later.addEventListener('click', () => this.closeCover());
  }

  private showHow(): void {
    const t = this.t;
    const sheet = this.openCover(t.how);
    const list = el('ul', '', sheet);
    for (const line of t.howBody) el('li', '', list).textContent = line;
    el('p', '', sheet).textContent = t.earned(this.model!.earnings());
    const row = el('div', 'row', sheet);
    const ok = el('button', 'btn go', row);
    ok.textContent = t.ok;
    ok.addEventListener('click', () => this.closeCover());
    ok.focus();
  }

  private showRefused(): void {
    const model = this.model!;
    const t = this.t;
    const sheet = this.openCover(t.refusedTitle);
    el('p', '', sheet).textContent = t.refusedNote;
    const list = el('ul', '', sheet);
    for (const r of model.doc.refused.slice(-20)) {
      const ev = r.event;
      const what = ev.type === 'town_place' ? this.name(ev.asset) : ev.type === 'town_land' ? t.kinds[ev.kind][0] : ev.type.replace('town_', '');
      el('li', '', list).textContent = `${what}: ${this.reason(r.reason)}`;
    }
    const row = el('div', 'row', sheet);
    const ok = el('button', 'btn go', row);
    ok.textContent = t.ok;
    ok.addEventListener('click', () => {
      void model.clearRefused();
      this.closeCover();
    });
    ok.focus();
  }

  // ------------------------------------------------------------ words

  private name(id: string): string {
    return this.t.names[id] ?? id;
  }

  private reason(code: string): string {
    return this.t.reasons[code] ?? this.t.reasons.other;
  }

  private say(text: string): void {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('show'), 2600);
  }
}
