/**
 * CAMERA for the smartboard race: the board's webcam watches the three
 * players, and a raised hand held still over an answer for a moment presses
 * it, as a touch would. The video is read on this device only; no picture,
 * video or hand point is sent anywhere or kept. The teacher turns it on for
 * each race, a CAMERA ON chip with the camera's own picture shows while it
 * runs, and touch keeps working all the time.
 *
 * The hand reader (MediaPipe's hand landmarker) and its files are loaded only
 * when the camera is turned on, from `camera/` beside the game, so headset
 * players never fetch them.
 */

/** A hand held over the same answer this long presses it. */
const DWELL_MS = 650;
/** Hands at most: three players, two hands each. */
const HANDS = 6;
/** The part of the camera's picture that spans the screen, so a player need not reach its edges. */
const REACH = { left: 0.12, right: 0.88, top: 0.08, bottom: 0.72 };
/** A hand this near (in screen widths) to where a cursor was is the same hand. */
const SAME_HAND = 0.12;
/** How far a cursor moves toward the hand each frame; the rest smooths shaking. */
const FOLLOW = 0.45;
/** Frames a cursor stays without its hand before it goes. */
const LOST_FRAMES = 6;
/** The index finger's tip among a hand's 21 points. */
const FINGER_TIP = 8;

/** What a hand can press: an answer or PASS. */
const PRESSABLE = '.tgt, .pass';

export interface Camera {
  stop(): void;
}

interface Cursor {
  x: number;
  y: number;
  view: HTMLDivElement;
  over: Element | null;
  since: number;
  lost: number;
  seen: boolean;
}

const CSS = `
#board .cam-chip { display: inline-flex; align-items: center; gap: 10px; background: #fff8ec; padding: 4px 12px 4px 4px; font-size: 18px; font-weight: 700; }
#board .cam-chip video { width: 80px; height: 45px; object-fit: cover; transform: scaleX(-1); background: #3a3f4b; }
#board .cam-chip .dot { width: 12px; height: 12px; border-radius: 50%; background: #c9554f; flex: none; }
#board .cam-chip.off .dot { background: #9a917f; }
.cam-cursor { position: fixed; left: 0; top: 0; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%; pointer-events: none; z-index: 40;
  border: 4px solid #fff8ec; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  background: conic-gradient(#3a3f4b calc(var(--p, 0) * 360deg), rgba(58, 63, 75, 0.25) 0); }
`;

/**
 * Starts the camera with its chip in `chip`; resolves once it reads hands,
 * or rejects (no camera, no permission, a device too weak) with touch left
 * as it was.
 */
export async function startCamera(chip: HTMLElement, base: string): Promise<Camera> {
  if (!document.getElementById('cam-css')) {
    const style = document.createElement('style');
    style.id = 'cam-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
  let stopped = false;
  const cursors: Cursor[] = [];
  let frame = 0;
  let reader: { detectForVideo(v: HTMLVideoElement, t: number): { landmarks: { x: number; y: number }[][] }; close(): void } | null = null;
  const stop = () => {
    stopped = true;
    cancelAnimationFrame(frame);
    for (const track of stream.getTracks()) track.stop();
    for (const c of cursors) c.view.remove();
    reader?.close();
    video.remove();
  };
  try {
    video.srcObject = stream;
    await video.play();
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
    const files = await FilesetResolver.forVisionTasks(`${base}camera/wasm`);
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath: `${base}camera/hand_landmarker.task`, delegate },
      runningMode: 'VIDEO' as const,
      numHands: HANDS,
    });
    // The board's graphics chip if it can, else its processor.
    reader = await HandLandmarker.createFromOptions(files, options('GPU')).catch(() => HandLandmarker.createFromOptions(files, options('CPU')));
  } catch (e) {
    stop();
    throw e;
  }
  if (stopped) return { stop };

  chip.replaceChildren(video, Object.assign(document.createElement('span'), { className: 'dot' }));
  chip.classList.remove('off');

  let lastTime = -1;
  const read = () => {
    if (stopped || !reader) return;
    frame = requestAnimationFrame(read);
    if (video.readyState < 2 || video.currentTime === lastTime) return;
    lastTime = video.currentTime;
    const hands = reader.detectForVideo(video, performance.now()).landmarks;
    const now = performance.now();
    for (const c of cursors) c.seen = false;
    for (const hand of hands) {
      const tip = hand[FINGER_TIP];
      if (!tip) continue;
      // The picture is a mirror of the room: a player's right hand is on the screen's right.
      const x = Math.min(1, Math.max(0, (1 - tip.x - REACH.left) / (REACH.right - REACH.left)));
      const y = Math.min(1, Math.max(0, (tip.y - REACH.top) / (REACH.bottom - REACH.top)));
      let near: Cursor | null = null;
      let best = SAME_HAND;
      for (const c of cursors) {
        const d = Math.hypot(c.x - x, c.y - y);
        if (!c.seen && d < best) {
          best = d;
          near = c;
        }
      }
      if (!near) {
        const view = document.createElement('div');
        view.className = 'cam-cursor';
        document.body.appendChild(view);
        near = { x, y, view, over: null, since: now, lost: 0, seen: false };
        cursors.push(near);
      } else {
        near.x += (x - near.x) * FOLLOW;
        near.y += (y - near.y) * FOLLOW;
      }
      near.seen = true;
      near.lost = 0;
    }
    for (let i = cursors.length - 1; i >= 0; i--) {
      const c = cursors[i];
      if (!c.seen && ++c.lost > LOST_FRAMES) {
        c.view.remove();
        cursors.splice(i, 1);
        continue;
      }
      const px = c.x * window.innerWidth;
      const py = c.y * window.innerHeight;
      c.view.style.transform = `translate(${px}px, ${py}px)`;
      const over = c.seen ? (document.elementFromPoint(px, py)?.closest(PRESSABLE) ?? null) : null;
      if (over !== c.over) {
        c.over = over;
        c.since = now;
      }
      const held = over ? Math.min(1, Math.max(0, (now - c.since) / DWELL_MS)) : 0;
      c.view.style.setProperty('--p', String(held));
      if (over && held >= 1) {
        over.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        // Pressed once; the hand has to leave and come back to press again.
        c.since = Infinity;
      }
    }
  };
  read();
  return { stop };
}
