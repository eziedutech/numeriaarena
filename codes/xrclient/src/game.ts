import {
  createSystem,
  Entity,
  GrabSystem,
  Group,
  Mesh,
  Object3D,
  OneHandGrabbable,
  PokeInteractable,
  Pressed,
  Grabbed,
  Vector3,
} from '@iwsdk/core';

import { Label } from './art/label.js';
import { makeBalloon, makeBird, makeButton, makeCrystal, makeFoldling, makeOrb } from './art/models.js';
import { accentForSkill } from './art/palette.js';
import { Core, type GameKind, type Offer, type Verdict } from './game/core.js';
import { Balloon, Creature, Crystal, DeskRoot, MenuButton, Orb } from './game-components.js';

const WAVE = 6;
/** Presses this soon after balloons appear are ignored (ms). */
const PRESS_GRACE_MS = 300;
/** A crystal merges when it comes this close to another one (meters). */
const MERGE_DIST = 0.05;
/** Space between crystals in the row; wider than the merge distance. */
const CRYSTAL_GAP = 0.09;
/** Seconds a held crystal must stay beside the same crystal before they merge. */
const MERGE_DWELL_S = 0.4;
/** A crystal or orb reaches the creature this close to its centre. */
const HIT_DIST = 0.07;
/** Where the creature stands, in the desk frame (reader on +Z). */
const STAND = new Vector3(0, 0.0, 0.035);
const HOME = new Vector3(0, 0.02, -0.07);

interface Tween {
  obj: Object3D;
  from: Vector3;
  to: Vector3;
  t: number;
  dur: number;
  arc: number;
  scaleFrom: number;
  scaleTo: number;
  done?: () => void;
}

type Phase = 'loading' | 'menu' | 'playing' | 'between';

