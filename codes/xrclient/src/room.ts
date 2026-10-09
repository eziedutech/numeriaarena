import { type Entity, Mesh, MeshStandardMaterial, VisibilityState, createSystem } from '@iwsdk/core';

import { BoardWriter } from './art/board.js';
import { buildRoom, type VirtualRoom } from './art/rooms.js';
import { BedroomLife } from './bedroom-life.js';
import { ClassroomLife } from './classroom-life.js';
import { DeskRoot } from './game-components.js';
import { type Room, getRoom } from './settings.js';

/** A real desk top lower or higher than this is drawn at the nearest of them. */
const DESK_TOP_MIN_M = 0.45;
const DESK_TOP_MAX_M = 1.1;
/** Before the book is put down the stand-in classroom stands round a desk of this height, this far ahead. */
const WAITING_TOP_M = 0.75;
const WAITING_Z_M = -0.45;

/**
 * The browser's XR emulator has no real room, only a grey scan in which the
 * desk cannot be told. There "my room" shows the paper classroom instead, so
 * the desk and the floor are seen. A real headset never does: IWER, which
 * only the emulator injects, is what tells the two apart.
 */
function emulated(): boolean {
  return !!(window as unknown as { IWER_DEVICE?: unknown }).IWER_DEVICE;
}

/**
 * The emulator's stand-in for the real room is the paper classroom in a cool
 * blue-grey and without its classmates and teacher, so it is never mistaken
 * for the classroom room of the same paper.
 */
const STAND_IN_TINT = 0x8fa8c8;

/**
 * The room around the desk in the headset. "My room" is the real one through
 * passthrough; a virtual room covers it, lined up with the real desk so the
 * book still lies on it and the hands meet the real top. It shows only once
 * the book is placed (the real desk has to be seen to place it) and never in
 * the browser preview.
 */
export class RoomSystem extends createSystem({
  desks: { required: [DeskRoot] },
}) {
  private shown?: Entity;
  /** The shown room is the emulator's stand-in for the real room. */
  private standIn = false;
  private tint?: MeshStandardMaterial;
  /** The question of Measure Hunt, in chalk on the stand-in's board. */
  private writer?: BoardWriter;
  /** The rivals, classmates, teacher, board and clock in the classroom; the robot posters in the bedroom. */
  private life?: ClassroomLife | BedroomLife;
  /** What the shown room was built for; rebuilt when any of it changes. */
  private room: Room = 'here';
  private x = 0;
  private top = 0;
  private z = 0;
  private ry = 0;

  update(delta: number): void {
    const chosen = getRoom();
    const standIn = chosen === 'here' && emulated();
    const room: Room = standIn ? 'classroom' : chosen;
    let desk: Entity | undefined;
    for (const e of this.queries.desks.entities) desk = e;
    const obj = desk?.object3D;
    const immersive = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    const placed = !!desk?.getValue(DeskRoot, 'placed');
    // The emulator's stand-in shows from the start, before the book is put down (a real room needs the desk seen first).
    if (room === 'here' || !immersive || !obj || (!placed && !standIn)) {
      this.hide();
      return;
    }
    const top = placed ? Math.min(Math.max(obj.position.y, DESK_TOP_MIN_M), DESK_TOP_MAX_M) : WAITING_TOP_M;
    const x = placed ? obj.position.x : 0;
    const z = placed ? obj.position.z : WAITING_Z_M;
    const ry = placed ? obj.rotation.y : 0;
    const same = this.shown && room === this.room && standIn === this.standIn && x === this.x && top === this.top && z === this.z && ry === this.ry;
    if (same) {
      this.life?.update(Math.min(delta, 0.1));
      this.writer?.update(Math.min(delta, 0.1), this.camera);
      return;
    }
    // Built once per placement: the book is put down once per session.
    this.hide();
    const group = buildRoom(room as VirtualRoom, top);
    // The floor stays at the real floor (local-floor: y = 0) under the book.
    group.position.set(x, 0, z);
    group.rotation.set(0, ry, 0);
    if (standIn) {
      this.tint = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true, color: STAND_IN_TINT });
      group.traverse((o) => {
        if (o instanceof Mesh && o.name.endsWith('-paper')) o.material = this.tint!;
      });
      this.writer = new BoardWriter(top);
      group.add(this.writer.group);
    } else {
      this.life = room === 'classroom' ? new ClassroomLife(group) : new BedroomLife(group);
    }
    this.shown = this.world.createTransformEntity(group);
    this.room = room;
    this.standIn = standIn;
    this.x = x;
    this.top = top;
    this.z = z;
    this.ry = ry;
    console.info(`[room] ${room} around the desk (top ${top.toFixed(2)} m)`);
  }

  private hide(): void {
    if (!this.shown) return;
    this.life?.dispose();
    this.life = undefined;
    // The paper materials are shared with the book and the game: only the room's own geometry goes.
    this.shown.object3D?.traverse((o) => (o as Mesh).geometry?.dispose());
    this.tint?.dispose();
    this.tint = undefined;
    this.writer?.dispose();
    this.writer = undefined;
    this.shown.dispose({ disposeResources: false });
    this.shown = undefined;
    console.info('[room] virtual room hidden');
  }
}
