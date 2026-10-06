import { musicOn, onSettings, soundOn } from './settings.js';

/**
 * Every sound of the game, made here with Web Audio, no sound files: paper
 * (taps, folds, a soft thud) from filtered noise, a soft marimba and bell
 * from a few sine partials, a paper "boing" for a wrong answer, a balloon
 * pop, clock ticks, a small fanfare, and quiet marimba music made up as it
 * plays. One module for the desk in XR, the browser game, the home page,
 * the smartboard and Fold Town.
 *
 * The browser lets sound start only after the player has touched the page,
 * so the AudioContext opens on the first press or key (entering XR is one).
 * Sounds asked for before then are simply not heard.
 */
export type Cue =
  /** A paper button pressed. */
  | 'tap'
  /** A sheet folded: a creature folding up to fly home, a card opening. */
  | 'fold'
  /** A sheet unfolding the other way: a piece taken away, a card closed. */
  | 'unfold'
  /** A soft paper thud: a piece set down in the town, a crystal let go. */
  | 'place'
  /** A crystal or a town piece picked up. */
  | 'grab'
  /** Two crystals joined into an orb. */
  | 'join'
  | 'right'
  | 'wrong'
  | 'pop'
  /** One of the last ten seconds; `tickLast` for the last three. */
  | 'tick'
  | 'tickLast'
  | 'timeUp'
  /** A wave or a race begins. */
  | 'wave'
  /** Results open. */
  | 'fanfare'
  /** A star on the results; `step` 0, 1, 2 rises in pitch. */
  | 'star'
  /** A building finished, a new land or landmark: a small sparkle. */
  | 'sparkle';

/** A place in the world (metres), for a sound heard from where it happens in XR. */
export interface Spot {
  x: number;
  y: number;
  z: number;
}

export interface SfxOptions {
  at?: Spot;
  /** For `star`: which star (0, 1, 2). */
  step?: number;
}

const SFX_LEVEL = 0.8;
const MUSIC_LEVEL = 0.32;

let ctx: AudioContext | null = null;
let sfxBus: GainNode;
let musicBus: GainNode;
let noise: AudioBuffer;
/** Where the listener's head is in XR, asked for only when a placed sound plays. */
let ears: ((pos: Float32Array, forward: Float32Array, up: Float32Array) => boolean) | null = null;
const earPos = new Float32Array(3);
const earFwd = new Float32Array(3);
const earUp = new Float32Array(3);

/** Opens the AudioContext (or wakes it) on a press, a touch or a key. */
function unlock(): void {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      ctx = new Ctor({ latencyHint: 'interactive' });
    } catch {
      return;
    }
    const out = ctx.createDynamicsCompressor();
    out.threshold.value = -14;
    out.ratio.value = 4;
    out.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = soundOn() ? SFX_LEVEL : 0;
    sfxBus.connect(out);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0;
    musicBus.connect(out);
    // One second of white noise, read from a random place for every paper sound.
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    syncMusic();
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

if (typeof window !== 'undefined') {
  for (const type of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(type, unlock, { capture: true, passive: true });
  // Every paper button on a page taps; the smartboard's answers make their own sound.
  document.addEventListener(
    'click',
    (e) => {
      const b = (e.target as Element | null)?.closest?.('button');
      if (b && !b.matches('.tgt, .pass, [data-quiet]')) sfx('tap');
    },
    true,
  );
  // A hidden page (another tab, the headset off) keeps quiet.
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend();
    else void ctx.resume();
  });
  onSettings(() => {
    if (!ctx) return;
    sfxBus.gain.setTargetAtTime(soundOn() ? SFX_LEVEL : 0, ctx.currentTime, 0.05);
    syncMusic();
  });
}

/**
 * Gives the listener's head for sounds placed in the world: `f` writes its
 * position, forward and up into the arrays and says whether it could (in XR).
 */
export function setEars(f: typeof ears): void {
  ears = f;
}

