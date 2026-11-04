/**
 * A hand held out flat, all four fingers straight and in line with the palm, pointing ahead: the
 * sign that puts the desk down where the hand is (Zia, 4 Nov 2026: "the hand decides"). Kept free
 * of Three so it can be checked on its own; points are [x, y, z] in metres, y up.
 */

export type P3 = readonly [number, number, number];

/** The joints read, by their WebXR names. */
export const FLAT_JOINTS = [
  'wrist',
  ...['index', 'middle', 'ring', 'pinky'].flatMap((f) => ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].map((j) => `${f}-finger-${j}`)),
] as const;

/** A finger is straight when its knuckle-to-tip span is this share of its bones' length at least. */
const STRAIGHT = 0.95;
/** And it goes on the way its palm bone does (cosine of the bend at the knuckle). */
const IN_LINE = 0.85;
/** The hand points this level at most (sine of its slope from the wrist to the middle tip). */
const LEVEL = 0.45;
/** And ahead of the player (cosine with the way the head faces, across). */
const AHEAD = 0.4;

const sub = (a: P3, b: P3): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (v: P3) => Math.hypot(v[0], v[1], v[2]);
const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Why a hand is not flat, or '' when it is. `at` gives a joint's point; `forward` is the head's way across (y 0). */
export function notFlat(at: (joint: string) => P3 | undefined, forward: P3): string {
  for (const f of ['index', 'middle', 'ring', 'pinky']) {
    const j = ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].map((n) => at(`${f}-finger-${n}`));
    if (j.some((p) => !p)) return `no ${f} joints`;
    const [meta, prox, inter, dist, tip] = j as P3[];
    const bones = len(sub(inter, prox)) + len(sub(dist, inter)) + len(sub(tip, dist));
    const span = sub(tip, prox);
    if (bones < 1e-4 || len(span) < STRAIGHT * bones) return `${f} bent`;
    const palm = sub(prox, meta);
    if (len(palm) < 1e-4 || dot(palm, span) / (len(palm) * len(span)) < IN_LINE) return `${f} bent at the knuckle`;
  }
  const wrist = at('wrist');
  const tip = at('middle-finger-tip');
  if (!wrist || !tip) return 'no wrist';
  const way = sub(tip, wrist);
  const l = len(way);
  if (l < 1e-4) return 'no length';
  if (Math.abs(way[1]) / l > LEVEL) return 'not level';
  const across = Math.hypot(way[0], way[2]);
  if (across < 1e-4 || (way[0] * forward[0] + way[2] * forward[2]) / across < AHEAD) return 'not pointing ahead';
  return '';
}
