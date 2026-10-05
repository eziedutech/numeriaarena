import { getLang } from '../settings.js';
import { el, paperText } from '../home/paper.js';
import { onTeacher, teacherCall, teacherState } from '../home/teacher.js';
import { BOARD_TEXT, type BoardText } from './board-text.js';
import { decorate, lookOf, LOOKS_CSS, target } from './looks.js';
import { makeRace, seeded, shuffled, TOPICS, type Question, type Topic } from './questions.js';

/**
 * The smartboard race: three players side by side on one big touch screen,
 * a column each, the same kinds of question in the same order with numbers
 * of their own, the answers moving as animals, balloons or orbs. Every touch counts
 * for the column it lands in, so all three can press at once. The results
 * show as a podium; they are kept in the class report only when the teacher
 * opened the race for their class and chose to save them.
 */

/** A student of the class in a column. */
export interface BoardSeat {
  number: number;
  name: string;
}

export interface BoardOpen {
  /** The class the race is for; its students fill the columns. */
  classId?: string;
  seats?: BoardSeat[];
  record?: boolean;
  grade?: number;
}

const INK = '#3a3f4b';
const PAPER = '#fff8ec';
const COLUMN = ['#3fb6a0', '#3469c4', '#f2716b'];
const STAGE_W = 1600;
const STAGE_H = 900;
/** Three rounds of the three looks, so each player meets each look as often. */
const COUNT = 9;
/** After a right answer and after a wrong one, before the next question. */
const PAUSE_RIGHT = 450;
const PAUSE_WRONG = 1300;

const CSS = `
#board { position: fixed; inset: 0; z-index: 30; background: #f6e7c1; overflow: hidden; touch-action: none;
  font-family: 'Atkinson Hyperlegible', 'Segoe UI', system-ui, sans-serif; color: ${INK}; user-select: none; }
#board .stage { position: absolute; left: 0; top: 0; width: ${STAGE_W}px; height: ${STAGE_H}px; transform-origin: 0 0; }
#board .shadow { box-shadow: 4px 7px 12px rgba(70, 50, 25, 0.32); }
#board button { border: 0; font: inherit; color: inherit; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
#board button:disabled { opacity: 0.45; cursor: default; }
#board .sheet { position: absolute; left: 200px; top: 40px; width: 1200px; height: 820px; box-sizing: border-box;
  background: ${PAPER}; padding: 34px 48px; display: flex; flex-direction: column; gap: 18px; }
#board .intro { font-size: 21px; margin: 0; }
#board .row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
#board .label { width: 130px; flex: none; }
#board .opt { padding: 12px 20px; background: #f1e3c4; font-size: 20px; font-weight: 700; min-height: 54px; }
#board .opt.on { background: ${INK}; color: ${PAPER}; }
#board select, #board input[type=text] { font: inherit; font-size: 22px; padding: 10px 14px; border: 0; background: #f8efdc; color: ${INK};
  min-height: 54px; box-sizing: border-box; }
#board .slots { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
#board .slot { padding: 12px; display: flex; flex-direction: column; gap: 8px; }
#board .slot input, #board .slot select { width: 100%; }
#board .check { display: flex; align-items: center; gap: 12px; font-size: 21px; cursor: pointer; }
#board .check input { width: 30px; height: 30px; }
#board .note { font-size: 19px; margin: 0; min-height: 26px; color: #c9554f; }
#board .soft { color: #7a6f5c; }
#board .actions { margin-top: auto; display: flex; justify-content: flex-end; gap: 16px; }
#board .btn { padding: 14px 26px; min-height: 64px; background: #f1e3c4; }
#board .bar { position: absolute; left: 24px; right: 24px; top: 14px; height: 56px; display: flex; align-items: center; gap: 18px; }
#board .bar .what { background: ${PAPER}; padding: 10px 16px; font-size: 20px; font-weight: 700; }
#board .bar .clock { margin-left: auto; background: ${PAPER}; padding: 10px 16px; font-size: 24px; font-weight: 700; min-width: 70px; text-align: center; }
#board .cols { position: absolute; left: 24px; right: 24px; top: 84px; bottom: 24px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
#board .col { background: ${PAPER}; display: flex; flex-direction: column; min-width: 0; }
#board .col .head { height: 56px; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; color: ${PAPER};
  font-size: 26px; font-weight: 700; gap: 12px; }
#board .col .head .who { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#board .col .track { height: 10px; background: #efe3c8; }
#board .col .track div { height: 100%; transition: width 0.3s; }
#board .col .track { flex: none; }
${LOOKS_CSS}
#board .col .done { flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; font-size: 26px; }
#board .count { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(58, 45, 20, 0.25); }
#board .count div { background: ${PAPER}; padding: 30px 60px; }
#board .podium { position: absolute; left: 160px; right: 160px; bottom: 150px; height: 560px; display: flex; align-items: flex-end; gap: 24px; }
#board .step { flex: 1; display: flex; flex-direction: column; align-items: stretch; }
#board .step .card { background: ${PAPER}; padding: 16px 18px; text-align: center; margin-bottom: 14px; }
#board .step .card .who { font-size: 30px; font-weight: 700; overflow-wrap: anywhere; }
#board .step .card .how { font-size: 21px; margin-top: 6px; }
#board .step .block { display: flex; align-items: flex-start; justify-content: center; padding-top: 18px; }
#board .after { position: absolute; left: 160px; right: 160px; bottom: 40px; display: flex; align-items: center; gap: 16px; }
#board .after .status { font-size: 20px; margin-right: auto; background: ${PAPER}; padding: 10px 16px; }
#board .after .status:empty { display: none; }
`;

