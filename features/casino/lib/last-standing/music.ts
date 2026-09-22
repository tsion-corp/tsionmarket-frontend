"use client";

// The Last Man arena's looping background track, synthesised live with the Web
// Audio API — a small minor-key chiptune groove (bass pulse, arpeggio, hat
// ticks) rather than a shipped audio file, so nothing downloads and the loop
// never has a seam. A lookahead scheduler keeps timing steady: a coarse timer
// wakes every 150ms and schedules every note that falls inside the next 350ms
// window on the audio clock, which is immune to main-thread jitter.
//
// Exposed as an external store (subscribe + snapshot) so the play/pause button
// reads it with useSyncExternalStore. Playback only ever starts from a click —
// autoplay policy would block anything else — and never throws: the game must
// not care whether audio works.

let context: AudioContext | null = null;
let master: GainNode | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let nextNoteTime = 0;
let step = 0;
let playing = false;
// Red-zone flag: at ten seconds on the round clock the groove hands over to a
// bare clock tick-tock, and hands back if the round survives. Checked at
// schedule time, so the switch lands on the next grid note without a seam.
let urgent = false;

const listeners = new Set<() => void>();

const TEMPO_BPM = 112;
const STEP_SECONDS = 60 / TEMPO_BPM / 2; // eighth notes
const LOOKAHEAD_MS = 150;
const SCHEDULE_AHEAD_S = 0.35;

// One bar of A minor, four times over with a moving bass — 32 eighth-note
// steps. 0 means rest. The arp voice walks A–C–E–G shapes an octave up.
const BASS = [
  110, 0, 110, 0, 220, 0, 110, 0, 87.3, 0, 87.3, 0, 174.6, 0, 87.3, 0, 130.8, 0, 130.8, 0, 261.6, 0,
  130.8, 0, 98, 0, 98, 0, 196, 0, 98, 196,
];
const ARP = [
  440, 523.3, 659.3, 523.3, 440, 523.3, 659.3, 783.99, 349.2, 440, 523.3, 440, 349.2, 440, 523.3,
  659.3, 392, 493.9, 587.3, 493.9, 392, 493.9, 587.3, 740, 392, 493.9, 587.3, 493.9, 784, 740,
  587.3, 493.9,
];

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!context) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      context = new Ctor();
    } catch {
      return null;
    }
  }
  return context;
}

function note(
  ac: AudioContext,
  out: GainNode,
  freq: number,
  at: number,
  hold: number,
  peak: number,
  type: OscillatorType
): void {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + hold);
  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + hold + 0.02);
}

// A short filtered-noise tick standing in for a hi-hat.
function hat(ac: AudioContext, out: GainNode, at: number, open: boolean): void {
  const length = Math.ceil(ac.sampleRate * 0.05);
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  // Deterministic pseudo-noise: a plain LCG, so no Math.random in render paths
  // and the tick sounds identical every bar.
  let seed = 1234567;
  for (let i = 0; i < length; i++) {
    seed = (seed * 48271) % 2147483647;
    data[i] = (seed / 2147483647) * 2 - 1;
  }
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 6000;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(open ? 0.09 : 0.05, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + (open ? 0.05 : 0.025));
  src.connect(filter).connect(gain).connect(out);
  src.start(at);
  src.stop(at + 0.06);
}

function scheduleStep(ac: AudioContext, out: GainNode, s: number, at: number): void {
  if (urgent) {
    // The red zone: the groove stops and a clock takes over. Tick and tock
    // alternate on the quarter notes, over a low pulse at the top of each bar.
    if (s % 2 === 0) {
      const tik = (s / 2) % 2 === 0;
      note(ac, out, tik ? 1180 : 780, at, 0.06, 0.16, "square");
    }
    if (s % 8 === 0) note(ac, out, 98, at, STEP_SECONDS * 1.8, 0.1, "triangle");
    return;
  }
  const bass = BASS[s % BASS.length];
  if (bass) note(ac, out, bass, at, STEP_SECONDS * 1.6, 0.12, "triangle");
  const arp = ARP[s % ARP.length];
  if (arp && s % 2 === 0) note(ac, out, arp, at, STEP_SECONDS * 0.9, 0.045, "square");
  hat(ac, out, at, s % 8 === 4);
}

function tick(): void {
  const ac = context;
  if (!ac || !master || !playing) return;
  try {
    while (nextNoteTime < ac.currentTime + SCHEDULE_AHEAD_S) {
      scheduleStep(ac, master, step, nextNoteTime);
      step = (step + 1) % BASS.length;
      nextNoteTime += STEP_SECONDS;
    }
  } catch {
    // Scheduling glitch — drop this window rather than the whole loop.
  }
}

