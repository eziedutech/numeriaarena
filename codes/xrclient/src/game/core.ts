import init, { GameSession, coreVersion } from '../wasm/pkg/foldlings_core.js';

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