interface Slot {
  name: string;
  seat: number | null;
}

interface Column {
  slot: Slot;
  /** The column's own questions: the same kinds as its neighbours', other numbers. */
  questions: Question[];
  /** For every question, the choices in this column's order (0 is the right one). */
  order: number[][];
  /** For every question and choice, where on its way the answer starts moving. */
  phase: number[][];
  /** Picks the colours and clouds, the same again from the same seed. */
  next: () => number;
  at: number;
  right: number;
  busy: boolean;
  shownAt: number;
  /** Milliseconds from the start to the last answer, once finished. */
  done: number | null;
  answers: { q: Question; correct: boolean; time_ms: number; misconception?: string }[];
  view: HTMLElement;
}

interface ClassRow {
  id: string;
  label: string;
  grade: number;
  status: string;
}

let open: Board | null = null;

/** Opens the race's setup over the page; one at a time. */
export function openBoard(o: BoardOpen = {}): void {
  if (open) return;
  open = new Board(o);
}

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(`numeria.board.${k}`);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(`numeria.board.${k}`, v);
    } catch {
      // Private windows may refuse storage; the choice lasts for this visit.
    }
  },
};

/** The names a teacher gave the seats, kept only in this browser by the class page of the site. */
function seatNames(classId: string): Promise<Record<number, string>> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('numeria-teacher');
      req.onerror = () => resolve({});
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('seat-names')) {
          db.close();
          return resolve({});
        }
        const get = db.transaction('seat-names', 'readonly').objectStore('seat-names').getAll(IDBKeyRange.bound([classId, 0], [classId, 1000]));
        get.onsuccess = () => {
          db.close();
          resolve(Object.fromEntries((get.result as { number: number; name: string }[]).map((r) => [r.number, r.name])));
        };
        get.onerror = () => {
          db.close();
          resolve({});
        };
      };
    } catch {
      resolve({});
    }
  });
}

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

class Board {
  private root: HTMLDivElement;
  private stage!: HTMLDivElement;
  private t: BoardText;
  private grade: number;
  private topic: Topic;
  private slots: Slot[];
  private classId: string | null;
  private record: boolean;
  /** The class's students, once loaded (or the ones the race was opened with). */
  private roster: BoardSeat[];
  private classes: ClassRow[] | null = null;
  private timers: number[] = [];
  private ticking = 0;
  private onResize = () => this.fit();

  private unlisten: () => void;

