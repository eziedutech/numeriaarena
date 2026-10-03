import { type AnimationMixer, Box3, type Group, type MeshBasicMaterial, Vector3 } from '@iwsdk/core';

import { Label } from './art/label.js';
import { type Figure, forgetMixers, makeBot } from './art/models.js';
import type { Poster } from './art/rooms.js';
import { type ClassMoment, classroom } from './class-events.js';

/** The robot's height in its poster, and where its feet stand (from the poster's centre). */
const BOT_H = 0.34;
const BOT_FEET = -0.19;
/** Name and status under the robot, from the poster's centre. */
const NAME_Y = -0.245;
const STATUS_Y = -0.29;
const NAME_H = 0.045;
const STATUS_H = 0.028;
/** How long each moment plays, in seconds, and the clip it plays (once). */
const MOMENT_S: Record<ClassMoment, number> = { working: 0, right: 1.2, missed: 0.8, cheer: 1.6, clap: 1.4 };
const MOMENT_CLIP: Partial<Record<ClassMoment, string>> = { right: 'cheer', cheer: 'cheer', clap: 'wave' };

interface PosterBot {
  desk: number;
  fig: Figure;
  /** The robot's resting place in the poster. */
  rest: Vector3;
  mixer?: AnimationMixer;
  name: Label;
  status: Label;
  moment: ClassMoment;
  momentLeft: number;
}

/**
 * The two rivals in the virtual bedroom: a robot in each poster beside the
 * window. Playing alone they are only posters, still. In a race they come
 * to life as on their windows on the desk: idle, a hop and a cheer for a
 * right answer, a shake for a miss, their names and points under them.
 * Everything is added to the room's group, so it goes when the room goes.
 */
export class BedroomLife {
  private bots: PosterBot[] = [];
  private shownName = ['', ''];
  private shownStatus = ['', ''];
  private racing = false;
  private recap = false;

  constructor(private room: Group) {
    const posters = (room.userData.posters ?? []) as Poster[];
    const box = new Box3();
    const size = new Vector3();
    for (const p of posters) {
      const fig = makeBot(p.desk === 1 ? 0 : 1, p.desk === 1 ? 0x3469c4 : 0x3fb6a0);
      box.setFromObject(fig.root);
      box.getSize(size);
      fig.root.scale.setScalar(size.y > 0 ? BOT_H / size.y : 1);
      // Feet on the poster's strip, its back against the paper (a pop-up, like the book).
      box.setFromObject(fig.root);
      const rest = new Vector3(p.x, p.y + BOT_FEET - box.min.y, p.z - box.min.z + 0.002);
      fig.root.position.copy(rest);
      this.room.add(fig.root);
      let mixer: AnimationMixer | undefined;
      fig.root.traverse((o) => (mixer ??= o.userData.mixer as AnimationMixer | undefined));
      const name = this.label(NAME_H, p.x, p.y + NAME_Y, p.z);
      const status = this.label(STATUS_H, p.x, p.y + STATUS_Y, p.z);
      this.bots.push({ desk: p.desk, fig, rest, mixer, name, status, moment: 'working', momentLeft: 0 });
    }
    this.still(true);
    console.info(`[room] bedroom life: ${this.bots.length} robot posters`);
  }

  private label(height: number, x: number, y: number, z: number): Label {
    const l = new Label(' ', { height, card: false });
    l.mesh.position.set(x, y, z + 0.004);
    l.mesh.visible = false;
    this.room.add(l.mesh);
    return l;
  }

  /** Playing alone the robots are a picture: no idle sway, no names. */
  private still(on: boolean): void {
    for (const b of this.bots) {
      if (b.mixer) b.mixer.timeScale = on ? 0 : 1;
      if (on) b.fig.play('idle');
      b.fig.root.position.copy(b.rest);
      b.fig.root.rotation.set(0, 0, 0);
      b.name.mesh.visible = !on;
      b.status.mesh.visible = !on;
      b.moment = 'working';
      b.momentLeft = 0;
    }
  }

  update(dt: number): void {
    if (classroom.racing !== this.racing) {
      this.racing = classroom.racing;
      this.still(!this.racing);
      console.info(this.racing ? '[room] the poster robots join the race' : '[room] the poster robots are still again');
    }
    // Moments from the race, newest last (the classroom reads them the same way).
    while (classroom.events.length) {
      const e = classroom.events.shift()!;
      const b = this.bots.find((k) => k.desk === e.desk);
      if (!b || !this.racing) continue;
      b.moment = e.moment;
      b.momentLeft = MOMENT_S[e.moment];
      const clip = MOMENT_CLIP[e.moment];
      if (clip) b.fig.play(clip, true);
    }
    if (!this.racing) return;
    if (classroom.recap !== this.recap) {
      this.recap = classroom.recap;
      // The results are up: both wave at the player.
      if (this.recap) for (const b of this.bots) b.fig.play('wave', true);
    }
    for (let i = 0; i < this.bots.length; i += 1) {
      const b = this.bots[i];
      const d = b.desk - 1;
      if (this.shownName[d] !== classroom.names[d]) {
        this.shownName[d] = classroom.names[d];
        b.name.set(classroom.names[d] || ' ');
      }
      if (this.shownStatus[d] !== classroom.status[d]) {
        this.shownStatus[d] = classroom.status[d];
        b.status.set(classroom.status[d] || ' ');
      }
      this.pose(b, dt);
    }
  }

  /** A hop for a right answer or a cheer, a shake of the body for a miss. */
  private pose(b: PosterBot, dt: number): void {
    let hop = 0;
    let shake = 0;
    if (b.momentLeft > 0) {
      b.momentLeft -= dt;
      const k = Math.max(0, b.momentLeft) / MOMENT_S[b.moment];
      if (b.moment === 'right' || b.moment === 'cheer') hop = Math.abs(Math.sin((1 - k) * Math.PI * 2)) * 0.04 * k;
      else if (b.moment === 'missed') shake = Math.sin((1 - k) * Math.PI * 6) * 0.12 * k;
    }
    b.fig.root.position.set(b.rest.x, b.rest.y + hop, b.rest.z);
    b.fig.root.rotation.set(0, 0, shake);
  }

  /** The robots stop animating and leave the room's group, so the room's clean-up never frees the shared model; labels free their canvases. */
  dispose(): void {
    for (const b of this.bots) {
      forgetMixers(b.fig.root);
      b.fig.root.removeFromParent();
      for (const l of [b.name, b.status]) {
        const mat = l.mesh.material as MeshBasicMaterial;
        mat.map?.dispose();
        mat.dispose();
      }
    }
    this.bots.length = 0;
  }
}