/** Plays a sound now; with `at`, from that place when the listener's head is known. */
export function sfx(cue: Cue, opts?: SfxOptions): void {
  if (!ctx || ctx.state !== 'running' || !soundOn()) return;
  const t = ctx.currentTime + 0.005;
  const out = placed(opts?.at);
  const vary = 0.94 + Math.random() * 0.12;
  switch (cue) {
    case 'tap':
      crinkle(out, t, 0.5, 2600 * vary, 1.4, 0.035);
      crinkle(out, t + 0.012, 0.22, 5200 * vary, 1, 0.02);
      break;
    case 'fold':
      sweep(out, t, 0.32, 900, 3200 * vary, 0.2);
      crinkle(out, t + 0.2, 0.42, 3000 * vary, 1.2, 0.03);
      break;
    case 'unfold':
      sweep(out, t, 0.28, 3200 * vary, 900, 0.18);
      crinkle(out, t + 0.17, 0.3, 1800 * vary, 1, 0.04);
      break;
    case 'place':
      thud(out, t, 0.5, 170 * vary);
      crinkle(out, t, 0.25, 1400 * vary, 0.8, 0.05);
      break;
    case 'grab':
      crinkle(out, t, 0.35, 3800 * vary, 1.6, 0.025);
      tone(out, 'sine', 980 * vary, t, 0.06, 0.003, 0.05);
      break;
    case 'join':
      sweep(out, t, 0.18, 1200, 4000, 0.15);
      marimba(out, 659.25, t + 0.08, 0.32);
      marimba(out, 987.77, t + 0.16, 0.28);
      break;
    case 'right': {
      // Two arpeggios up a major chord, taken in turn, with a little bell on top.
      const notes = Math.random() < 0.5 ? RIGHT_A : RIGHT_B;
      for (let i = 0; i < notes.length; i++) marimba(out, notes[i], t + i * 0.085, 0.38);
      bell(out, notes[notes.length - 1] * 2, t + 0.2, 0.09);
      break;
    }
    case 'wrong':
      boing(out, t, 0.32 * vary);
      thud(out, t, 0.25, 140);
      break;
    case 'pop':
      crinkle(out, t, 0.9, 1800 * vary, 0.6, 0.045, 'highpass');
      tone(out, 'sine', 820 * vary, t, 0.32, 0.002, 0.06, 180);
      break;
    case 'tick':
      woodblock(out, t, 1500, 0.22);
      break;
    case 'tickLast':
      woodblock(out, t, 2100, 0.32);
      break;
    case 'timeUp':
      marimba(out, 783.99, t, 0.36);
      marimba(out, 659.25, t + 0.12, 0.36);
      marimba(out, 523.25, t + 0.24, 0.4);
      bell(out, 261.63, t + 0.24, 0.12);
      break;
    case 'wave':
      sweep(out, t, 0.16, 800, 2600, 0.16);
      marimba(out, 523.25, t + 0.05, 0.32);
      marimba(out, 783.99, t + 0.16, 0.36);
      break;
    case 'fanfare':
      for (let i = 0; i < FANFARE.length; i++) marimba(out, FANFARE[i], t + i * 0.1, 0.36);
      for (const f of FANFARE_CHORD) bell(out, f, t + 0.42, 0.08);
      crinkle(out, t + 0.42, 0.18, 6000, 0.7, 0.35, 'highpass');
      break;
    case 'star': {
      const f = STARS[Math.min(Math.max(opts?.step ?? 0, 0), STARS.length - 1)];
      bell(out, f, t, 0.16);
      marimba(out, f / 2, t, 0.22);
      break;
    }
    case 'sparkle':
      for (let i = 0; i < SPARKLE.length; i++) bell(out, SPARKLE[i], t + i * 0.06, 0.07);
      break;
  }
}

const RIGHT_A = [659.25, 783.99, 1046.5];
const RIGHT_B = [523.25, 659.25, 783.99];
const FANFARE = [523.25, 659.25, 783.99, 1046.5];
const FANFARE_CHORD = [1046.5, 1318.51, 1567.98];
const STARS = [1046.5, 1318.51, 1567.98];
const SPARKLE = [1567.98, 2093, 2637.02];

// ------------------------------------------------------------ building blocks

