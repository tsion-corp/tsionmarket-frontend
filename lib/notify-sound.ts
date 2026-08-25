// A short, friendly notification chime, synthesised with the Web Audio API so
// there is no asset to ship or CSP host to allow. Used when a live game appears
// in the feature marquee. Best effort: browsers block audio until the user has
// interacted with the page, which by the time a game shows they have, and a
// blocked or unsupported context simply plays nothing.

let context: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  return context;
}

/** A two-note upward ding: bright enough to catch attention, short enough not to nag. */
export function playNotify(): void {
  const audio = ctx();
  if (!audio) return;
  // A context created before a user gesture starts suspended; resume is a
  // no-op once it is already running.
  void audio.resume?.();

  const now = audio.currentTime;
  const notes = [
    { freq: 880, at: 0 }, // A5
    { freq: 1318.5, at: 0.11 }, // E6
  ];
  for (const note of notes) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = note.freq;
    const start = now + note.at;
    // A quick pluck: rise fast, fall over ~180ms.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.16, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + 0.22);
  }
}
