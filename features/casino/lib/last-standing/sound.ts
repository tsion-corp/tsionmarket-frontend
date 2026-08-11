"use client";

// The Last Man game's sound palette, synthesised with the Web Audio API like
// the chess board's (lib/casino/chess/sound.ts) so no audio asset has to ship
// or download. Silent on the server and wherever Web Audio is unavailable, and
// it never throws — a missing sound must never break a wager or a reveal.

// The player's on/off switch, persisted so a muted table stays muted. Exposed
// as an external store (subscribe + snapshot) so the toggle button reads it
// with useSyncExternalStore — reading localStorage in an effect and calling
// setState would cascade a render, and reading it during render would not
// survive hydration.
const SOUND_KEY = "wsws.lastman.sound.v2";
let enabledCache: boolean | null = null;
const listeners = new Set<() => void>();

export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (enabledCache === null) {
    // Off until the player presses play: one switch governs the looping track
    // and these cues together, and audio nobody asked for is just noise.
    enabledCache = window.localStorage.getItem(SOUND_KEY) === "on";
  }
  return enabledCache;
}

export function setSoundEnabled(on: boolean): void {
  enabledCache = on;
  try {
    window.localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // Storage full or blocked — the in-memory switch still works for the session.
  }
  for (const cb of listeners) cb();
}

export function subscribeSound(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

let context: AudioContext | null = null;

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

function tone(
  ac: AudioContext,
  {
    freqStart,
    freqEnd,
    at = 0,
    attack = 0.005,
    hold = 0.12,
    peak = 0.22,
    type = "triangle" as OscillatorType,
  }: {
    freqStart: number;
    freqEnd: number;
    at?: number;
    attack?: number;
    hold?: number;
    peak?: number;
    type?: OscillatorType;
  }
): void {
  const now = ac.currentTime + at;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, now);
  osc.frequency.exponentialRampToValueAtTime(freqEnd, now + hold * 0.6);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + hold);
  osc.connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + hold + 0.02);
}

function ready(): AudioContext | null {
  if (!isSoundEnabled()) return null;
  const ac = audioContext();
  if (!ac) return null;
  // Autoplay policy suspends the context until a gesture. The wager click is
  // one, so resuming here lets everything after it (ticks, the reveal) sound.
  if (ac.state === "suspended") void ac.resume();
  return ac;
}

// The wager confirmed — two quick coin-drop knocks, low then bright.
export function playWagerSound(): void {
  const ac = ready();
  if (!ac) return;
  try {
    tone(ac, { freqStart: 320, freqEnd: 210, hold: 0.08, peak: 0.24 });
    tone(ac, { freqStart: 520, freqEnd: 640, at: 0.09, hold: 0.12, peak: 0.2, type: "sine" });
  } catch {
    // The wager still landed; stay silent.
  }
}

// One clock tick of the final countdown. The last three seconds ring higher and
// harder, the way the panel's copy also turns urgent.
export function playTickSound(final: boolean): void {
  const ac = ready();
  if (!ac) return;
  try {
    tone(ac, {
      freqStart: final ? 1100 : 750,
      freqEnd: final ? 900 : 640,
      attack: 0.002,
      hold: 0.05,
      peak: final ? 0.16 : 0.09,
      type: "square",
    });
  } catch {
    // Just a tick; stay silent.
  }
}

// Someone outbid the player as last standing — a two-note descending alert,
// the "you've been dethroned" moment this game is built around.
export function playDethronedSound(): void {
  const ac = ready();
  if (!ac) return;
  try {
    tone(ac, { freqStart: 880, freqEnd: 660, attack: 0.004, hold: 0.1, peak: 0.18, type: "sine" });
    tone(ac, {
      freqStart: 660,
      freqEnd: 440,
      at: 0.11,
      attack: 0.004,
      hold: 0.16,
      peak: 0.18,
      type: "sine",
    });
  } catch {
    // Stay silent.
  }
}

// The clock hit zero. A loud game-show buzzer first — two rough detuned
// voices, the unmistakable "time's up" — then the low rising sweep hanging
// under the winner-calculating suspense that follows it.
export function playRoundEndSound(): void {
  const ac = ready();
  if (!ac) return;
  try {
    // The buzzer: harsh, flat, and deliberately the loudest thing in the game.
    tone(ac, {
      freqStart: 112,
      freqEnd: 96,
      attack: 0.006,
      hold: 0.85,
      peak: 0.34,
      type: "sawtooth",
    });
    tone(ac, {
      freqStart: 118,
      freqEnd: 100,
      attack: 0.006,
      hold: 0.85,
      peak: 0.3,
      type: "square",
    });
    tone(ac, {
      freqStart: 224,
      freqEnd: 192,
      attack: 0.006,
      hold: 0.8,
      peak: 0.14,
      type: "square",
    });
    // Then the suspense sweep, once the buzzer has died away.
    tone(ac, {
      freqStart: 140,
      freqEnd: 300,
      at: 0.95,
      attack: 0.03,
      hold: 0.9,
      peak: 0.12,
      type: "sawtooth",
    });
    tone(ac, { freqStart: 210, freqEnd: 450, at: 1.0, attack: 0.03, hold: 0.9, peak: 0.08 });
  } catch {
    // Stay silent.
  }
}

// The reveal. A jackpot fanfare when this wallet won; a soft resolving chime
// when someone else did, so every table hears the round close.
export function playRevealSound(youWon: boolean): void {
  const ac = ready();
  if (!ac) return;
  try {
    if (youWon) {
      [523, 659, 784, 1047].forEach((freq, i) => {
        tone(ac, {
          freqStart: freq,
          freqEnd: freq,
          at: i * 0.13,
          attack: 0.01,
          hold: 0.22,
          peak: 0.22,
          type: "sine",
        });
      });
      // A sparkle over the last note.
      tone(ac, { freqStart: 1568, freqEnd: 2093, at: 0.5, hold: 0.25, peak: 0.1, type: "sine" });
    } else {
      [440, 392, 349].forEach((freq, i) => {
        tone(ac, {
          freqStart: freq,
          freqEnd: freq,
          at: i * 0.14,
          attack: 0.01,
          hold: 0.18,
          peak: 0.12,
          type: "sine",
        });
      });
    }
  } catch {
    // Stay silent.
  }
}

// A claim swept winnings to the wallet — a short bright cash-register pair.
export function playClaimSound(): void {
  const ac = ready();
  if (!ac) return;
  try {
    tone(ac, { freqStart: 988, freqEnd: 988, attack: 0.004, hold: 0.07, peak: 0.16, type: "sine" });
    tone(ac, {
      freqStart: 1319,
      freqEnd: 1319,
      at: 0.08,
      attack: 0.004,
      hold: 0.16,
      peak: 0.18,
      type: "sine",
    });
  } catch {
    // Stay silent.
  }
}