// Flip the track into (or out of) the red-zone clock. Takes effect on the next
// scheduled note; a no-op while the same mode is already set or nothing plays.
export function setUrgentMode(on: boolean): void {
  urgent = on;
}

export function isMusicPlaying(): boolean {
  return playing;
}

export function subscribeMusic(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notify(): void {
  for (const cb of listeners) cb();
}

// Starts the loop. Must be called from a user gesture (the play button) so the
// context is allowed to run. Safe to call twice.
export function startMusic(): void {
  if (playing) return;
  const ac = audioContext();
  if (!ac) return;
  try {
    if (ac.state === "suspended") {
      // resume() REJECTS when the browser will not allow audio yet. Left
      // unhandled, `playing` stays true against a silent context and every
      // later attempt returns early at the guard above — silence for good.
      void ac.resume().catch(() => markSilent());
    }
    master = ac.createGain();
    // Quiet by design: it sits under the game, it is not the game.
    master.gain.setValueAtTime(0.0001, ac.currentTime);
    master.gain.exponentialRampToValueAtTime(0.55, ac.currentTime + 0.4);
    master.connect(ac.destination);
    step = 0;
    nextNoteTime = ac.currentTime + 0.05;
    playing = true;
    timer = setInterval(tick, LOOKAHEAD_MS);
    tick();
    notify();
  } catch {
    playing = false;
  }
}

/**
 * Lets a suspended context run again.
 *
 * A browser hands back a suspended AudioContext when it is created without a
 * user gesture. `startMusic` asks it to resume, but that ask is refused on a
 * cold document while `playing` is already true — so nothing would ever ask
 * again. This is the second ask, made from a real gesture.
 */
export function resumeMusic(): void {
  // Rejected until the browser will allow audio, and an unhandled rejection
  // here would surface as a console error on every refused attempt.
  if (context && context.state === "suspended") void context.resume().catch(() => {});
}

/**
 * Rolls back to "not playing" without a fade.
 *
 * For the case where the track never actually became audible: there is
 * nothing to fade, and the flag has to clear so the next gesture can try.
 */
function markSilent(): void {
  playing = false;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  master = null;
  notify();
}

/** Whether sound is genuinely coming out, not merely requested. */
export function isMusicAudible(): boolean {
  return playing && context?.state === "running";
}

// Pauses the loop with a short fade so it never clicks off mid-note.
export function stopMusic(): void {
  if (!playing) return;
  playing = false;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  const ac = context;
  const out = master;
  master = null;
  if (ac && out) {
    try {
      out.gain.setValueAtTime(out.gain.value, ac.currentTime);
      out.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.25);
      setTimeout(() => out.disconnect(), 300);
    } catch {
      try {
        out.disconnect();
      } catch {
        // Already gone.
      }
    }
  }
  notify();
}

// Events worth trying on.
//
// Only some of these grant "transient activation", the permission a browser
// needs before it will let audio run: a pointer or key going DOWN does,
// pointermove, wheel and scroll do NOT. They are listened for anyway, because
// on a page that already has activation they start the track sooner — but an
// attempt from one of them can leave the context suspended, which is why
// arming does not stop at the first event.
const GESTURES = [
  "pointerdown",
  "pointerup",
  "click",
  "keydown",
  "touchend",
  "touchstart",
  "pointermove",
  "wheel",
  "scroll",
] as const;

let armed: (() => void) | null = null;

/**
 * Starts the track at the first interaction that the browser will accept.
 *
 * `startMusic` only takes effect inside a user gesture, so a player who
 * arrived on a cold document (a shared link, a fresh tab) gets silence no
 * matter what the arena asks for.
 *
 * It keeps listening until sound is actually coming out. Stopping at the first
 * event was the bug: a mouse moving across the page fires `pointermove`
 * without granting activation, so the attempt it triggered left the context
 * suspended and nothing ever asked again.
 *
 * Returns the disarm, so leaving the arena cannot leave listeners behind that
 * would start a game's music on another page.
 */
export function armMusicOnGesture(): () => void {
  if (typeof window === "undefined") return () => {};
  // Already waiting: keep the first arming rather than stacking listeners.
  if (armed) return armed;

  const attempt = () => {
    resumeMusic();
    startMusic();
    if (isMusicAudible()) disarm();
  };
  const disarm = () => {
    for (const type of GESTURES) window.removeEventListener(type, attempt);
    armed = null;
  };

  for (const type of GESTURES) {
    // Passive: this must never delay a scroll.
    window.addEventListener(type, attempt, { passive: true });
  }
  armed = disarm;
  return disarm;
}

/** Stops waiting for an interaction, wherever the arming happened. */
export function disarmMusic(): void {
  armed?.();
}

/** Whether the track is waiting on a first interaction. For tests and the UI. */
export function isMusicArmed(): boolean {
  return armed !== null;
}