/** Where a sound goes: straight to the effects, or through a panner at `at`. */
function placed(at: Spot | undefined): AudioNode {
  const c = ctx!;
  if (!at || !ears || !ears(earPos, earFwd, earUp)) return sfxBus;
  const l = c.listener;
  if (l.positionX) {
    const t = c.currentTime;
    l.positionX.setValueAtTime(earPos[0], t);
    l.positionY.setValueAtTime(earPos[1], t);
    l.positionZ.setValueAtTime(earPos[2], t);
    l.forwardX.setValueAtTime(earFwd[0], t);
    l.forwardY.setValueAtTime(earFwd[1], t);
    l.forwardZ.setValueAtTime(earFwd[2], t);
    l.upX.setValueAtTime(earUp[0], t);
    l.upY.setValueAtTime(earUp[1], t);
    l.upZ.setValueAtTime(earUp[2], t);
  } else {
    l.setPosition(earPos[0], earPos[1], earPos[2]);
    l.setOrientation(earFwd[0], earFwd[1], earFwd[2], earUp[0], earUp[1], earUp[2]);
  }
  const p = new PannerNode(c, {
    panningModel: 'HRTF',
    distanceModel: 'inverse',
    refDistance: 0.6,
    rolloffFactor: 0.6,
    positionX: at.x,
    positionY: at.y,
    positionZ: at.z,
  });
  p.connect(sfxBus);
  return p;
}

/** A gain that rises in `attack` and dies away over `decay`. */
function envelope(dest: AudioNode, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(dest);
  return g;
}

function tone(dest: AudioNode, type: OscillatorType, f: number, t: number, peak: number, attack: number, decay: number, fEnd?: number): OscillatorNode {
  const o = ctx!.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (fEnd) o.frequency.exponentialRampToValueAtTime(fEnd, t + attack + decay);
  o.connect(envelope(dest, t, peak, attack, decay));
  o.start(t);
  o.stop(t + attack + decay + 0.05);
  return o;
}

/** A short burst of filtered noise: paper rubbed or tapped. */
function crinkle(dest: AudioNode, t: number, peak: number, f: number, q: number, decay: number, type: BiquadFilterType = 'bandpass'): void {
  const c = ctx!;
  const s = c.createBufferSource();
  s.buffer = noise;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = f;
  filter.Q.value = q;
  s.connect(filter);
  filter.connect(envelope(dest, t, peak, 0.002, decay));
  s.start(t, Math.random() * 0.8);
  s.stop(t + decay + 0.05);
}

/** Noise through a band that slides from `f0` to `f1`: a sheet swept through the air. */
function sweep(dest: AudioNode, t: number, peak: number, f0: number, f1: number, dur: number): void {
  const c = ctx!;
  const s = c.createBufferSource();
  s.buffer = noise;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.1;
  filter.frequency.setValueAtTime(f0, t);
  filter.frequency.exponentialRampToValueAtTime(f1, t + dur);
  s.connect(filter);
  filter.connect(envelope(dest, t, peak, dur * 0.4, dur * 0.6));
  s.start(t, Math.random() * 0.7);
  s.stop(t + dur + 0.05);
}

/** A low soft knock, like paper set down on a table. */
function thud(dest: AudioNode, t: number, peak: number, f: number): void {
  tone(dest, 'sine', f, t, peak, 0.004, 0.09, f * 0.6);
}

/** A soft marimba note: the tone and its fourth partial, a little mallet click. */
function marimba(dest: AudioNode, f: number, t: number, peak: number): void {
  tone(dest, 'sine', f, t, peak, 0.004, 0.55);
  tone(dest, 'sine', f * 3.93, t, peak * 0.18, 0.002, 0.07);
  crinkle(dest, t, peak * 0.15, f * 2, 2, 0.012);
}

/** A small bell: partials that are not whole multiples, the high ones dying first. */
function bell(dest: AudioNode, f: number, t: number, peak: number): void {
  tone(dest, 'sine', f, t, peak, 0.003, 1.2);
  tone(dest, 'sine', f * 2.76, t, peak * 0.45, 0.003, 0.6);
  tone(dest, 'sine', f * 5.4, t, peak * 0.2, 0.002, 0.3);
}

