import init, { GameSession, RaceGame, coreVersion } from '../wasm/pkg/foldlings_core.js';

/** Shapes returned by the Rust core (see backrust/core/src/session.rs). */
export type GameKind = 'balloon_burst' | 'orb_forge';

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
  target?: NumberView;
  balloons: { text: string; misconception?: string }[];
  crystals: NumberView[];
  max_crystals: number;
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
  | { type: 'wave_start'; at_ms: number; wave: number; game: GameKind }
  | { type: 'bot_working'; at_ms: number; desk: number; prompt: string }
  | { type: 'bot_answer'; at_ms: number; desk: number; correct: boolean; attempt: number; points: number }
  | { type: 'desk_done'; at_ms: number; desk: number }
  | { type: 'emote'; at_ms: number; desk: number; emote: Emote }
  | { type: 'wave_end'; at_ms: number; wave: number }
  | { type: 'boss_start'; at_ms: number }
  | { type: 'match_end'; at_ms: number };

export interface DeskView {
  name: string;
  bot: boolean;
  points: number;
  met: number;
  of: number;
  place: number;
}

export interface RaceState {
  phase: 'ready' | 'wave' | 'break' | 'boss' | 'done';
  wave?: number;
  waves: number;
  desks: DeskView[];
}

export type Highlight = 'best_save' | 'most_improved' | 'sharpest_aim' | 'steady_streak' | 'brave_try';

export interface Recap {
  /** The player first, then the bots. */
  players: { name: string; bot: boolean; points: number; place: number; stars: number; highlight: Highlight | null }[];
  skills: { skill: string; theta_before: number; theta_after: number }[];
}

/** One race against two rival bots, all decided in the Rust core. */
export class Race {
  private constructor(private game: RaceGame) {}

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
    return new Race(game);
  }

  start(now: number): void {
    this.game.start(now);
  }

  tick(now: number): RaceEvent[] {
    return JSON.parse(this.game.tick(now)) as RaceEvent[];
  }

  playerNext(): RaceOffer | null {
    return JSON.parse(this.game.playerNext()) as RaceOffer | null;
  }

  answerBalloon(offerId: number, index: number, timeMs: number, now: number): RaceVerdict {
    return JSON.parse(this.game.answerBalloon(offerId, index, timeMs, now)) as RaceVerdict;
  }

  answerOrb(offerId: number, crystals: number[], timeMs: number, now: number): RaceVerdict {
    return JSON.parse(this.game.answerOrb(offerId, Uint32Array.from(crystals), timeMs, now)) as RaceVerdict;
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
