import { getLang } from '../settings.js';
import { el, paperText } from '../home/paper.js';
import { studentState } from '../home/student.js';
import { online } from '../offline.js';
import { LEADERS_TEXT, type LeadersText } from './leaders-text.js';

/**
 * The leaderboards over the home page: MY CLASS (a signed-in seat's class)
 * and GLOBAL, each ranking HIGH STRIKE (the best points in one race the
 * server judged) and MOST DAYS (days played), this month or all time. The
 * server sends the top ten and the seat's own row; nobody's place below the
 * top is shown but one's own. CITY BUILDER waits for the Fold Town.
 */

const INK = '#3a3f4b';
const PAPER = '#fff8ec';
const TEAL = '#3fb6a0';
const BLUE = '#3469c4';
const MEDALS = ['#f2c14e', '#c9ced6', '#d99a5b'];

type Which = 'class' | 'global';
type Kind = 'strike' | 'days' | 'city';
type Period = 'month' | 'all';

interface Row {
  place: number;
  name: string;
  grade: number;
  /** A sample class's label, like `5A Demo`; a real class's never comes. */
  demo: string | null;
  score: number;
  me: boolean;
}

interface Boards {
  strike: Row[];
  days: Row[];
  on_global?: boolean;
  class?: string;
}

const CSS = `
#leaders { position: fixed; inset: 0; z-index: 30; background: rgba(58, 63, 75, 0.45); display: flex; align-items: center; justify-content: center;
  font-family: 'Atkinson Hyperlegible', 'Segoe UI', system-ui, sans-serif; color: ${INK}; }
#leaders .sheet { width: min(860px, 94vw); max-height: 94vh; box-sizing: border-box; overflow-y: auto; background: ${PAPER}; padding: 28px 32px;
  display: flex; flex-direction: column; gap: 14px; box-shadow: 4px 7px 12px rgba(70, 50, 25, 0.32); }
#leaders .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
#leaders button { border: 0; font: inherit; color: inherit; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
#leaders .tabs { display: flex; gap: 10px; flex-wrap: wrap; }
#leaders .tab { padding: 10px 18px; min-height: 48px; background: #f1e3c4; font-size: 18px; font-weight: 700; }
#leaders .tab.on { background: ${INK}; color: ${PAPER}; }
#leaders .tab.small { min-height: 40px; padding: 6px 14px; font-size: 16px; }
#leaders .tab .soon { background: ${INK}; color: ${PAPER}; font-size: 12px; padding: 2px 6px; }
#leaders .tab.on .soon { background: ${PAPER}; color: ${INK}; }
#leaders .about { margin: 0; font-size: 17px; color: #6b6352; }
#leaders .list { display: flex; flex-direction: column; gap: 8px; min-height: 120px; overflow-y: auto; }
#leaders .row { display: grid; grid-template-columns: 64px 1fr auto auto; align-items: center; gap: 14px; padding: 8px 14px; background: #f8efdc; font-size: 22px; }
#leaders .row.me { background: ${TEAL}; color: #fff; font-weight: 700; }
#leaders .row .place { width: 46px; height: 46px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; background: #efe2c6; }
#leaders .row .name { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#leaders .row .grade { font-size: 16px; opacity: 0.8; }
#leaders .row .score { font-weight: 700; }
#leaders .row .you { font-size: 13px; padding: 2px 8px; background: #fff; color: ${TEAL}; margin-left: 8px; vertical-align: middle; }
#leaders .gap { text-align: center; font-size: 22px; letter-spacing: 6px; opacity: 0.5; }
#leaders .note { margin: 0; font-size: 18px; padding: 14px 0; }
#leaders .foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
#leaders .foot .soft { font-size: 15px; color: #7a6f5c; margin: 0; }
#leaders .btn { padding: 12px 22px; min-height: 52px; background: #f1e3c4; box-shadow: 4px 7px 12px rgba(70, 50, 25, 0.32); }
`;

let open: Leaders | null = null;

/** Opens the leaderboards over the page; one at a time. */
export function openLeaders(): void {
  if (open) return;
  open = new Leaders();
}

