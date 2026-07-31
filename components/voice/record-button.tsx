"use client";

import { usePrivy } from "@privy-io/react-auth";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useVoiceSession } from "@/hooks/use-voice-session";
import { VoiceAvatar } from "@/components/voice/avatar";
import { TranscriptPanel } from "@/components/voice/transcript-panel";
import { cn } from "@/lib/utils";

// The floating voice control, mounted once globally and shown only to a
// signed-in user. Tap once to OPEN a hands-free conversation: from then on just
// speak — the mic auto-cycles and Vivid speaks back, and the conversation is
// shown live as a transcript above the button. Tap again to end the session.
//
// ONE useVoiceSession() call owns the session; it drives BOTH the button and the
// transcript panel, so they share a single session (calling the hook twice would
// open two).
export function RecordButton() {
  const { ready, authenticated } = usePrivy();
  const reduceMotion = useReducedMotion();
  const { active, listening, phase, messages, supported, start, stop } = useVoiceSession();

  // Match AuthGuard's gate: nothing renders until the session is known and
  // signed in. A browser without microphone support simply gets no button.
  if (!ready || !authenticated || !supported) return null;

  const label = active
    ? phase === "listening"
      ? "Listening — just speak. Tap to end."
      : phase === "thinking"
        ? "Thinking… Tap to end."
        : phase === "speaking"
          ? "Speaking… Tap to end."
          : "Vivid session open. Tap to end."
    : "Tap to start talking to Vivid";

  return (
    <>
      <AnimatePresence>
        {active ? <TranscriptPanel active={active} phase={phase} messages={messages} /> : null}
      </AnimatePresence>

      <motion.button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={() => (active ? stop() : void start())}
        // Idle: a slow breathing glow so it's noticeable, not hidden. Listening:
        // a livelier bob so it clearly reads as attending to you.
        animate={
          reduceMotion
            ? { y: 0, scale: 1 }
            : listening
              ? { y: [0, -6, 0] }
              : { scale: [1, 1.04, 1] }
        }
        transition={{ duration: listening ? 1.1 : 2.4, repeat: Infinity, ease: "easeInOut" }}
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
    </>
  );
}
