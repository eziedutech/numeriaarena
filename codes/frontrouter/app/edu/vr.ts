import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  Fog,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Raycaster,
  Scene as World,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type XRTargetRaySpace,
} from "three";

import type { Lang } from "../legal";
import { loadLesson, ready, TOPICS, topic } from "./catalog";
import { C, H, Ink, type Lesson, type Pt, type Scene, W, ease } from "./ink";
import { wrap } from "./parts";

/**
 * A lesson around the learner in VR: the step's sheet stands in front as a
 * large paper panel, the step before and after wait folded at either side
 * (point at one and pull the trigger to go there), the guiding sentence
 * hangs under it, and paper digits drift in the warm air around. The sheet
 * is the same scene as on the page, drawn into a texture, and the
 * controller's ray (or a pinching hand) is its pointer. The lessons button
 * turns the sheet into the list of every lesson, so another opens in place.
 */

export interface VrWords {
  back: string;
  next: string;
  exit: string;
  of: (i: number, n: number) => string;
  all: string;
  grade: (g: number) => string;
  pick: string;
}

export interface VrOptions {
  lesson: Lesson;
  lang: Lang;
  topic: string;
  step: number;
  words: VrWords;
  onStep: (i: number) => void;
  /** Another lesson was opened from the list; the page follows it. */
  onLesson: (id: string) => void;
  onEnd: () => void;
}

/** Sheet pixels per sheet unit in VR; enough for the panel's size at arm's length. */
const SHARP = 2;
const PANEL_W = 2.4;
const PANEL_H = (PANEL_W * H) / W;
const EYE = 1.55;
/** The title and the guiding sentence stay narrower than the sheet, so they fit above and below it. */
const TEXT_W = 1.6;
const AWAY = 1.4;

function paperCanvas(w: number, h: number) {
  const el = document.createElement("canvas");
  el.width = w;
  el.height = h;
  const g = new Ink(el.getContext("2d") as CanvasRenderingContext2D);
  const texture = new CanvasTexture(el);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return { el, g, texture };
}

/** A paper panel: the sheet in front and a darker card behind it as its shadow. */
function panel(w: number, h: number, texture: CanvasTexture) {
  const group = new Group();
  const face = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map: texture }));
  const back = new Mesh(new BoxGeometry(w, h, 0.006), new MeshBasicMaterial({ color: "#efe3c8" }));
  back.position.z = -0.004;
  const shade = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: "#46321a", transparent: true, opacity: 0.22 }));
  shade.position.set(0.02, -0.035, -0.03);
  group.add(shade, back, face);
  return { group, face };
}

/** Paper digits that drift slowly around the learner. */
function digits(world: World) {
  const kinds = [C.cobalt, C.coral, C.teal, C.plum, "#e0a040"];
  const items: { mesh: Mesh; base: Vector3; speed: number; phase: number }[] = [];
  for (let i = 0; i < 28; i++) {
    const { g, texture } = paperCanvas(128, 128);
    const color = kinds[i % kinds.length];
    g.begin(128 / W);
    g.c.setTransform(1, 0, 0, 1, 0, 0);
    g.c.fillStyle = C.paper;
    g.c.fillRect(0, 0, 128, 128);
    g.c.fillStyle = color;
    g.c.font = '700 96px "Atkinson Hyperlegible", system-ui, sans-serif';
    g.c.textAlign = "center";
    g.c.textBaseline = "middle";
    g.c.fillText(String(i % 10), 64, 70);
    texture.needsUpdate = true;
    const size = 0.18 + (i % 4) * 0.06;
    const mesh = new Mesh(new PlaneGeometry(size, size), new MeshBasicMaterial({ map: texture, side: DoubleSide }));
    // Anywhere around but not between the learner and the sheet.
    const angle = 0.7 + (i / 28) * (Math.PI * 2 - 1.4) + Math.sin(i * 7.1) * 0.1;
    const r = 3 + (i % 5) * 0.9;
    const base = new Vector3(Math.sin(angle) * r, 0.5 + ((i * 37) % 30) / 10, -Math.cos(angle) * r);
    mesh.position.copy(base);
    world.add(mesh);
    items.push({ mesh, base, speed: 0.2 + (i % 3) * 0.1, phase: i * 1.7 });
  }
  return (t: number) => {
    for (const d of items) {
      d.mesh.position.y = d.base.y + Math.sin(t * d.speed + d.phase) * 0.18;
      d.mesh.rotation.y = t * d.speed * 0.6 + d.phase;
      d.mesh.rotation.z = Math.sin(t * 0.3 + d.phase) * 0.2;
    }
  };
}

