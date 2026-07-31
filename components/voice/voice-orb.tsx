"use client";

import { useEffect, useRef } from "react";

// The listening indicator: a soft sphere with liquid moving inside it. The
// surface haze drifts in CSS (see .ws-orb); everything here is the part that has
// to answer to live audio.
//
// The liquid is a stack of filled sine bands, each with its own speed,
// wavelength and phase so they cross rather than move as one. Louder speech
// makes them taller and lifts the whole level, the way a glass swells when it is
// filled, which is what makes the orb read as listening to *you*.

const VIEW = 100;
// Sampled every 4 units across a 100-wide viewBox. Fine enough that a polyline
// reads as a smooth curve once it is filled.
const STEP = 4;

interface Wave {
  speed: number;
  cycles: number;
  phase: number;
  // Resting height of this band, as a y coordinate: larger sits lower.
  base: number;
  amplitude: number;
  fill: string;
}

// The orb already shades to near-white at the bottom, so white liquid reads as
// a continuation of it and only its rippling surface shows, crossing the
// blue-to-white boundary. Opacity increases with depth so the lower bands look
// denser. Negative speeds run the other way, so the bands drift apart and back
// together instead of travelling in convoy.
const WAVES: Wave[] = [
  { speed: 1.5, cycles: 1.3, phase: 0, base: 46, amplitude: 1, fill: "rgba(255,255,255,0.45)" },
  {
    speed: -1.1,
    cycles: 1.9,
    phase: 1.7,
    base: 53,
    amplitude: 0.8,
    fill: "rgba(255,255,255,0.55)",
  },
  { speed: 2.2, cycles: 2.6, phase: 3.1, base: 59, amplitude: 0.6, fill: "rgba(255,255,255,0.7)" },
];

// Speech RMS sits well under 1, so it needs pushing to fill the orb. The floor
// keeps the liquid moving during a pause: a flat line would read as though the
// mic had closed.
const LEVEL_GAIN = 26;
const MIN_AMPLITUDE = 2.5;
const MAX_AMPLITUDE = 13;
// How far the resting level lifts at full volume.
const MAX_RISE = 9;
// How much the whole orb swells. Kept small now the waves carry the reaction.
const MAX_SWELL = 0.09;
const SWELL_GAIN = 0.5;
// Fraction of the remaining distance covered each frame. The mic is only
// sampled ten times a second, so values are eased towards each new reading
// rather than stepped to it, which would stutter.
const EASING = 0.14;

function wavePath(time: number, amplitude: number, wave: Wave, rise: number): string {
  const base = wave.base - rise;
  let d = "";
  for (let x = 0; x <= VIEW; x += STEP) {
    const y = base - Math.sin((x / VIEW) * Math.PI * 2 * wave.cycles + time) * amplitude;
    d += `${x === 0 ? "M" : "L"}${x},${y.toFixed(2)}`;
  }
  // Close down the sides so the band is a filled body of liquid, not a line.
  return `${d}L${VIEW},${VIEW}L0,${VIEW}Z`;
}

export function VoiceOrb({
  level,
  size = 76,
  reduceMotion,
}: {
  level: number;
  size?: number;
  reduceMotion?: boolean;
}) {
  const orbRef = useRef<HTMLDivElement>(null);
  const pathsRef = useRef<(SVGPathElement | null)[]>([]);
  // The animation loop reads the level from a ref, so a new reading does not
  // tear the loop down and start it over.
  const levelRef = useRef(level);
  useEffect(() => {
    levelRef.current = level;
  }, [level]);

  useEffect(() => {
    if (reduceMotion) return;
    let frame = 0;
    let started: number | null = null;
    let amplitude = MIN_AMPLITUDE;
    let rise = 0;
    let scale = 1;

    const loop = (now: number) => {
      started ??= now;
      const time = (now - started) / 1000;
      const live = levelRef.current;

      const targetAmplitude = Math.min(MAX_AMPLITUDE, Math.max(MIN_AMPLITUDE, live * LEVEL_GAIN));
      amplitude += (targetAmplitude - amplitude) * EASING;
      rise += (Math.min(MAX_RISE, live * LEVEL_GAIN * 0.7) - rise) * EASING;
      scale += (1 + Math.min(MAX_SWELL, live * SWELL_GAIN) - scale) * EASING;

      for (const [i, wave] of WAVES.entries()) {
        pathsRef.current[i]?.setAttribute(
          "d",
          wavePath(time * wave.speed + wave.phase, amplitude * wave.amplitude, wave, rise)
        );
      }
      // Written straight to the node: at 60fps this would otherwise re-render
      // the tree for values nothing else reads.
      if (orbRef.current) orbRef.current.style.transform = `scale(${scale.toFixed(4)})`;

      frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [reduceMotion]);

  return (
    <div ref={orbRef} className="ws-orb" style={{ width: size, height: size }} aria-hidden="true">
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        preserveAspectRatio="none"
        className="absolute inset-0 z-[1] h-full w-full"
      >
        {WAVES.map((wave, i) => (
          <path
            key={i}
            ref={(el) => {
              pathsRef.current[i] = el;
            }}
            // A still frame for reduced motion, and the first paint before the
            // loop's first tick.
            d={wavePath(wave.phase, MIN_AMPLITUDE * wave.amplitude, wave, 0)}
            fill={wave.fill}
          />
        ))}
      </svg>
    </div>
  );
}