/** A wooden tick. */
function woodblock(dest: AudioNode, t: number, f: number, peak: number): void {
  tone(dest, 'sine', f, t, peak, 0.001, 0.035);
  tone(dest, 'triangle', f * 0.5, t, peak * 0.4, 0.001, 0.025);
  crinkle(dest, t, peak * 0.4, f * 1.5, 3, 0.01);
}

/** A funny soft spring falling in pitch, wobbling: a wrong answer, never a buzzer. */
function boing(dest: AudioNode, t: number, peak: number): void {
  const c = ctx!;
  const o = c.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(330, t);
  o.frequency.exponentialRampToValueAtTime(150, t + 0.38);
  const wobble = c.createOscillator();
  wobble.frequency.value = 13;
  const depth = c.createGain();
  depth.gain.setValueAtTime(22, t);
  depth.gain.linearRampToValueAtTime(6, t + 0.4);
  wobble.connect(depth);
  depth.connect(o.frequency);
  const soft = c.createBiquadFilter();
  soft.type = 'lowpass';
  soft.frequency.value = 1300;
  o.connect(soft);
  soft.connect(envelope(dest, t, peak, 0.01, 0.42));
  o.start(t);
  wobble.start(t);
  o.stop(t + 0.5);
  wobble.stop(t + 0.5);
}

// ------------------------------------------------------------ music

/**
 * Quiet marimba music, made up as it plays: four chords round and round
 * (C, A minor, F, G), a low note on the first and third beat of a bar, and
 * the chord's notes picked now and then on the eighths, with rests between
 * so it stays in the background. The low notes stay above 170 Hz, which
 * laptop and headset speakers still play. Notes are planned a little ahead
 * on a timer, not on the frame loop.
 */
const BEAT_S = 60 / 72;
const CHORDS = [
  [261.63, 329.63, 392.0, 523.25, 659.25],
  [220.0, 261.63, 329.63, 440.0, 523.25],
  [174.61, 220.0, 261.63, 349.23, 440.0],
  [196.0, 246.94, 293.66, 392.0, 493.88],
];
const AHEAD_S = 0.4;
let musicTimer = 0;
/** The next eighth note to plan, and when it sounds. */
let step = 0;
let stepAt = 0;
let lastNote = -1;

function syncMusic(): void {
  if (!ctx) return;
  const on = musicOn();
  musicBus.gain.setTargetAtTime(on ? MUSIC_LEVEL : 0, ctx.currentTime, 0.4);
  if (on && !musicTimer) {
    console.info('[audio] music on');
    stepAt = ctx.currentTime + 0.3;
    musicTimer = window.setInterval(planMusic, 120);
  } else if (!on && musicTimer) {
    // Once faded out it stops planning notes.
    window.setTimeout(() => {
      if (!musicOn() && musicTimer) {
        window.clearInterval(musicTimer);
        musicTimer = 0;
      }
    }, 2000);
  }
}

function planMusic(): void {
  const c = ctx;
  if (!c || c.state !== 'running') return;
  // Back from a pause: start again from now instead of catching up.
  if (stepAt < c.currentTime) stepAt = c.currentTime + 0.05;
  while (stepAt < c.currentTime + AHEAD_S) {
    const bar = Math.floor(step / 8);
    const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
    const inBar = step % 8;
    if (inBar === 0) marimba(musicBus, chord[0], stepAt, 0.5);
    if (inBar === 4) marimba(musicBus, chord[1], stepAt, 0.38);
    // A melody note on about two eighths in five, never the same twice running.
    const odds = inBar % 2 === 0 ? 0.55 : 0.28;
    if (Math.random() < odds) {
      let n = 1 + Math.floor(Math.random() * (chord.length - 1));
      if (n === lastNote) n = n === chord.length - 1 ? 1 : n + 1;
      lastNote = n;
      marimba(musicBus, chord[n], stepAt, 0.32 + Math.random() * 0.12);
    }
    step = (step + 1) % (8 * 2 * CHORDS.length);
    stepAt += BEAT_S / 2;
  }
}
