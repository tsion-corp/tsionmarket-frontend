"use client";

// The board's sound palette, synthesised with the Web Audio API so no audio
// asset has to ship or download. Played when a move lands (yours or the
// opponent's) and when the game ends. Silent on the server and wherever Web
// Audio is unavailable, and it never throws — a missing sound must never break
// a move.

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

// Browsers keep a freshly-created AudioContext suspended until a user gesture.
// Resuming from inside a move handler usually works for your own move, but the
// first sound can be the opponent's move with no local gesture yet. Arm a
// one-shot resume on the first pointer or key gesture so audio is unlocked
// before it is needed. Safe to call repeatedly — it arms only once.
let unlockArmed = false;
export function armAudioUnlock(): void {
  if (unlockArmed || typeof window === "undefined") return;
  unlockArmed = true;
  const unlock = () => {
    const ac = audioContext();
    if (ac && ac.state === "suspended") void ac.resume();
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

// One synthesised note. `at` is an offset in seconds from now, so several tones
// compose into a short motif (a castle's double knock, an end chime). Always
// silent and never throwing on failure — the move still went through.
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

// The kinds of move the board can voice, in the order the classifier prefers
// when a single move is several things at once (a castle that gives check reads
// as a castle first — its double knock is the memorable part).
export type MoveSound = "move" | "capture" | "castle" | "check" | "promote";

// Derive the sound from the move's SAN, which already encodes everything: "x"
// capture, "+" check, "#" mate, "O-O"/"O-O-O" castle, "=" promotion. Mate is
// voiced by the game-end chime instead, so it falls through to its base knock.
export function moveSoundFromSan(san: string): MoveSound {
  if (san.startsWith("O-O")) return "castle";
  if (san.includes("=")) return "promote";
  if (san.endsWith("+")) return "check";
  if (san.includes("x")) return "capture";
  return "move";
}

export function playMoveSound(kind: MoveSound = "move"): void {
  const ac = audioContext();
  if (!ac) return;
  // Autoplay policy suspends the context until a gesture; a move always follows
  // one, so resuming here is safe and the first sound still lands.
  if (ac.state === "suspended") void ac.resume();

  try {
    switch (kind) {
      case "capture":
        // A brighter, harder knock — a piece being taken reads differently.
        tone(ac, { freqStart: 330, freqEnd: 170, peak: 0.3 });
        break;
      case "castle":
        // Two quick knocks: king, then rook.
        tone(ac, { freqStart: 250, freqEnd: 150, hold: 0.09 });
        tone(ac, { freqStart: 230, freqEnd: 140, at: 0.085, hold: 0.1 });
        break;
      case "check":
        // The quiet move knock plus a short high ping that reads as an alert.
        tone(ac, { freqStart: 250, freqEnd: 150 });
        tone(ac, {
          freqStart: 1200,
          freqEnd: 900,
          at: 0.02,
          attack: 0.003,
          hold: 0.14,
          peak: 0.16,
          type: "sine",
        });
        break;
      case "promote":
        // A rising sparkle for a pawn becoming a queen.
        tone(ac, { freqStart: 500, freqEnd: 760, hold: 0.1, peak: 0.2, type: "sine" });
        tone(ac, { freqStart: 760, freqEnd: 1020, at: 0.08, hold: 0.12, peak: 0.18, type: "sine" });
        break;
      case "move":
      default:
        tone(ac, { freqStart: 250, freqEnd: 150 });
        break;
    }
  } catch {
    // Audio glitch — the move still went through, so stay silent.
  }
}

// One compact warning when the player's clock enters its final ten seconds.
// Mature chess clients use a single cue here; repeated beeps compete with move
// sounds and make a time scramble harder to follow.
export function playLowTimeWarning(): void {
  const ac = audioContext();
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume();
  try {
    tone(ac, {
      freqStart: 880,
      freqEnd: 660,
      attack: 0.004,
      hold: 0.22,
      peak: 0.2,
      type: "triangle",
    });
    tone(ac, {
      freqStart: 880,
      freqEnd: 660,
      at: 0.3,
      attack: 0.004,
      hold: 0.24,
      peak: 0.24,
      type: "triangle",
    });
  } catch {
    // A missed warning must never interrupt the game.
  }
}

// A short three-note chime when the game ends: rising and bright for a win,
// falling and softer for a loss or a draw.
export function playGameEndSound(outcome: "win" | "loss" | "draw"): void {
  const ac = audioContext();
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume();

  try {
    const notes =
      outcome === "win" ? [523, 659, 784] : outcome === "loss" ? [392, 330, 262] : [440, 415, 392];
    notes.forEach((freq, i) => {
      tone(ac, {
        freqStart: freq,
        freqEnd: freq,
        at: i * 0.14,
        attack: 0.01,
        hold: 0.2,
        peak: outcome === "win" ? 0.22 : 0.16,
        type: "sine",
      });
    });
  } catch {
    // The game still ended; stay silent.
  }
}
