"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { TurnPhase } from "@/hooks/use-voice-session";

// A soft light around the edge of the screen while a voice session is open.
//
// The control sits in one corner, which is easy to miss on a tall page and easy
// to forget once you have started talking. Lighting the whole frame makes "the
// assistant is live" visible wherever the user happens to be looking.
//
// Purely decorative: the control carries the accessible label and the transcript
// panel carries the live status, so this is aria-hidden and never announced. It
// is click-through, so it cannot intercept anything underneath it.
export function VoiceGlow({ phase }: { phase: TurnPhase }) {
  return (
    <motion.div
      aria-hidden="true"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      // Fades in fast enough to feel like a response to the tap, and out slowly
      // enough not to snap off mid-thought.
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn("ws-voice-glow", phase === "listening" && "ws-voice-glow-listening")}
    />
  );
}
