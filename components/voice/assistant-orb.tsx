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
      {/* No halo here on purpose. The screen edge carries the glow while a
          session is open, and a second one around the orb made the corner read
          as a smudge rather than as a control. */}
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