  constructor(o: BoardOpen) {
    this.t = BOARD_TEXT[getLang()];
    this.grade = o.grade ?? (Number(store.get('grade')) || 5);
    this.topic = (store.get('topic') as Topic | null) ?? 'mixed';
    if (!TOPICS.includes(this.topic)) this.topic = 'mixed';
    this.classId = o.classId ?? null;
    this.record = Boolean(o.record && o.classId);
    this.roster = o.seats ?? [];
    this.slots = [0, 1, 2].map((i) => {
      const s = o.seats?.[i];
      return s ? { name: s.name, seat: s.number } : { name: '', seat: null };
    });
    if (!document.getElementById('board-css')) {
      const style = el('style');
      style.id = 'board-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.root = el('div', '', document.body);
    this.root.id = 'board';
    window.addEventListener('resize', this.onResize);
    this.setup();
    const load = () => {
      void this.loadClasses();
      if (this.classId) void this.loadRoster(this.classId);
    };
    if (teacherState().kind === 'in') load();
    else if (this.classId) void this.loadRoster(this.classId);
    // Opened from a link, the game is still signing the teacher in.
    this.unlisten = onTeacher((s) => {
      if (s.kind === 'in') load();
    });
  }

  private fresh(): HTMLDivElement {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    cancelAnimationFrame(this.ticking);
    this.root.innerHTML = '';
    this.stage = el('div', 'stage', this.root);
    this.fit();
    return this.stage;
  }

  private fit(): void {
    const s = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    this.stage.style.transform = `translate(${(window.innerWidth - STAGE_W * s) / 2}px, ${(window.innerHeight - STAGE_H * s) / 2}px) scale(${s})`;
  }

  private close(): void {
    for (const t of this.timers) clearTimeout(t);
    cancelAnimationFrame(this.ticking);
    window.removeEventListener('resize', this.onResize);
    this.unlisten();
    this.root.remove();
    open = null;
  }

  private button(parent: HTMLElement, label: string, color: string | null, onPress: () => void, px = 20): HTMLButtonElement {
    const b = el('button', 'btn shadow', parent);
    if (color) b.style.background = color;
    b.appendChild(paperText(label, px, color ? PAPER : INK));
    b.setAttribute('aria-label', label);
    b.addEventListener('click', onPress);
    return b;
  }

  // ------------------------------------------------------------ setup

  private async loadClasses(): Promise<void> {
    try {
      const res = await teacherCall('/classes');
      if (!res?.ok) return;
      this.classes = ((await res.json()) as { classes: ClassRow[] }).classes.filter((c) => c.status === 'active');
      if (this.root.querySelector('.sheet')) this.setup();
    } catch {
      // Out of reach: the names are typed.
    }
  }

  private async loadRoster(classId: string): Promise<void> {
    const names = await seatNames(classId);
    let seats: { number: number; pseudonym: string }[] = [];
    try {
      const res = await teacherCall(`/classes/${encodeURIComponent(classId)}`);
      if (res?.ok) seats = ((await res.json()) as { seats: typeof seats }).seats;
    } catch {
      // Out of reach: the students the race was opened with stay.
    }
    if (this.classId !== classId) return;
    if (seats.length) this.roster = seats.map((s) => ({ number: s.number, name: names[s.number] || s.pseudonym }));
    // A name kept in this browser reads better than the one the link carried.
    for (const s of this.slots) if (s.seat !== null) s.name = this.roster.find((r) => r.number === s.seat)?.name ?? s.name;
    if (this.root.querySelector('.sheet')) this.setup();
  }

  private setup(): void {
    const t = this.t;
    const stage = this.fresh();
    const sheet = el('div', 'sheet shadow', stage);
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', t.title);
    sheet.appendChild(paperText(t.title, 40, INK));
    el('p', 'intro', sheet).textContent = t.intro;

    const grades = el('div', 'row', sheet);
    el('div', 'label', grades).appendChild(paperText(t.grade, 22, INK));
    for (const g of [4, 5, 6]) {
      const b = el('button', `opt${this.grade === g ? ' on' : ''}`, grades);
      b.textContent = String(g);
      b.style.minWidth = '74px';
      b.setAttribute('aria-pressed', String(this.grade === g));
      b.addEventListener('click', () => {
        this.grade = g;
        store.set('grade', String(g));
        this.setup();
      });
    }

    const topics = el('div', 'row', sheet);
    el('div', 'label', topics).appendChild(paperText(t.topic, 22, INK));
    for (const k of TOPICS) {
      const b = el('button', `opt${this.topic === k ? ' on' : ''}`, topics);
      b.textContent = t.topics[k];
      b.setAttribute('aria-pressed', String(this.topic === k));
      b.addEventListener('click', () => {
        this.topic = k;
        store.set('topic', k);
        this.setup();
      });
    }

    const players = el('div', 'row', sheet);
    el('div', 'label', players).appendChild(paperText(t.players, 22, INK));
    // A signed-in teacher may take the students from one of their classes.
    const classes = this.classes ?? [];
    if (classes.length || this.classId) {
      el('span', 'soft', players).textContent = t.fromClass;
      const pick = el('select', '', players);
      pick.setAttribute('aria-label', t.fromClass);
      el('option', '', pick).textContent = t.noClass;
      (pick.lastChild as HTMLOptionElement).value = '';
      const known = classes.some((c) => c.id === this.classId);
      for (const c of known || !this.classId ? classes : [...classes, { id: this.classId, label: this.classId, grade: this.grade, status: 'active' }]) {
        const o = el('option', '', pick);
        o.value = c.id;
        o.textContent = c.label;
      }
      pick.value = this.classId ?? '';
      pick.addEventListener('change', () => {
        this.classId = pick.value || null;
        this.roster = [];
        this.slots = [0, 1, 2].map(() => ({ name: '', seat: null }));
        this.record = Boolean(this.classId);
        const row = classes.find((c) => c.id === this.classId);
        if (row) this.grade = row.grade;
        this.setup();
        if (this.classId) void this.loadRoster(this.classId);
      });
    }

    const slots = el('div', 'slots', sheet);
    this.slots.forEach((s, i) => {
      const box = el('div', 'slot shadow', slots);
      box.style.background = COLUMN[i];
      if (this.classId) {
        const pick = el('select', '', box);
        pick.setAttribute('aria-label', t.player(i + 1));
        const none = el('option', '', pick);
        none.value = '';
        none.textContent = this.roster.length ? t.pick : t.loading;
        for (const r of this.roster) {
          const o = el('option', '', pick);
          o.value = String(r.number);
          o.textContent = r.name;
        }
        pick.value = s.seat === null ? '' : String(s.seat);
        pick.addEventListener('change', () => {
          const r = this.roster.find((x) => String(x.number) === pick.value);
          s.seat = r ? r.number : null;
          s.name = r?.name ?? '';
          check();
        });
      } else {
        const input = el('input', '', box);
        input.type = 'text';
        input.maxLength = 24;
        input.placeholder = t.player(i + 1);
        input.value = s.name;
        input.setAttribute('aria-label', t.player(i + 1));
        input.addEventListener('input', () => (s.name = input.value));
      }
    });

    if (this.classId) {
      const label = el('label', 'check', sheet);
      const box = el('input', '', label);
      box.type = 'checkbox';
      box.checked = this.record;
      box.addEventListener('change', () => (this.record = box.checked));
      el('span', '', label).textContent = t.record;
    }
    const note = el('p', 'note', sheet);
    note.setAttribute('role', 'status');

    const actions = el('div', 'actions', sheet);
    this.button(actions, t.close, null, () => this.close());
    const go = this.button(actions, t.start, COLUMN[0], () => void this.start(note));
    const check = () => {
      const seats = this.slots.map((s) => s.seat);
      const ok = !this.classId || (seats.every((n) => n !== null) && new Set(seats).size === 3);
      go.disabled = !ok;
      note.textContent = ok || seats.every((n) => n === null) ? '' : t.distinct;
    };
    check();
  }

  // ------------------------------------------------------------ race

  private async start(note: HTMLElement): Promise<void> {
    const seed = (Math.random() * 2 ** 32) >>> 0;
    const questions = await makeRace(this.grade, this.topic, COUNT, 3, seed);
    if (questions[0].length < COUNT) {
      note.textContent = this.t.none;
      return;
    }
    this.race(questions, seed);
  }

  private race(questions: Question[][], seed: number): void {
    const t = this.t;
    const stage = this.fresh();
    const bar = el('div', 'bar', stage);
    el('div', 'what shadow', bar).textContent = `${t.grade} ${this.grade} · ${t.topics[this.topic]}`;
    const end = this.button(bar, t.end, null, () => {
      // Two presses, so a bump on the board does not end it.
      if (end.dataset.sure) return finish();
      end.dataset.sure = '1';
      end.replaceChildren(paperText(t.endSure, 20, PAPER));
      end.style.background = '#c9554f';
      this.timers.push(
        window.setTimeout(() => {
          delete end.dataset.sure;
          end.replaceChildren(paperText(t.end, 20, INK));
          end.style.background = '';
        }, 3000),
      );
    });
    end.style.minHeight = '52px';
    const time = el('div', 'clock shadow', bar);
    time.textContent = '0:00';

    const cols = el('div', 'cols', stage);
    let startAt = 0;
    const columns: Column[] = this.slots.map((slot, i) => {
      const next = seeded(seed + 7919 * (i + 1));
      return {
        slot: { name: slot.name.trim() || t.player(i + 1), seat: slot.seat },
        questions: questions[i],
        order: questions[i].map((q) => shuffled([...q.choices.keys()], next)),
        phase: questions[i].map((q) => q.choices.map(() => next())),
        next,
        at: 0,
        right: 0,
        busy: true,
        shownAt: 0,
        done: null,
        answers: [],
        view: el('div', 'col shadow', cols),
      };
    });

    const draw = (c: Column, i: number) => {
      c.view.innerHTML = '';
      const head = el('div', 'head', c.view);
      head.style.background = COLUMN[i];
      el('span', 'who', head).textContent = c.slot.name;
      el('span', '', head).textContent = `${Math.min(c.at + 1, COUNT)} / ${COUNT}`;
      const track = el('div', 'track', c.view);
      const fill = el('div', '', track);
      fill.style.width = `${(c.at / COUNT) * 100}%`;
      fill.style.background = COLUMN[i];
      if (c.done !== null) {
        const done = el('div', 'done', c.view);
        done.appendChild(paperText(t.finished, 40, COLUMN[i]));
        el('div', '', done).textContent = `${t.right(c.right, COUNT)} · ${clock(c.done)}`;
        el('div', 'soft', done).textContent = t.waiting;
        return;
      }
      const q = c.questions[c.at];
      const look = lookOf(c.at, i);
      const scene = el('div', `scene ${look}`, c.view);
      decorate(scene, look, c.next);
      el('div', 'ask shadow', scene).textContent = q.prompt[getLang()];
      const box = el('div', 'field', scene);
      c.order[c.at].forEach((k, lane) => {
        const b = target(box, look, lane, q.choices[k].text, c.phase[c.at][lane], c.next);
        b.dataset.k = String(k);
        // Each finger is its own pointer, so three players press at once.
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          press(c, i, k, box);
        });
        b.addEventListener('click', (e) => {
          if (e.detail === 0) press(c, i, k, box);
        });
      });
      c.shownAt = performance.now();
    };

