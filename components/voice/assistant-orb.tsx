"use client";

import { cn } from "@/lib/utils";
import type { TurnPhase } from "@/hooks/use-voice-session";

// The thing you actually look at during a voice session: a sphere of moving
// colour that behaves differently depending on whose turn it is.
//
// The artwork is all CSS (see .ws-ai-orb). Only the phase class changes here,
// so the orb never swaps appearance mid-session, it just changes tempo: calm
// while it waits for you, quick while it thinks, pulsing while it talks.
export function AssistantOrb({ phase, size = 224 }: { phase: TurnPhase; size?: number }) {
  return (
    <div
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* A wide, very soft halo under the orb. It is what makes the orb read as
          emitting light rather than sitting on top of the page. */}
      <div
        className="pointer-events-none absolute rounded-full opacity-70 blur-3xl"
        style={{
          width: size * 1.35,
          height: size * 1.35,
          background:
            "radial-gradient(circle, rgba(139,92,246,0.55), rgba(56,189,248,0.22) 45%, transparent 70%)",
        }}
      />

      <div
        className={cn(
          "ws-ai-orb h-full w-full",
          phase === "listening" && "ws-ai-orb-listening",
          phase === "thinking" && "ws-ai-orb-thinking",
          phase === "speaking" && "ws-ai-orb-speaking"
        )}
      />
    </div>
  );
}