class Leaders {
  private t: LeadersText = LEADERS_TEXT[getLang()];
  private root: HTMLDivElement;
  private which: Which = studentState() ? 'class' : 'global';
  private kind: Kind = 'strike';
  private period: Period = 'month';
  /** Boards by which and period, kept while the page is open. */
  private got = new Map<string, Boards>();
  private asked = 0;
  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.close();
  };

  constructor() {
    if (!document.getElementById('leaders-css')) {
      const style = el('style');
      style.id = 'leaders-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.root = el('div', '', document.body);
    this.root.id = 'leaders';
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });
    window.addEventListener('keydown', this.onKey);
    this.draw();
  }

  private close(): void {
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
    open = null;
  }

  private tab(parent: HTMLElement, label: string, on: boolean, press: () => void, small = false): HTMLButtonElement {
    const b = el('button', `tab${on ? ' on' : ''}${small ? ' small' : ''}`, parent);
    b.textContent = label;
    b.setAttribute('aria-pressed', String(on));
    b.addEventListener('click', press);
    return b;
  }

  private draw(): void {
    const t = this.t;
    this.root.innerHTML = '';
    const sheet = el('div', 'sheet', this.root);
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', t.title);

    const head = el('div', 'head', sheet);
    head.appendChild(paperText(t.title, 34, INK));
    const periods = el('div', 'tabs', head);
    for (const p of ['month', 'all'] as Period[]) {
      this.tab(periods, p === 'month' ? t.month : t.all, this.period === p, () => this.pick({ period: p }), true);
    }

    const boards = el('div', 'tabs', sheet);
    for (const w of ['class', 'global'] as Which[]) {
      this.tab(boards, w === 'class' ? t.myClass : t.global, this.which === w, () => this.pick({ which: w }));
    }
    const kinds = el('div', 'tabs', sheet);
    for (const k of ['strike', 'days', 'city'] as Kind[]) {
      const b = this.tab(kinds, t[k], this.kind === k, () => this.pick({ kind: k }), true);
      if (k === 'city') el('span', 'soon', b).textContent = t.soon;
    }
    el('p', 'about', sheet).textContent = t.about[this.kind];

    const list = el('div', 'list', sheet);
    list.setAttribute('aria-live', 'polite');
    void this.fill(list);

    const foot = el('div', 'foot', sheet);
    el('p', 'soft', foot).textContent = this.period === 'month' ? t.month1 : '';
    const close = el('button', 'btn', foot);
    close.appendChild(paperText(t.close, 20, INK));
    close.setAttribute('aria-label', t.close);
    close.addEventListener('click', () => this.close());
  }

  private pick(o: { which?: Which; kind?: Kind; period?: Period }): void {
    this.which = o.which ?? this.which;
    this.kind = o.kind ?? this.kind;
    this.period = o.period ?? this.period;
    this.draw();
  }

  private note(list: HTMLElement, text: string): HTMLParagraphElement {
    const p = el('p', 'note', list);
    p.textContent = text;
    return p;
  }

  private async fill(list: HTMLElement): Promise<void> {
    const t = this.t;
    if (this.kind === 'city') return void this.note(list, t.about.city);
    const seat = studentState();
    if (this.which === 'class' && !seat) return void this.note(list, t.signIn);
    if (!online()) return void this.note(list, t.offline);

    const key = `${this.which}-${this.period}`;
    let boards = this.got.get(key);
    if (!boards) {
      const loading = this.note(list, t.loading);
      const asked = ++this.asked;
      try {
        const q = `board=${this.which}&period=${this.period}`;
        const res = seat
          ? await fetch(`/api/student/leaderboard?${q}`, { headers: { Authorization: `Bearer ${seat.token}` } })
          : await fetch(`/api/leaderboard?period=${this.period}`);
        if (!res.ok) throw new Error(String(res.status));
        boards = (await res.json()) as Boards;
        this.got.set(key, boards);
      } catch (e) {
        console.warn('[leaders] not loaded', e);
        if (asked !== this.asked || !list.isConnected) return;
        loading.textContent = t.failed;
        const again = el('button', 'btn', list);
        again.appendChild(paperText(t.retry, 18, INK));
        again.setAttribute('aria-label', t.retry);
        again.addEventListener('click', () => this.draw());
        return;
      }
      // Another tab was picked meanwhile; it draws its own.
      if (asked !== this.asked || !list.isConnected) return;
      loading.remove();
    }

    const rows = this.kind === 'strike' ? boards.strike : boards.days;
    if (this.which === 'global' && boards.on_global === false) this.note(list, t.offClass);
    if (!rows.length) return void this.note(list, t.empty[this.kind]);
    let last = 0;
    for (const r of rows) {
      if (r.place > last + 1) el('div', 'gap', list).textContent = '...';
      last = r.place;
      const row = el('div', `row${r.me ? ' me' : ''}`, list);
      const place = el('div', 'place', row);
      place.textContent = String(r.place);
      if (r.place <= 3) place.style.background = MEDALS[r.place - 1];
      if (r.me) place.style.color = INK;
      const name = el('div', 'name', row);
      name.textContent = r.name;
      if (r.me) el('span', 'you', name).textContent = t.you;
      el('div', 'grade', row).textContent = this.which === 'global' ? [t.grade(r.grade), r.demo].filter(Boolean).join(' · ') : '';
      const score = el('div', 'score', row);
      score.textContent = this.kind === 'strike' ? t.points(r.score) : t.dayCount(r.score);
      if (!r.me && r.place === 1) score.style.color = BLUE;
    }
  }
}