    const press = (c: Column, i: number, k: number, box: HTMLElement) => {
      if (c.busy || c.done !== null) return;
      c.busy = true;
      const q = c.questions[c.at];
      const correct = k === 0;
      c.answers.push({ q, correct, time_ms: Math.round(performance.now() - c.shownAt), misconception: q.choices[k].misconception });
      if (correct) c.right++;
      // Everything stops, so the player sees which one was right.
      box.classList.add('still');
      for (const b of box.querySelectorAll<HTMLElement>('.tgt')) {
        if (b.dataset.k === '0') b.classList.add('yes');
        else if (b.dataset.k === String(k)) b.classList.add('no');
        if (b.dataset.k === String(k)) b.classList.add('hit');
      }
      this.timers.push(
        window.setTimeout(
          () => {
            c.at++;
            c.busy = false;
            if (c.at >= COUNT) c.done = performance.now() - startAt;
            draw(c, i);
            if (columns.every((x) => x.done !== null)) this.timers.push(window.setTimeout(finish, 900));
          },
          correct ? PAUSE_RIGHT : PAUSE_WRONG,
        ),
      );
    };

    let over = false;
    const finish = () => {
      if (over) return;
      over = true;
      const elapsed = performance.now() - startAt;
      this.podium(columns, elapsed, COUNT);
    };

