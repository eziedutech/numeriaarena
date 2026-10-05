import init, { GameSession, RaceGame, coreVersion } from '../wasm/pkg/foldlings_core.js';

/** Shapes returned by the Rust core (see backrust/core/src/session.rs). */
export type GameKind = 'balloon_burst' | 'orb_forge' | 'factory_sort' | 'bridge_builder' | 'balance_gate';

/** Games answered by picking one choice (a balloon, a weight, a gate). */
export const PICK_GAMES: readonly GameKind[] = ['balloon_burst', 'balance_gate', 'factory_sort'];
/** Games answered by putting pieces together (crystals, planks). */
export const BUILD_GAMES: readonly GameKind[] = ['orb_forge', 'bridge_builder'];

export interface NumberView {
  text: string;
  num: number;
  den: number;
}

export interface Offer {
  offer_id: number;
  game: GameKind;
  template_id: string;
  skill: string;
  prompt: { en: string; id: string };
  band: 'normal' | 'explore' | 'relief';
  p_final: number;
  show_demo: boolean;
  /** Orb Forge's orb, Bridge Builder's gap, the number Factory Sort's creature carries. */
  target?: NumberView;
  /** Balloons, or Balance Gate's weights. */
  balloons: { text: string; misconception?: string }[];
  /** Crystals, or Bridge Builder's planks. */
  crystals: NumberView[];
  max_crystals: number;
  /** Factory Sort's two gates. */
  gates?: { en: string; id: string }[];
}

export interface Verdict {
  offer_id: number;
  correct: boolean;
  points: number;
  attempt: number;
  retry_allowed: boolean;
  expected_text: string;
  misconception?: string;
  built_text?: string;
  /** Factory Sort: the gate the number belongs through. */
  expected_gate?: number;
  streak: number;
  total_points: number;
}

// Every item template in codes/content, bundled at build time so solo play works offline.
const files = import.meta.glob('../../../content/{templates,contoh}/*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export class Core {
  private constructor(private session: GameSession) {}

  static async start(seed: number): Promise<Core> {
    await init();
    const templates = `[${Object.values(files).join(',')}]`;
    const config = JSON.stringify({
      seed,
      grade: null,
      timed: true,
      player_id: 'guest',
      content_pack_version: 'dev-bundle',
    });
    const session = new GameSession(templates, config);
    const rejected = JSON.parse(session.rejected()) as string[];
    if (rejected.length > 0) {
      console.warn('[core] templates that did not compile:', rejected);
    }
    console.info(`[core] foldlings-core ${coreVersion()}, ${Object.keys(files).length} templates`);
    return new Core(session);
  }

  next(game: GameKind): Offer {
    return JSON.parse(this.session.next(game)) as Offer;
  }

  answerBalloon(offerId: number, index: number, timeMs: number): Verdict {
    return JSON.parse(this.session.answerBalloon(offerId, index, timeMs, Date.now())) as Verdict;
  }

  answerOrb(offerId: number, crystals: number[], timeMs: number): Verdict {
    return JSON.parse(this.session.answerOrb(offerId, Uint32Array.from(crystals), timeMs, Date.now())) as Verdict;
  }

  answerBalance(offerId: number, index: number, timeMs: number): Verdict {
    return JSON.parse(this.session.answerBalance(offerId, index, timeMs, Date.now())) as Verdict;
  }

  answerSort(offerId: number, gate: number, timeMs: number): Verdict {
    return JSON.parse(this.session.answerSort(offerId, gate, timeMs, Date.now())) as Verdict;
  }

  answerBridge(offerId: number, planks: number[], timeMs: number): Verdict {
    return JSON.parse(this.session.answerBridge(offerId, Uint32Array.from(planks), timeMs, Date.now())) as Verdict;
  }

  close(offerId: number): void {
    this.session.close(offerId);
  }

  drainEvents(): unknown[] {
    return JSON.parse(this.session.drainEvents()) as unknown[];
  }
}

// ------------------------------------------------------------ Race

export interface RaceOffer extends Offer {
  boss: boolean;
}

export interface RaceVerdict extends Verdict {
  /** Points added to the player's race score (doubled on a boss). */
  race_points: number;
  boss: boolean;
}

export type Emote = 'thumbs_up' | 'clap';

export type RaceEvent =
  | { type: 'wave_start'; at_ms: number; wave: number; game: GameKind; ends_at_ms: number }
  | { type: 'bot_working'; at_ms: number; desk: number; prompt: { en: string; id: string } }
  | { type: 'bot_answer'; at_ms: number; desk: number; correct: boolean; attempt: number; points: number }
  | { type: 'emote'; at_ms: number; desk: number; emote: Emote }
  | { type: 'time_up'; at_ms: number; wave: number | null; player_cut: boolean }
  | { type: 'boss_start'; at_ms: number; ends_at_ms: number }
  | { type: 'match_end'; at_ms: number };

export interface DeskView {
  name: string;
  bot: boolean;
  points: number;
  /** Creatures answered right in the whole race. */
  folded: number;
  place: number;
}

export interface RaceState {
  phase: 'ready' | 'wave' | 'break' | 'boss' | 'done';
  wave?: number;
  waves: number;
  /** Every round in order, the boss last. */
  plan: { game: GameKind; seconds: number; boss: boolean }[];
  /** When the current round's clock runs out (Date.now() clock), or null between rounds. */
  ends_at_ms: number | null;
  desks: DeskView[];
}

