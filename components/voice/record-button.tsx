"use client";

import { usePrivy } from "@privy-io/react-auth";
import { motion, useReducedMotion } from "motion/react";
import { useVoiceCommand } from "@/hooks/use-voice-command";
import { VoiceAvatar } from "@/components/voice/avatar";
import { cn } from "@/lib/utils";

// The floating voice control, mounted once globally and shown only to a
// signed-in user. Tap the avatar once, then just speak: the mic auto-stops when
// you pause and the command runs. No hold, no second tap.
export function RecordButton() {
  const { ready, authenticated } = usePrivy();
  const reduceMotion = useReducedMotion();
  const { recording, busy, supported, run } = useVoiceCommand();

  // Match AuthGuard's gate: nothing renders until the session is known and
  // signed in. A browser without microphone support simply gets no button.
  if (!ready || !authenticated || !supported) return null;

  const active = recording || busy;
  const label = recording ? "Listening, speak your command" : busy ? "Working" : "Tap to speak";

  return (
    <motion.button
      type="button"
      aria-label={label}
      aria-busy={busy}
      onClick={() => void run()}
      disabled={busy}
      // Idle: a slow breathing glow so it's noticeable, not hidden. Listening:
      // a livelier bob so it clearly reads as attending to you.
      animate={
        reduceMotion ? { y: 0, scale: 1 } : recording ? { y: [0, -6, 0] } : { scale: [1, 1.04, 1] }
      }
      transition={{ duration: recording ? 1.1 : 2.4, repeat: Infinity, ease: "easeInOut" }}
      className={cn(
        "fixed right-5 bottom-24 z-[200] grid h-24 w-20 place-items-center rounded-3xl",
        "border-2 shadow-2xl transition-colors",
        "bg-gradient-to-b from-[#8B5CF6] to-[#5320A8]",
        "select-none disabled:opacity-70",
        // A persistent purple halo so the control stands out against the page;
        // it intensifies while active.
        active
          ? "border-white/70 shadow-[0_0_28px_6px_rgba(139,92,246,0.65)]"
          : "border-white/40 shadow-[0_0_22px_4px_rgba(139,92,246,0.45)] hover:border-white/60"
      )}
    >
      <VoiceAvatar size={52} />
    </motion.button>
  );
}