    columns.forEach(draw);
    // Three, two, one: all start on the same moment.
    const count = el('div', 'count', stage);
    const card = el('div', 'shadow', count);
    let n = 3;
    const step = () => {
      card.replaceChildren(paperText(n > 0 ? String(n) : t.go, 120, n > 0 ? INK : COLUMN[0]));
      if (n-- > 0) this.timers.push(window.setTimeout(step, 800));
      else
        this.timers.push(
          window.setTimeout(() => {
            count.remove();
            startAt = performance.now();
            columns.forEach((c, i) => {
              c.busy = false;
              draw(c, i);
            });
            const tick = () => {
              time.textContent = clock(performance.now() - startAt);
              this.ticking = requestAnimationFrame(tick);
            };
            tick();
          }, 600),
        );
    };
    step();
  }

  // ------------------------------------------------------------ results

  private podium(columns: Column[], elapsed: number, total: number): void {
    const t = this.t;
    const stage = this.fresh();
    const head = el('div', '', stage);
    head.style.cssText = 'position:absolute;left:0;right:0;top:46px;display:flex;justify-content:center';
    head.appendChild(paperText(t.results, 56, INK));

    // More right first; between equals, the quicker.
    const ranked = columns
      .map((c, i) => ({ c, i, time: c.done ?? elapsed }))
      .sort((a, b) => b.c.right - a.c.right || a.time - b.time)
      .map((r, n) => ({ ...r, place: n + 1 }));
    const podium = el('div', 'podium', stage);
    const heights = [330, 230, 160];
    for (const r of [ranked[1], ranked[0], ranked[2]]) {
      const step = el('div', 'step', podium);
      const card = el('div', 'card shadow', step);
      el('div', 'who', card).textContent = r.c.slot.name;
      el('div', 'how', card).textContent = r.c.done !== null ? `${t.right(r.c.right, total)} · ${clock(r.c.done)}` : `${t.right(r.c.right, total)} · ${t.unfinished(r.c.at, total)}`;
      const block = el('div', 'block shadow', step);
      block.style.height = `${heights[r.place - 1]}px`;
      block.style.background = COLUMN[r.i];
      block.appendChild(paperText(String(r.place), 110, PAPER));
    }

    const after = el('div', 'after', stage);
    const status = el('div', 'status shadow', after);
    status.setAttribute('role', 'status');
    this.button(after, t.close, null, () => this.close());
    this.button(after, t.setup, null, () => this.setup());
    this.button(after, t.again, COLUMN[0], () => void this.start(status));
    if (this.record && this.classId) void this.save(this.classId, ranked, elapsed, total, status, after);
  }

  private async save(
    classId: string,
    ranked: { c: Column; place: number }[],
    elapsed: number,
    total: number,
    status: HTMLElement,
    after: HTMLElement,
  ): Promise<void> {
    const t = this.t;
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    const body = JSON.stringify({
      client_id: id,
      duration_ms: Math.round(elapsed),
      total,
      players: ranked.map(({ c, place }) => ({
        seat: c.slot.seat,
        right: c.right,
        place,
        events: c.answers.map((a, n) => {
          const event_id = `${id}-${c.slot.seat}-${n}`;
          return {
            event_id,
            mode: 'board',
            event: {
              event_id,
              mode: 'board',
              game_type: 'board_race',
              skill: a.q.skill,
              template_id: a.q.template_id,
              result: a.correct ? 'correct' : 'wrong',
              attempt: 1,
              time_ms: a.time_ms,
              misconception: a.correct ? null : (a.misconception ?? null),
            },
          };
        }),
      })),
    });
    const send = async () => {
      after.querySelector('.retry')?.remove();
      status.textContent = t.saving;
      try {
        const res = await teacherCall(`/classes/${encodeURIComponent(classId)}/board`, { method: 'POST', body });
        if (!res) {
          status.textContent = t.signIn;
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        status.textContent = t.saved;
      } catch {
        status.textContent = t.failed;
        const again = this.button(after, t.retry, null, () => void send());
        again.classList.add('retry');
        after.insertBefore(again, status.nextSibling);
      }
    };
    await send();
  }
}
