import init, { MeasureHunt } from '../wasm/pkg/foldlings_core.js';
import { bundledTemplates } from '../game/core.js';

/** Shapes returned by the Rust core (see backrust/core/src/measure.rs). */
export type Shape = 'square' | 'rectangle' | 'triangle' | 'circle' | 'cube' | 'cuboid' | 'cylinder' | 'sphere';
export type Task = 'perimeter' | 'area' | 'edges' | 'volume' | 'surface';
export type Source = 'paper' | 'real';
export type P3 = [number, number, number];

export interface HuntTask {
  template_id: string;
  skill: string;
  shape: Shape;
  task: Task;
  unit: string;
  prompt: { en: string; id: string };
}

export interface HuntOffer extends HuntTask {
  offer_id: number;
  source: Source;
  /** A paper object's size in cm. */
  size?: Record<string, number>;
  /** A paper object's corners in its own frame, cm. */
  keys?: P3[];
  snap_cm: number;
}

export interface Reading {
  offer_id: number;
  ok: boolean;
  problem?: string;
  pins: P3[];
  lengths: number[];
  process_points: number;
  choices: string[];
}

export interface HuntVerdict {
  offer_id: number;
  correct: boolean;
  process_points: number;
  answer_points: number;
  points: number;
  expected_text: string;
  misconception?: string;
  total_points: number;
  right: number;
  answered: number;
}

/** The core's Measure Hunt for one play. */
export class HuntCore {
  private constructor(private readonly hunt: MeasureHunt) {}

  static async start(seed: number, grade: number | undefined, player: string): Promise<HuntCore> {
    await init();
    const config = JSON.stringify({ seed, grade: grade ?? null, player_id: player, content_pack_version: 'dev-bundle' });
    const hunt = new MeasureHunt(`[${bundledTemplates().join(',')}]`, config);
    const rejected = JSON.parse(hunt.rejected()) as string[];
    if (rejected.length > 0) console.warn('[measure] templates that did not compile:', rejected);
    return new HuntCore(hunt);
  }

  tasks(solid: boolean): HuntTask[] {
    return JSON.parse(this.hunt.tasks(solid)) as HuntTask[];
  }

  next(templateId: string, solid: boolean, source: Source): HuntOffer {
    return JSON.parse(this.hunt.next(templateId, solid, source, performance.now())) as HuntOffer;
  }

  measure(offerId: number, points: P3[]): Reading {
    return JSON.parse(this.hunt.measure(offerId, JSON.stringify({ points }))) as Reading;
  }

  answer(offerId: number, index: number): HuntVerdict {
    return JSON.parse(this.hunt.answer(offerId, index, performance.now())) as HuntVerdict;
  }

  close(offerId: number): void {
    this.hunt.close(offerId);
  }

  drainEvents(): unknown[] {
    return JSON.parse(this.hunt.drainEvents()) as unknown[];
  }

  dispose(): void {
    this.hunt.free();
  }
}
