"use client";

import { usePrivy } from "@privy-io/react-auth";
import { motion, useReducedMotion } from "motion/react";
import { useVoiceCommand } from "@/hooks/use-voice-command";
import { VoiceAvatar } from "@/components/voice/avatar";
import { cn } from "@/lib/utils";

// The floating voice control, mounted once globally and shown only to a
// signed-in user. Tap the avatar once, then just speak: the mic auto-stops when
// you pause and the command runs. No hold, no second tap.
//
// Styling follows the monochrome brand (silver accent, no purple): a compact
// dark-glass tile with a silver halo. Tapping it answers with a ping ring
// while it listens and a pulse while it works, so the tap always visibly
// lands.
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
      // Idle: a slow breathing scale so it's noticeable, not hidden.
      // Listening: a livelier bob so it clearly reads as attending to you.
      animate={
        reduceMotion ? { y: 0, scale: 1 } : recording ? { y: [0, -4, 0] } : { scale: [1, 1.03, 1] }
      }
      transition={{ duration: recording ? 1.1 : 2.6, repeat: Infinity, ease: "easeInOut" }}
      className={cn(
        "fixed right-5 bottom-8 z-[200] grid h-14 w-14 place-items-center rounded-2xl",
        "border bg-gradient-to-b from-[#2c2c30] to-[#121214] transition-colors select-none",
        busy && "animate-pulse",
        "disabled:opacity-70",
        active
          ? "border-white/55 shadow-[0_0_20px_4px_rgba(212,212,216,0.35)]"
          : "border-white/20 shadow-[0_0_14px_2px_rgba(212,212,216,0.18)] hover:border-white/40"
      )}
    >
      {/* The tap response: a silver ping ring radiating while listening. */}
      {recording && !reduceMotion ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 animate-ping rounded-2xl border border-white/40 bg-white/10"
        />
      ) : null}
      <VoiceAvatar size={34} />
    </motion.button>
  );
}