export type Highlight = 'best_save' | 'most_improved' | 'sharpest_aim' | 'steady_streak' | 'brave_try';

export interface Recap {
  /** The player first, then the bots. */
  players: {
    name: string;
    bot: boolean;
    points: number;
    folded: number;
    place: number;
    stars: number;
    highlight: Highlight | null;
  }[];
  skills: { skill: string; theta_before: number; theta_after: number }[];
}

/** One race against two rival bots, all decided in the Rust core. */
/**
 * One call made on a race, with its arguments: the same seed and the same
 * calls in the same order rebuild the same race, which is how a race picks
 * up again after the page was closed (see `RaceCheckpoint` in game.ts).
 */
export type RaceCall =
  | ['start', number]
  | ['tick', number]
  | ['next']
  | ['balloon', number, number, number, number]
  | ['orb', number, number[], number, number]
  | ['balance', number, number, number, number]
  | ['sort', number, number, number, number]
  | ['bridge', number, number[], number, number];

export class Race {
  /** Every call so far, in order. */
  readonly calls: RaceCall[] = [];

  private constructor(
    private game: RaceGame,
    readonly seed: number,
  ) {}

  static async create(seed: number, botNames: [string, string]): Promise<Race> {
    await init();
    const templates = `[${Object.values(files).join(',')}]`;
    const config = JSON.stringify({
      seed,
      grade: null,
      timed: true,
      player_id: 'guest',
      content_pack_version: 'dev-bundle',
      bot_names: botNames,
    });
    const game = new RaceGame(templates, config);
    const rejected = JSON.parse(game.rejected()) as string[];
    if (rejected.length > 0) console.warn('[race] templates that did not compile:', rejected);
    return new Race(game, seed);
  }

  start(now: number): void {
    this.calls.push(['start', now]);
    this.game.start(now);
  }

  tick(now: number): RaceEvent[] {
    this.calls.push(['tick', now]);
    return JSON.parse(this.game.tick(now)) as RaceEvent[];
  }

  playerNext(): RaceOffer | null {
    this.calls.push(['next']);
    return JSON.parse(this.game.playerNext()) as RaceOffer | null;
  }

  answerBalloon(offerId: number, index: number, timeMs: number, now: number): RaceVerdict {
    this.calls.push(['balloon', offerId, index, timeMs, now]);
    return JSON.parse(this.game.answerBalloon(offerId, index, timeMs, now)) as RaceVerdict;
  }

  answerOrb(offerId: number, crystals: number[], timeMs: number, now: number): RaceVerdict {
    this.calls.push(['orb', offerId, crystals, timeMs, now]);
    return JSON.parse(this.game.answerOrb(offerId, Uint32Array.from(crystals), timeMs, now)) as RaceVerdict;
  }

  answerBalance(offerId: number, index: number, timeMs: number, now: number): RaceVerdict {
    this.calls.push(['balance', offerId, index, timeMs, now]);
    return JSON.parse(this.game.answerBalance(offerId, index, timeMs, now)) as RaceVerdict;
  }

  answerSort(offerId: number, gate: number, timeMs: number, now: number): RaceVerdict {
    this.calls.push(['sort', offerId, gate, timeMs, now]);
    return JSON.parse(this.game.answerSort(offerId, gate, timeMs, now)) as RaceVerdict;
  }

  answerBridge(offerId: number, planks: number[], timeMs: number, now: number): RaceVerdict {
    this.calls.push(['bridge', offerId, planks, timeMs, now]);
    return JSON.parse(this.game.answerBridge(offerId, Uint32Array.from(planks), timeMs, now)) as RaceVerdict;
  }

  /**
   * Plays recorded calls on this fresh race, in order. A call refused the
   * first time (an answer after the whistle) is refused again and skipped.
   * The answer events this produces were saved the first time round, so
   * they are dropped here.
   */
  replay(calls: RaceCall[]): void {
    for (const c of calls) {
      try {
        switch (c[0]) {
          case 'start':
            this.start(c[1]);
            break;
          case 'tick':
            this.tick(c[1]);
            break;
          case 'next':
            this.playerNext();
            break;
          case 'balloon':
            this.answerBalloon(c[1], c[2], c[3], c[4]);
            break;
          case 'orb':
            this.answerOrb(c[1], c[2], c[3], c[4]);
            break;
          case 'balance':
            this.answerBalance(c[1], c[2], c[3], c[4]);
            break;
          case 'sort':
            this.answerSort(c[1], c[2], c[3], c[4]);
            break;
          case 'bridge':
            this.answerBridge(c[1], c[2], c[3], c[4]);
            break;
        }
      } catch {
        // Refused then, refused now: nothing changed.
      }
    }
    this.drainEvents();
  }

  view(): RaceState {
    return JSON.parse(this.game.view()) as RaceState;
  }

  recap(): Recap {
    return JSON.parse(this.game.recap()) as Recap;
  }

  drainEvents(): unknown[] {
    return JSON.parse(this.game.drainEvents()) as unknown[];
  }

  free(): void {
    this.game.free();
  }
}
