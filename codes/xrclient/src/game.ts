import {
  createSystem,
  Entity,
  GrabSystem,
  Mesh,
  Object3D,
  OneHandGrabbable,
  PokeInteractable,
  Pressed,
  RayInteractable,
  Grabbed,
  Vector3,
} from '@iwsdk/core';

import { Label } from './art/label.js';
import {
  type Envelope,
  forgetMixers,
  makeBalloon,
  makeBird,
  makeButton,
  makeCrystal,
  makeEnvelope,
  makeFoldling,
  makeOrb,
  mixers,
} from './art/models.js';
import { accentForSkill } from './art/palette.js';
import {
  Core,
  Squad,
  type GameKind,
  type Offer,
  type SquadEvent,
  type SquadOffer,
  type SquadState,
  type SquadVerdict,
  type Verdict,
} from './game/core.js';
import { Balloon, Creature, Crystal, DeskRoot, MenuButton, Orb } from './game-components.js';
import { SquadScene, type Stage } from './squad-view.js';
import { T } from './text.js';

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
const STAND = new Vector3(0, 0.0, 0.06);
/** Rows in front of the creature, still within seated reach. */
const BALLOON_Z = 0.17;
const CRYSTAL_Z = 0.2;
/** Balloon Burst question card, above the balloons so nothing hides it. */
const PROMPT_POS = new Vector3(0, 0.27, BALLOON_Z);
const HOME = new Vector3(0, 0.02, -0.07);
/** Solo Squad asks the core for news this often (seconds), not every frame. */
const SQUAD_POLL_S = 0.1;
/** Seconds between the last event of a match and the recap card. */
const RECAP_DELAY_S = 2.0;
const BOT_NAMES: [string, string] = ['Clip', 'Crease'];
/** Opening an envelope: the flap folds back, then the letter slides out (seconds). */
const FLAP_S = 0.45;
const LETTER_S = 0.35;
const LETTER_RISE = 0.045;

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

