"use client";

import { usePrivy } from "@privy-io/react-auth";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useVoiceSession } from "@/hooks/use-voice-session";
import { VoiceAvatar } from "@/components/voice/avatar";
import { AssistantOrb } from "@/components/voice/assistant-orb";
import { TranscriptPanel } from "@/components/voice/transcript-panel";
import { VoiceGlow } from "@/components/voice/voice-glow";
import { cn } from "@/lib/utils";

const ANCHOR = "fixed right-5 bottom-24 z-[200]";

// The floating voice control, mounted once globally and shown only to a
// signed-in user. Tap once to OPEN a hands-free conversation: from then on just
// speak — the mic auto-cycles and Vivid speaks back, with the conversation
// shown live as a transcript above the control. Tap again to end the session.
//
// Idle it is the Vivid avatar. Open it becomes an orb of moving colour that
// changes tempo with the turn, so the state reads from across the room rather
// than needing the label to be parsed.
//
// ONE useVoiceSession() call owns the session; it drives both the control and
// the transcript panel, so they share a single session (calling the hook twice
// would open two).
export function RecordButton() {
  const { ready, authenticated } = usePrivy();
  const reduceMotion = useReducedMotion();
  const { active, phase, messages, supported, start, stop } = useVoiceSession();

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
        {active ? <VoiceGlow key="voice-glow" phase={phase} /> : null}
      </AnimatePresence>

      <AnimatePresence>
        {active ? <TranscriptPanel active={active} phase={phase} messages={messages} /> : null}
      </AnimatePresence>

      <motion.button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={() => (active ? stop() : void start())}
        // Idle: a slow breathing glow so it is noticeable, not hidden. Open: the
        // orb carries its own motion, so the button itself sits still and lets
        // it do the talking.
        animate={reduceMotion || active ? { scale: 1 } : { scale: [1, 1.04, 1] }}
        transition={{ duration: 2.4, repeat: active ? 0 : Infinity, ease: "easeInOut" }}
        className={cn(
          ANCHOR,
          // A circle either way, so the control keeps its shape when a session
          // opens and only its contents change.
          "grid h-16 w-16 cursor-pointer place-items-center rounded-full select-none",
          active
            ? // Open: no chrome at all. The orb is the control, and a border
              // around it would read as a button containing a picture.
              ""
            : [
                "border-2 shadow-2xl transition-colors",
                "bg-gradient-to-b from-[#8B5CF6] to-[#5320A8]",
                "border-white/40 shadow-[0_0_22px_4px_rgba(139,92,246,0.45)] hover:border-white/60",
              ]
        )}
      >
        {active ? <AssistantOrb phase={phase} size={64} /> : <VoiceAvatar size={36} />}
      </motion.button>
    </>
  );
}