/** The sand floor fading into the warm sky. */
function ground(world: World) {
  const { g, texture } = paperCanvas(512, 512);
  const c = g.c;
  const fade = c.createRadialGradient(256, 256, 40, 256, 256, 256);
  fade.addColorStop(0, "#e9d496");
  fade.addColorStop(0.6, C.sand);
  fade.addColorStop(1, "rgba(246, 231, 193, 0)");
  c.fillStyle = fade;
  c.fillRect(0, 0, 512, 512);
  texture.needsUpdate = true;
  const floor = new Mesh(new CircleGeometry(14, 48), new MeshBasicMaterial({ map: texture, transparent: true }));
  floor.rotation.x = -Math.PI / 2;
  world.add(floor);
  // Folded paper tiles under the feet, so the floor reads as paper.
  for (let i = 0; i < 6; i++) {
    const tile = new Mesh(new PlaneGeometry(0.9, 0.9), new MeshBasicMaterial({ color: i % 2 ? "#ecd9a2" : "#e5cd8c" }));
    tile.rotation.x = -Math.PI / 2;
    tile.rotation.z = i * 0.7;
    tile.position.set(Math.cos(i) * 1.6, 0.002 + i * 0.0005, Math.sin(i) * 1.6 + 0.4);
    world.add(tile);
  }
}

/** Every made lesson of a grade on one sheet, with the grades as tabs. */
export function menuScene(lang: Lang, words: VrWords, current: string, pick: (id: string) => void): Scene {
  let grade: number = topic(current)?.grade ?? 4;
  return {
    press(id) {
      if (id[0] === "g") grade = Number(id.slice(1));
      else pick(id.slice(2));
    },
    draw(g) {
      [4, 5, 6].forEach((n, i) => g.button(`g${n}`, words.grade(n).toUpperCase(), 230 + i * 190, 20, 170, 52, n === grade ? C.cobalt : C.soft));
      const list = TOPICS.filter((x) => x.grade === grade && ready(x.id));
      const rows = Math.ceil(list.length / 2);
      const rowH = Math.min(60, 520 / rows);
      list.forEach((x, i) => {
        const bx = 24 + Math.floor(i / rows) * 482;
        const by = 92 + (i % rows) * rowH;
        const h = rowH - 6;
        const hover = g.over(bx, by, 470, h);
        g.card(bx, by - (hover ? 2 : 0), 470, h, x.id === current ? C.sun : hover ? "#f8efdc" : C.paper, hover ? 1.4 : 0.8);
        // A long title folds onto a second line rather than shrinking past reading.
        const lift = hover ? 2 : 0;
        let size = Math.min(22, h * 0.5);
        while (size > 18 && g.width(x.title[lang], size, true) > 446) size -= 1;
        if (g.width(x.title[lang], size, true) <= 446) g.text(x.title[lang], bx + 12, by + h / 2 - lift, size, C.ink, "left", true);
        else {
          size = Math.min(19, h * 0.36);
          let lines = wrap(g, x.title[lang], 446, size);
          while (size > 13 && (lines.length > 2 || lines.some((l) => g.width(l, size, true) > 446))) lines = wrap(g, x.title[lang], 446, --size);
          lines.slice(0, 2).forEach((l, j) => g.text(l, bx + 12, by + h / 2 - lift + (j - 0.5) * size * 1.15, size, C.ink, "left", true));
        }
        g.hits.push({ id: `t:${x.id}`, x: bx, y: by, w: 470, h });
      });
    },
  };
}