type Phase = 'loading' | 'menu' | 'opening' | 'playing' | 'between' | 'recap';
type MenuChoice = GameKind | 'solo_squad';

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
  private score!: Label;
  private flagLabel?: Label;
  private prompt?: Label;
  private labels = new Set<Mesh>();
  private tweens: Tween[] = [];
  private head = new Vector3();
  private a = new Vector3();
  private b = new Vector3();
  private creatureWorld = new Vector3();
  private mergeWith?: Entity;
  private mergeHeld = 0;

  // Solo Squad
  private squad?: Squad;
  private squadScene?: SquadScene;
  private squadState?: SquadState;
  private squadPoll = 0;
  private recapIn = -1;
  private stage!: Stage;
  private envelopes = new Map<Entity, Envelope>();
  private opening?: { envelope: Envelope; choice: MenuChoice; t: number };

  init(): void {
    this.score = new Label('Foldlings', { height: 0.04 });
    this.score.mesh.position.set(0, 0.34, -0.05);
    this.score.mesh.name = 'score-label';
    this.labels.add(this.score.mesh);
    this.stage = {
      add: (obj) => this.add(obj),
      remove: (e) => this.remove(e),
      label: (text, height, parent, y, z, billboard) => this.label(text, height, parent, y, z, billboard),
      tween: (obj, to, dur, arc, scaleTo, done) => this.tween(obj, to, dur, arc, scaleTo, done),
    };

    Core.start(Date.now() >>> 0)
      .then((core) => {
        this.core = core;
        this.phase = 'menu';
      })
      .catch((error) => console.error('[game] core failed to start', error));

    this.cleanupFuncs.push(
      this.queries.pressedButtons.subscribe('qualify', (e) => {
        if (this.phase === 'recap') {
          this.endSquad();
          return;
        }
        if (this.phase !== 'menu') return;
        const choice = e.getValue(MenuButton, 'game') as MenuChoice;
        const envelope = this.envelopes.get(e);
        if (!envelope) {
          this.start(choice);
          return;
        }
        // The chosen envelope opens before its game starts.
        this.phase = 'opening';
        this.opening = { envelope, choice, t: 0 };
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
    if (e.object3D) forgetMixers(e.object3D);
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
    const games: [MenuChoice, string, number, number][] = [
      ['solo_squad', T.soloSquad, -0.135, 0x3fb6a0],
      ['balloon_burst', T.gameName.balloon_burst, 0, 0xf2716b],
      ['orb_forge', T.gameName.orb_forge, 0.135, 0x3469c4],
    ];
    for (const [game, title, x, color] of games) {
      this.addEnvelope(game, title, x, color);
    }
  }

  /**
   * A game on the menu: an origami envelope standing on the desk. Touch it
   * with a fingertip, or point at it and pinch (a mouse click in the browser).
   */
  private addEnvelope(game: MenuChoice, title: string, x: number, color: number): void {
    const envelope = makeEnvelope(color);
    envelope.root.name = `menu-${game}`;
    envelope.root.position.set(x, 0.042, 0.12);
    envelope.root.scale.setScalar(1.2);
    const e = this.add(envelope.root);
    e.addComponent(MenuButton, { game });
    e.addComponent(PokeInteractable);
    e.addComponent(RayInteractable);
    this.label(title, 0.019, envelope.root, -0.018, 0.0045, false);
    this.envelopes.set(e, envelope);
  }

  private runOpening(delta: number): void {
    const o = this.opening;
    if (!o) return;
    o.t += delta;
    const k = Math.min(1, o.t / FLAP_S);
    o.envelope.flap.rotation.x = -Math.PI * 0.95 * (k * k * (3 - 2 * k));
    const l = Math.min(1, Math.max(0, (o.t - FLAP_S) / LETTER_S));
    o.envelope.letter.position.y = LETTER_RISE * l;
    if (o.t >= FLAP_S + LETTER_S + 0.15) {
      this.opening = undefined;
      this.start(o.choice);
    }
  }

  private addButton(game: MenuChoice, title: string, x: number, color: number): void {
    const button = makeButton(color);
    button.name = `menu-${game}`;
    button.position.set(x, 0.0325, 0.12);
    const e = this.add(button);
    e.addComponent(MenuButton, { game });
    e.addComponent(PokeInteractable);
    e.addComponent(RayInteractable);
    this.label(title, 0.017, button, 0, 0.0075, false);
  }

  private start(choice: MenuChoice): void {
    this.clear(this.queries.buttons);
    this.envelopes.clear();
    this.played = 0;
    if (choice === 'solo_squad') {
      this.phase = 'loading';
      this.startSquad().catch((error) => {
        console.error('[squad] could not start', error);
        this.showMenu();
      });
      return;
    }
    this.kind = choice;
    this.phase = 'playing';
    this.spawnPractice();
  }

  // ------------------------------------------------------------ Solo Squad

  private async startSquad(): Promise<void> {
    const squad = await Squad.create(Date.now() >>> 0, BOT_NAMES);
    this.squad = squad;
    this.squadScene = new SquadScene(this.stage, this.deskEntity()!.object3D!, BOT_NAMES);
    this.recapIn = -1;
    squad.start(Date.now());
    this.squadState = squad.view();
    this.score.set(T.team(0));
    this.phase = 'playing';
  }

  private updateSquad(delta: number): void {
    const squad = this.squad;
    const scene = this.squadScene;
    if (!squad || !scene) return;
    scene.update(delta, this.squadState);
    if (this.recapIn > 0) {
      this.recapIn -= delta;
      if (this.recapIn <= 0) this.showRecap();
    }
    this.squadPoll -= delta;
    if (this.squadPoll > 0 || this.phase === 'recap') return;
    this.squadPoll = SQUAD_POLL_S;
    const events = squad.tick(Date.now());
    for (const ev of events) this.onSquadEvent(ev);
    if (events.length > 0) this.refreshSquad();
    // The player's desk takes the next creature once the last one is gone.
    if (this.phase === 'playing' && !this.offer && this.queries.creatures.entities.size === 0) {
      const offer = squad.playerNext();
      if (offer) {
        this.spawnOffer(offer);
        this.refreshSquad();
      }
    }
  }

  private refreshSquad(): void {
    if (!this.squad) return;
    this.squadState = this.squad.view();
    this.score.set(T.team(this.squadState.team_points));
  }

  private onSquadEvent(ev: SquadEvent): void {
    const scene = this.squadScene!;
    switch (ev.type) {
      case 'wave_start': {
        const total = this.squadState?.waves ?? 3;
        scene.showBanner(`${T.wave(ev.wave + 1, total)}: ${T.gameName[ev.game]}`);
        break;
      }
      case 'bot_working':
        scene.working(ev.desk, ev.prompt);
        break;
      case 'bot_answer':
        scene.answered(ev.desk, ev.correct);
        break;
      case 'escape': {
        // The player's own escapes are animated with the creature itself.
        if (ev.from === 0) break;
        scene.flash(ev.from, T.escaped);
        const from = scene.windowPos(ev.from, new Vector3());
        if (ev.to === null) {
          scene.flyOrb(from, scene.crystalPos(new Vector3()), 0x6d597a, () => scene.crystalHit());
          scene.showBanner(T.crystalHit, 1.5);
        } else if (ev.to === 0) {
          scene.flyOrb(from, STAND.clone().setY(0.05), 0x6d597a);
        } else {
          scene.flyOrb(from, scene.windowPos(ev.to, new Vector3()), 0x6d597a);
        }
        break;
      }
      case 'help_orb':
        scene.flyOrb(scene.windowPos(ev.from, new Vector3()), STAND.clone().setY(0.05), 0xf2cc8f);
        scene.showBanner(T.helpOrb, 1.5);
        break;
      case 'emote':
        scene.emote(ev.desk, ev.emote);
        break;
      case 'boss_start':
        scene.bossStart();
        break;
      case 'boss_part':
        scene.bossPart(ev.desk);
        break;
      case 'boss_end':
        scene.showBanner(ev.folded ? T.bossFolded : T.bossAway, 2);
        break;
      case 'match_end':
        this.recapIn = RECAP_DELAY_S;
        break;
      case 'bot_spawn':
      case 'wave_end':
        break;
    }
  }

  private showRecap(): void {
    if (!this.squad || !this.squadScene) return;
    const recap = this.squad.recap();
    console.info('[squad] recap', JSON.stringify(recap));
    const events = this.squad.drainEvents();
    console.info(`[squad] ${events.length} answer events for the outbox`);
    this.phase = 'recap';
    this.clearPlay();
    this.squadScene.showRecap(recap, T.you);
    this.addButton('solo_squad', T.done, 0, 0x81b29a);
  }

  private endSquad(): void {
    this.clear(this.queries.buttons);
    this.clearPlay();
    this.squadScene?.dispose();
    this.squadScene = undefined;
    this.squad?.free();
    this.squad = undefined;
    this.squadState = undefined;
    this.score.set('Foldlings');
    this.showMenu();
  }

  private clearPlay(): void {
    this.clearPrompt();
    this.clear(this.queries.creatures);
    this.clear(this.queries.balloons);
    this.clear(this.queries.crystals);
    this.clear(this.queries.orbs);
    this.offer = undefined;
  }

  // ------------------------------------------------------------ creatures

  private spawnPractice(): void {
    if (!this.core) return;
    this.spawnOffer(this.core.next(this.kind));
  }

  private spawnOffer(offer: Offer | SquadOffer): void {
    this.offer = offer;
    this.kind = offer.game;
    const squadInfo = 'boss' in offer ? offer : undefined;
    console.info(
      `[game] offer ${offer.offer_id} ${offer.game} ${offer.prompt.en} | ` +
        (offer.game === 'orb_forge'
          ? `target ${offer.target?.text} crystals ${offer.crystals.map((c) => c.text).join(' ')}`
          : `balloons ${offer.balloons.map((b) => b.text).join(' ')}`) +
        (squadInfo?.rescued_from ? ` | rescued from desk ${squadInfo.rescued_from}` : '') +
        (squadInfo?.boss ? ' | boss' : ''),
    );
    const boss = squadInfo?.boss ?? false;
    const color = boss ? 0x6d597a : accentForSkill(offer.skill);
    const { root, flag } = makeFoldling(color);
    root.rotation.y = -Math.PI / 2;
    root.scale.setScalar(0.2);
    // Rescued creatures step out of their partner's window; the rest come from the book.
    if (squadInfo?.rescued_from && this.squadScene) {
      this.squadScene.windowPos(squadInfo.rescued_from, root.position);
      this.squadScene.showBanner(T.rescue, 1.5);
    } else {
      root.position.copy(HOME);
    }
    if (boss) this.squadScene?.bossHandOff();
    const e = this.add(root);
    e.addComponent(Creature, { offerId: offer.offer_id });
    // Orb Forge shows the target on the flag; Balloon Burst puts the question on its own card.
    const flagText = offer.game === 'orb_forge' ? offer.target!.text : '?';
    const flagLabel = new Label(flagText, { height: offer.game === 'orb_forge' ? 0.05 : 0.04 });
    if (offer.game === 'balloon_burst') {
      this.clearPrompt();
      this.prompt = new Label(offer.prompt.en, { height: 0.036 });
      this.prompt.mesh.name = 'prompt-label';
      this.prompt.mesh.position.copy(PROMPT_POS);
      this.deskEntity()!.object3D!.add(this.prompt.mesh);
      this.labels.add(this.prompt.mesh);
    }
    flagLabel.mesh.name = 'flag-label';
    flag.add(flagLabel.mesh);
    this.labels.add(flagLabel.mesh);
    this.flagLabel = flagLabel;
    this.tween(root, STAND, 0.7, 0.03, boss ? 1.4 : 1, () => {
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
      g.position.set((i - (n - 1) / 2) * 0.085, 0.02, BALLOON_Z);
      const e = this.add(g);
      e.addComponent(Balloon, { index: i });
      this.label(b.text, 0.03, g, 0.0875, 0.034);
      this.tween(g, new Vector3(g.position.x, 0.1, BALLOON_Z), 0.5, 0, 1, () => e.addComponent(PokeInteractable));
    });
  }

  private showCrystals(offer: Offer, keepOrbs = false): void {
    if (!keepOrbs) this.clear(this.queries.orbs);
    this.clear(this.queries.crystals);
    const n = offer.crystals.length;
    offer.crystals.forEach((c, i) => {
      const m = makeCrystal(0xb7a3e0);
      m.name = `crystal-${i}`;
      m.position.set((i - (n - 1) / 2) * CRYSTAL_GAP, 0.03, CRYSTAL_Z);
      const e = this.add(m);
      e.addComponent(Crystal, { index: i });
      e.addComponent(OneHandGrabbable);
      this.label(c.text, 0.032, m, 0.045);
    });
  }

  // ------------------------------------------------------------ answers

  private popBalloon(e: Entity): void {
    if (this.phase !== 'playing' || !this.offer) return;
    // A finger still extended from the last pop must not burst a new balloon.
    if (performance.now() - this.shownAt < PRESS_GRACE_MS) return;
    const index = e.getValue(Balloon, 'index') as number;
    const timeMs = performance.now() - this.shownAt;
    let verdict: Verdict | SquadVerdict;
    if (this.squad) {
      verdict = this.squad.answerBalloon(this.offer.offer_id, index, timeMs, Date.now());
    } else if (this.core) {
      verdict = this.core.answerBalloon(this.offer.offer_id, index, timeMs);
    } else {
      return;
    }
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
    if (!this.offer) return;
    const timeMs = performance.now() - this.shownAt;
    let verdict: Verdict | SquadVerdict;
    if (this.squad) {
      verdict = this.squad.answerOrb(this.offer.offer_id, picks, timeMs, Date.now());
    } else if (this.core) {
      verdict = this.core.answerOrb(this.offer.offer_id, picks, timeMs);
    } else {
      return;
    }
    console.info(
      `[game] orb ${verdict.built_text ?? '?'} for ${this.offer.target?.text}: ${verdict.correct ? 'right' : 'wrong'}, ` +
        `attempt ${verdict.attempt}, +${verdict.points}, total ${verdict.total_points}`,
    );
    this.clear(this.queries.orbs);
    this.clear(this.queries.crystals);
    if (!verdict.correct && verdict.retry_allowed) this.showCrystals(this.offer);
    this.afterVerdict(verdict);
  }

  private afterVerdict(v: Verdict | SquadVerdict): void {
    if (this.squad) this.refreshSquad();
    else this.score.set(`${v.total_points} points`);
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
    // Wrong: the creature bounces. With a second try it stays; otherwise it leaves.
    this.tween(obj, obj.position.clone(), 0.25, 0.04, 1);
    if (!v.retry_allowed) {
      this.clear(this.queries.balloons);
      this.clear(this.queries.crystals);
      this.clear(this.queries.orbs);
      this.flagLabel?.set(`= ${v.expected_text}`);
      this.prompt?.set(this.prompt.value.replace('?', v.expected_text));
      this.phase = 'between';
      // In Solo Squad it runs to a partner's window, or to the crystal.
      const to = HOME.clone();
      const sv = 'escaped_to' in v ? v : undefined;
      if (sv?.escaped_to && this.squadScene) {
        this.squadScene.windowPos(sv.escaped_to, to);
      } else if (sv?.crystal_hit && this.squadScene) {
        this.squadScene.crystalPos(to);
        this.squadScene.showBanner(T.crystalHit, 1.5);
      }
      this.tween(obj, to, 1.4, 0.02, 0.2, () => {
        if (sv?.crystal_hit) this.squadScene?.crystalHit();
        this.remove(creature);
        this.next();
      });
    }
  }

  private foldHome(creature: Entity, color: number): void {
    this.phase = 'between';
    const obj = creature.object3D!;
    const bird = makeBird(color).root;
    bird.position.copy(obj.position).add(new Vector3(0, 0.05, 0));
    // The bird flies towards its +X; turn it to head for the book.
    bird.rotation.y = Math.PI / 2;
    const birdEntity = this.add(bird);
    this.remove(creature);
    this.tween(bird, new Vector3(0, 0.08, -0.1), 0.9, 0.12, 0.4, () => {
      this.remove(birdEntity);
      this.next();
    });
  }

  private clearPrompt(): void {
    if (!this.prompt) return;
    this.prompt.mesh.removeFromParent();
    this.labels.delete(this.prompt.mesh);
    this.prompt = undefined;
  }

  private next(): void {
    this.clearPrompt();
    this.offer = undefined;
    if (this.squad) {
      // The squad loop hands out the next creature when the core has one.
      if (this.phase === 'between') this.phase = 'playing';
      return;
    }
    this.played += 1;
    if (this.played >= WAVE) {
      this.score.set(`Wave done! ${this.score.value}`);
      this.showMenu();
      return;
    }
    this.phase = 'playing';
    this.spawnPractice();
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
    for (const m of mixers) m.update(delta);
    if (this.phase === 'opening') this.runOpening(delta);
    if (this.squad) this.updateSquad(delta);

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