export class GameSystem extends createSystem({
  desks: { required: [DeskRoot] },
  creatures: { required: [Creature] },
  balloons: { required: [Balloon] },
  pressedBalloons: { required: [Balloon, Pressed] },
  crystals: { required: [Crystal] },
  heldCrystals: { required: [Crystal, Grabbed] },
  orbs: { required: [Orb] },
  buttons: { required: [MenuButton] },
  pressedButtons: { required: [MenuButton, Pressed] },
}) {
  private core?: Core;
  private phase: Phase = 'loading';
  private kind: GameKind = 'balloon_burst';
  private offer?: Offer;
  private shownAt = 0;
  private played = 0;
  private waveStart = 0;
  private score!: Label;
  private flagLabel?: Label;
  private labels = new Set<Mesh>();
  private tweens: Tween[] = [];
  private head = new Vector3();
  private a = new Vector3();
  private b = new Vector3();
  private creatureWorld = new Vector3();
  private mergeWith?: Entity;
  private mergeHeld = 0;

  init(): void {
    this.score = new Label('Foldlings', { height: 0.04 });
    this.score.mesh.position.set(0, 0.26, -0.1);
    this.score.mesh.name = 'score-label';
    this.labels.add(this.score.mesh);

    Core.start(Date.now() >>> 0)
      .then((core) => {
        this.core = core;
        this.phase = 'menu';
      })
      .catch((error) => console.error('[game] core failed to start', error));

    this.cleanupFuncs.push(
      this.queries.pressedButtons.subscribe('qualify', (e) => {
        if (this.phase !== 'menu') return;
        this.start(e.getValue(MenuButton, 'game') as GameKind);
      }),
      this.queries.pressedBalloons.subscribe('qualify', (e) => this.popBalloon(e)),
    );
  }

  private deskEntity(): Entity | undefined {
    for (const e of this.queries.desks.entities) return e;
    return undefined;
  }

  private add(obj: Object3D): Entity {
    const desk = this.deskEntity()!;
    return this.world.createTransformEntity(obj, { parent: desk });
  }

  /** Adds a text card. `billboard: false` keeps it flat on its parent's +Z face. */
  private label(text: string, height: number, parent: Object3D, y: number, z = 0, billboard = true): Label {
    const l = new Label(text, { height });
    l.mesh.position.set(0, y, z);
    parent.add(l.mesh);
    if (billboard) this.labels.add(l.mesh);
    return l;
  }

  private remove(e: Entity): void {
    e.object3D?.traverse((o) => this.labels.delete(o as Mesh));
    e.dispose();
  }

  private clear(query: { entities: Set<Entity> }): void {
    for (const e of [...query.entities]) this.remove(e);
  }

  // ------------------------------------------------------------ menu

  private showMenu(): void {
    this.phase = 'menu';
    const desk = this.deskEntity()!.object3D!;
    if (!this.score.mesh.parent) desk.add(this.score.mesh);
    const games: [GameKind, string, number, number][] = [
      ['balloon_burst', 'Balloon Burst', -0.1, 0xe07a5f],
      ['orb_forge', 'Orb Forge', 0.1, 0x3d8fb8],
    ];
    for (const [game, title, x, color] of games) {
      const button = makeButton(color);
      button.name = `menu-${game}`;
      button.position.set(x, 0.0325, 0.12);
      const e = this.add(button);
      e.addComponent(MenuButton, { game });
      e.addComponent(PokeInteractable);
      this.label(title, 0.017, button, 0, 0.0075, false);
    }
  }

  private start(kind: GameKind): void {
    this.kind = kind;
    this.clear(this.queries.buttons);
    this.played = 0;
    this.waveStart = 0;
    this.phase = 'playing';
    this.spawn();
  }

  // ------------------------------------------------------------ creatures

  private spawn(): void {
    if (!this.core) return;
    const offer = this.core.next(this.kind);
    this.offer = offer;
    console.info(
      `[game] offer ${offer.offer_id} ${offer.game} ${offer.prompt.en} | ` +
        (offer.game === 'orb_forge'
          ? `target ${offer.target?.text} crystals ${offer.crystals.map((c) => c.text).join(' ')}`
          : `balloons ${offer.balloons.map((b) => b.text).join(' ')}`),
    );
    const color = accentForSkill(offer.skill);
    const { root, flag } = makeFoldling(color);
    root.rotation.y = -Math.PI / 2;
    root.position.copy(HOME);
    root.scale.setScalar(0.2);
    const e = this.add(root);
    e.addComponent(Creature, { offerId: offer.offer_id });
    const flagText = offer.game === 'orb_forge' ? offer.target!.text : offer.prompt.en;
    const flagLabel = new Label(flagText, { height: offer.game === 'orb_forge' ? 0.05 : 0.032 });
    flagLabel.mesh.name = 'flag-label';
    flag.add(flagLabel.mesh);
    this.labels.add(flagLabel.mesh);
    this.flagLabel = flagLabel;
    this.tween(root, STAND, 0.7, 0.03, 1, () => {
      if (offer.game === 'balloon_burst') this.showBalloons(offer);
      else this.showCrystals(offer);
      this.shownAt = performance.now();
    });
  }

  private creature(): Entity | undefined {
    for (const e of this.queries.creatures.entities) return e;
    return undefined;
  }

  private showBalloons(offer: Offer): void {
    const n = offer.balloons.length;
    offer.balloons.forEach((b, i) => {
      const g = makeBalloon(i % 2 === 0 ? 0xf2cc8f : 0x81b29a);
      g.name = `balloon-${i}`;
      g.position.set((i - (n - 1) / 2) * 0.085, 0.02, 0.1);
      const e = this.add(g);
      e.addComponent(Balloon, { index: i });
      this.label(b.text, 0.03, g, 0.075, 0.033);
      this.tween(g, new Vector3(g.position.x, 0.1, 0.1), 0.5, 0, 1, () => e.addComponent(PokeInteractable));
    });
  }

  private showCrystals(offer: Offer, keepOrbs = false): void {
    if (!keepOrbs) this.clear(this.queries.orbs);
    this.clear(this.queries.crystals);
    const n = offer.crystals.length;
    offer.crystals.forEach((c, i) => {
      const m = makeCrystal(0x9b7bb8);
      m.name = `crystal-${i}`;
      m.position.set((i - (n - 1) / 2) * CRYSTAL_GAP, 0.03, 0.15);
      const e = this.add(m);
      e.addComponent(Crystal, { index: i });
      e.addComponent(OneHandGrabbable);
      this.label(c.text, 0.032, m, 0.045);
    });
  }

  // ------------------------------------------------------------ answers

  private popBalloon(e: Entity): void {
    if (this.phase !== 'playing' || !this.offer || !this.core) return;
    // A finger still extended from the last pop must not burst a new balloon.
    if (performance.now() - this.shownAt < PRESS_GRACE_MS) return;
    const index = e.getValue(Balloon, 'index') as number;
    const verdict = this.core.answerBalloon(this.offer.offer_id, index, performance.now() - this.shownAt);
    console.info(
      `[game] balloon ${index} ${this.offer.balloons[index]?.text}: ${verdict.correct ? 'right' : 'wrong'}, ` +
        `expected ${verdict.expected_text}, +${verdict.points}, total ${verdict.total_points}`,
    );
    const obj = e.object3D!;
    if (verdict.correct) {
      this.tween(obj, obj.position.clone(), 0.15, 0, 1.6, () => this.remove(e));
    } else {
      this.tween(obj, obj.position.clone(), 0.2, 0, 0.01, () => this.remove(e));
    }
    this.afterVerdict(verdict);
  }

  private submitOrb(picks: number[]): void {
    if (!this.offer || !this.core) return;
    const verdict = this.core.answerOrb(this.offer.offer_id, picks, performance.now() - this.shownAt);
    console.info(
      `[game] orb ${verdict.built_text ?? '?'} for ${this.offer.target?.text}: ${verdict.correct ? 'right' : 'wrong'}, ` +
        `attempt ${verdict.attempt}, +${verdict.points}, total ${verdict.total_points}`,
    );
    this.clear(this.queries.orbs);
    this.clear(this.queries.crystals);
    if (!verdict.correct && verdict.retry_allowed) this.showCrystals(this.offer);
    this.afterVerdict(verdict);
  }

  private afterVerdict(v: Verdict): void {
    this.score.set(`${v.total_points} points`);
    const creature = this.creature();
    if (!creature) return;
    const obj = creature.object3D!;
    if (v.correct) {
      this.clear(this.queries.balloons);
      this.clear(this.queries.crystals);
      this.clear(this.queries.orbs);
      this.foldHome(creature, this.offer ? accentForSkill(this.offer.skill) : 0xffffff);
      return;
    }
    // Wrong: the creature bounces. With a second try it stays; otherwise it walks home.
    this.tween(obj, obj.position.clone(), 0.25, 0.04, 1);
    if (!v.retry_allowed) {
      this.clear(this.queries.balloons);
      this.clear(this.queries.crystals);
      this.clear(this.queries.orbs);
      this.flagLabel?.set(`= ${v.expected_text}`);
      this.phase = 'between';
      this.tween(obj, HOME, 1.4, 0.02, 0.2, () => {
        this.remove(creature);
        this.next();
      });
    }
  }

  private foldHome(creature: Entity, color: number): void {
    this.phase = 'between';
    const obj = creature.object3D!;
    const bird = makeBird(color);
    bird.position.copy(obj.position).add(new Vector3(0, 0.05, 0));
    const birdEntity = this.add(bird);
    this.remove(creature);
    this.tween(bird, new Vector3(0, 0.08, -0.1), 0.9, 0.12, 0.4, () => {
      this.remove(birdEntity);
      this.next();
    });
  }

  private next(): void {
    this.played += 1;
    this.offer = undefined;
    if (this.played >= WAVE) {
      this.score.set(`Wave done! ${this.score.value}`);
      this.showMenu();
      return;
    }
    this.phase = 'playing';
    this.spawn();
  }

  // ------------------------------------------------------------ animation

  private tween(obj: Object3D, to: Vector3, dur: number, arc: number, scaleTo: number, done?: () => void): void {
    this.tweens.push({
      obj,
      from: obj.position.clone(),
      to: to.clone(),
      t: 0,
      dur,
      arc,
      scaleFrom: obj.scale.x,
      scaleTo,
      done,
    });
  }

  private runTweens(delta: number): void {
    for (let i = this.tweens.length - 1; i >= 0; i -= 1) {
      const tw = this.tweens[i];
      tw.t = Math.min(1, tw.t + delta / tw.dur);
      const k = tw.t * tw.t * (3 - 2 * tw.t);
      tw.obj.position.lerpVectors(tw.from, tw.to, k);
      tw.obj.position.y += Math.sin(Math.PI * tw.t) * tw.arc;
      const s = tw.scaleFrom + (tw.scaleTo - tw.scaleFrom) * k;
      tw.obj.scale.set(s, s, s);
      if (tw.t >= 1) {
        this.tweens.splice(i, 1);
        tw.done?.();
      }
    }
  }

  // ------------------------------------------------------------ frame

  update(delta: number): void {
    const desk = this.deskEntity();
    const placed = !!desk?.getValue(DeskRoot, 'placed');
    if (this.phase === 'menu' && placed && this.queries.buttons.entities.size === 0 && this.queries.creatures.entities.size === 0) {
      this.showMenu();
    }
    this.runTweens(delta);

    // Labels always face the camera that renders them (the head in XR,
    // the browser camera outside it).
    this.camera.getWorldPosition(this.head);
    for (const m of this.labels) if (m.parent) m.lookAt(this.head);

    if (this.phase !== 'playing' || this.kind !== 'orb_forge' || !this.offer) return;
    const creature = this.creature();
    if (!creature?.object3D) return;
    creature.object3D.getWorldPosition(this.creatureWorld);
    this.creatureWorld.y += 0.05;

    // A held crystal kept beside another crystal merges into an orb. The
    // dwell stops a crystal dragged across the row from merging with every
    // neighbour it passes.
    let near: Entity | undefined;
    for (const held of this.queries.heldCrystals.entities) {
      held.object3D!.getWorldPosition(this.a);
      if (this.a.distanceTo(this.creatureWorld) < HIT_DIST) {
        this.submitOrb([held.getValue(Crystal, 'index') as number]);
        return;
      }
      for (const other of this.queries.crystals.entities) {
        if (other === held || other.hasComponent(Grabbed)) continue;
        other.object3D!.getWorldPosition(this.b);
        if (this.a.distanceTo(this.b) < MERGE_DIST) {
          near = other;
          if (near === this.mergeWith) {
            this.mergeHeld += delta;
            if (this.mergeHeld >= MERGE_DWELL_S) {
              this.mergeWith = undefined;
              this.mergeHeld = 0;
              this.merge(held, other);
              return;
            }
          }
          break;
        }
      }
    }
    if (near !== this.mergeWith) {
      this.mergeWith = near;
      this.mergeHeld = 0;
    }
    for (const orb of this.queries.orbs.entities) {
      if (!orb.hasComponent(Grabbed)) continue;
      orb.object3D!.getWorldPosition(this.a);
      if (this.a.distanceTo(this.creatureWorld) < HIT_DIST) {
        this.submitOrb([orb.getValue(Orb, 'first') as number, orb.getValue(Orb, 'second') as number]);
        return;
      }
    }
  }

  private merge(held: Entity, other: Entity): void {
    const grab = this.world.getSystem(GrabSystem);
    grab?.forceRelease(held);
    const i = held.getValue(Crystal, 'index') as number;
    const j = other.getValue(Crystal, 'index') as number;
    const texts = this.offer!.crystals;
    const orb = makeOrb(0xf2cc8f);
    orb.name = 'orb';
    held.object3D!.getWorldPosition(this.a);
    const deskObj = this.deskEntity()!.object3D!;
    deskObj.worldToLocal(orb.position.copy(this.a));
    // Lift the new orb above the row so it never sits inside another crystal.
    orb.position.y = Math.max(orb.position.y, 0.08);
    this.remove(held);
    this.remove(other);
    const e = this.add(orb);
    e.addComponent(Orb, { first: i, second: j });
    e.addComponent(OneHandGrabbable);
    this.label(`${texts[i].text} + ${texts[j].text}`, 0.03, orb, 0.05);
  }
}