/** Opens the session; resolves with a way to end it from the page. */
export async function openVr(o: VrOptions) {
  const xr = navigator.xr;
  if (!xr) throw new Error("no webxr");
  const session = await xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor", "hand-tracking"] });

  const renderer = new WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(1);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local-floor");
  // A headset shows only the session; an emulator in the browser shows this canvas over the page.
  renderer.setSize(window.innerWidth, window.innerHeight);
  Object.assign(renderer.domElement.style, { position: "fixed", inset: "0", zIndex: "40" });
  document.body.appendChild(renderer.domElement);
  await renderer.xr.setSession(session as unknown as Parameters<typeof renderer.xr.setSession>[0]);

  const world = new World();
  world.background = new Color("#f6e7c1");
  world.fog = new Fog("#f6e7c1", 6, 16);
  const camera = new PerspectiveCamera(70, 1, 0.05, 40);
  ground(world);
  const drift = digits(world);

  let steps = o.lesson.steps;
  let title = topic(o.topic)?.title[o.lang] ?? "";
  let current = o.topic;
  let menu: Scene | null = null;
  let at = Math.max(0, Math.min(steps.length - 1, o.step));
  let scene: Scene = steps[at].scene(o.lang);
  let opened = 0;
  let clock = 0;

  // The sheet, hinged at its left edge so a new step unfolds like a page.
  const main = paperCanvas(Math.round(W * SHARP), Math.round(H * SHARP));
  const sheet = panel(PANEL_W, PANEL_H, main.texture);
  const hinge = new Group();
  hinge.position.set(-PANEL_W / 2, EYE, -AWAY);
  sheet.group.position.x = PANEL_W / 2;
  hinge.add(sheet.group);
  world.add(hinge);

  const heading = paperCanvas(1024, 96);
  const head = panel(TEXT_W, (TEXT_W * 96) / 1024, heading.texture);
  head.group.position.set(0, EYE + PANEL_H / 2 + 0.14, -AWAY);
  world.add(head.group);

  const words = paperCanvas(1024, 160);
  const say = panel(TEXT_W, (TEXT_W * 160) / 1024, words.texture);
  say.group.position.set(0, EYE - PANEL_H / 2 - 0.17, -AWAY);
  world.add(say.group);

  const exitTex = paperCanvas(256, 80);
  const exit = panel(0.36, 0.1125, exitTex.texture);
  exit.group.position.set(0.21, EYE - PANEL_H / 2 - 0.37, -AWAY + 0.05);
  world.add(exit.group);
  const allTex = paperCanvas(256, 80);
  const all = panel(0.36, 0.1125, allTex.texture);
  all.group.position.set(-0.21, EYE - PANEL_H / 2 - 0.37, -AWAY + 0.05);
  world.add(all.group);

  // The steps before and after, folded at the sides.
  const side = (dir: -1 | 1) => {
    const art = paperCanvas(640, 400);
    const p = panel(0.8, 0.5, art.texture);
    const pivot = new Group();
    pivot.position.set(dir * (PANEL_W / 2 + 0.55), EYE, -AWAY + 0.35);
    pivot.rotation.y = -dir * 0.75;
    pivot.add(p.group);
    world.add(pivot);
    return { art, p, pivot };
  };
  const prev = side(-1);
  const next = side(1);

  const label = (g: Ink, s: string, color: string) => {
    g.card(0, 0, W, 130, color, 0);
    g.text(s, W / 2, 66, 64, C.paper, "center", true);
  };

  const paintSide = (s: ReturnType<typeof side>, i: number, word: string) => {
    s.pivot.visible = i >= 0 && i < steps.length;
    if (!s.pivot.visible) return;
    const g = s.art.g;
    g.begin(640 / W);
    steps[i].scene(o.lang).draw(g, 6);
    g.c.fillStyle = "rgba(255, 253, 248, 0.45)";
    g.c.fillRect(0, 0, W, H);
    g.crease(W / 2, 0, W / 2, H);
    label(g, `${word}  ·  ${i + 1}`, C.cobalt);
    s.art.texture.needsUpdate = true;
  };

  const paintText = () => {
    const t = heading.g;
    t.c.setTransform(1, 0, 0, 1, 0, 0);
    t.c.fillStyle = C.paper;
    t.c.fillRect(0, 0, 1024, 96);
    const name = menu ? o.words.all : title;
    let size = 40;
    while (size > 22 && t.width(name, size, true) > 820) size -= 2;
    t.text(name, 24, 48, size, C.ink, "left", true);
    if (!menu) t.text(o.words.of(at + 1, steps.length), 1000, 48, 34, C.soft, "right", true);
    heading.texture.needsUpdate = true;

    const w = words.g;
    w.c.setTransform(1, 0, 0, 1, 0, 0);
    w.c.fillStyle = C.paper;
    w.c.fillRect(0, 0, 1024, 160);
    const lines = wrap(w, menu ? o.words.pick : steps[at].say[o.lang], 980, 34).slice(0, 3);
    lines.forEach((s, i) => w.text(s, 512, 80 + (i - (lines.length - 1) / 2) * 44, 34, C.ink, "center"));
    words.texture.needsUpdate = true;

    const e = exitTex.g;
    e.c.setTransform(1, 0, 0, 1, 0, 0);
    e.c.fillStyle = C.coral;
    e.c.fillRect(0, 0, 256, 80);
    e.text(o.words.exit, 128, 42, 34, C.paper, "center", true);
    exitTex.texture.needsUpdate = true;

    const a = allTex.g;
    const word = menu ? o.words.back : o.words.all;
    a.c.setTransform(1, 0, 0, 1, 0, 0);
    a.c.fillStyle = menu ? C.soft : C.cobalt;
    a.c.fillRect(0, 0, 256, 80);
    let ws = 34;
    while (ws > 18 && a.width(word, ws, true) > 236) ws -= 2;
    a.text(word, 128, 42, ws, C.paper, "center", true);
    allTex.texture.needsUpdate = true;
  };

  const show = (i: number) => {
    menu = null;
    at = Math.max(0, Math.min(steps.length - 1, i));
    scene = steps[at].scene(o.lang);
    opened = clock;
    paintSide(prev, at - 1, o.words.back);
    paintSide(next, at + 1, o.words.next);
    paintText();
    o.onStep(at);
  };
  show(at);

  // The list in place of the sheet; picking a lesson loads it and opens its first step.
  const openMenu = () => {
    menu = menuScene(o.lang, o.words, current, (id) => {
      void loadLesson(id).then((l) => {
        steps = l.steps;
        title = topic(id)?.title[o.lang] ?? "";
        current = id;
        o.onLesson(id);
        show(0);
      });
    });
    opened = clock;
    prev.pivot.visible = false;
    next.pivot.visible = false;
    paintText();
  };

  // Pointing: each hand's ray, a line to where it lands, and what it holds.
  const ray = new Raycaster();
  const flat = new Plane();
  const hands: { space: XRTargetRaySpace; beam: Line; held: boolean }[] = [];
  const targets = () => [sheet.face, exit.face, all.face, ...[prev, next].filter((s) => s.pivot.visible).map((s) => s.p.face)];

  const aim = (space: Object3D) => {
    space.updateMatrixWorld();
    const origin = new Vector3().setFromMatrixPosition(space.matrixWorld);
    const dir = new Vector3(0, 0, -1).transformDirection(space.matrixWorld);
    ray.set(origin, dir);
    return ray.intersectObjects(targets(), false)[0];
  };
  const onSheet = (point: Vector3): Pt => {
    const local = sheet.face.worldToLocal(point.clone());
    return { x: (local.x / PANEL_W + 0.5) * W, y: (0.5 - local.y / PANEL_H) * H };
  };

  for (let i = 0; i < 2; i++) {
    const space = renderer.xr.getController(i);
    const beam = new Line(new BufferGeometry().setFromPoints([new Vector3(0, 0, 0), new Vector3(0, 0, -1)]), new LineBasicMaterial({ color: C.cobalt }));
    beam.scale.z = 3;
    space.add(beam);
    world.add(space);
    const hand = { space, beam, held: false };
    hands.push(hand);
    // The trigger, or a pinch, selects; nothing else does.
    space.addEventListener("selectstart", () => {
      const hit = aim(space);
      if (!hit) return;
      if (hit.object === prev.p.face) return show(at - 1);
      if (hit.object === next.p.face) return show(at + 1);
      if (hit.object === exit.face) return void session.end();
      if (hit.object === all.face) return menu ? show(at) : openMenu();
      const p = onSheet(hit.point);
      main.g.pointer = p;
      const id = main.g.hit(p);
      const now = menu ?? scene;
      if (id) now.press?.(id);
      else if (now.down?.(p)) hand.held = true;
    });
    space.addEventListener("selectend", () => {
      if (!hand.held) return;
      hand.held = false;
      (menu ?? scene).up?.();
    });
  }

  const start = performance.now();
  renderer.setAnimationLoop(() => {
    clock = (performance.now() - start) / 1000;
    drift(clock);

    // Unfold the sheet from its hinge when a step opens.
    const k = ease(clock, opened, 0.6);
    hinge.rotation.y = (1 - k) * 1.2;

    let pointer: Pt | null = null;
    for (const hand of hands) {
      if (hand.held) {
        hand.space.updateMatrixWorld();
        const origin = new Vector3().setFromMatrixPosition(hand.space.matrixWorld);
        const dir = new Vector3(0, 0, -1).transformDirection(hand.space.matrixWorld);
        sheet.face.updateMatrixWorld();
        flat.setFromNormalAndCoplanarPoint(new Vector3(0, 0, 1).transformDirection(sheet.face.matrixWorld), new Vector3().setFromMatrixPosition(sheet.face.matrixWorld));
        const point = new Vector3();
        ray.set(origin, dir);
        if (ray.ray.intersectPlane(flat, point)) {
          pointer = onSheet(point);
          (menu ?? scene).move?.(pointer);
          hand.beam.scale.z = origin.distanceTo(point);
        }
        continue;
      }
      const hit = aim(hand.space);
      hand.beam.scale.z = hit ? hit.distance : 3;
      if (hit?.object === sheet.face) pointer = onSheet(hit.point);
      for (const s of [prev, next]) s.p.group.scale.setScalar(hit?.object === s.p.face ? 1.06 : 1);
      exit.group.scale.setScalar(hit?.object === exit.face ? 1.08 : 1);
      all.group.scale.setScalar(hit?.object === all.face ? 1.08 : 1);
    }
    main.g.pointer = pointer;

    main.g.begin(SHARP);
    (menu ?? scene).draw(main.g, clock - opened);
    main.texture.needsUpdate = true;
    renderer.render(world, camera);
  });

  session.addEventListener("end", () => {
    renderer.setAnimationLoop(null);
    world.traverse((m) => {
      if (m instanceof Mesh) {
        m.geometry.dispose();
        const mat = m.material as MeshBasicMaterial;
        mat.map?.dispose();
        mat.dispose();
      }
    });
    renderer.dispose();
    renderer.domElement.remove();
    o.onStep(at);
    o.onEnd();
  });
  return () => void session.end();
}
