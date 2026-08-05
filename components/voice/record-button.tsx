"use client";

import { useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useVoiceSession } from "@/hooks/use-voice-session";
import { useVoiceDock } from "@/hooks/use-voice-dock";
import { VoiceAvatar } from "@/components/voice/avatar";
import { AssistantOrb } from "@/components/voice/assistant-orb";
import { TranscriptPanel } from "@/components/voice/transcript-panel";
import { VoiceGlow } from "@/components/voice/voice-glow";
import { CloseIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

// The close button and the transcript are positioned relative to the control,
// so they travel with it when it is dragged. Offsets are the gaps the original
// fixed classes encoded: the X sits to its left, the transcript above it.
const STOP_OFFSET = { right: 76, bottom: 8 };
const TRANSCRIPT_OFFSET = { right: 0, bottom: 80 };

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
  // The control floats over every page, so wherever it rests it covers
  // something. Being able to move it is the way out, and where it is put is
  // remembered.
  const { position, dragging, consumeDrag, dragHandlers } = useVoiceDock();

  // Tapping anywhere else ends the session, the way any open overlay behaves.
  // Without this the only way out is the X, and a user who has moved on to the
  // page leaves the mic open behind them.
  //
  // Bound on pointerdown rather than click so it fires before the page reacts,
  // and scoped by a data attribute so the orb, the X and the transcript are all
  // treated as inside. The listener only exists while a session is open, so the
  // tap that started it cannot immediately close it.
  useEffect(() => {
    if (!active) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-voice-ui]")) return;
      stop();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [active, stop]);

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
        {active ? (
          <TranscriptPanel
            active={active}
            phase={phase}
            messages={messages}
            anchor={{
              right: position.right + TRANSCRIPT_OFFSET.right,
              bottom: position.bottom + TRANSCRIPT_OFFSET.bottom,
            }}
          />
        ) : null}
      </AnimatePresence>

      {/* An explicit way out. Tapping the orb also ends the session, but that is
          not discoverable: an orb that is visibly reacting to your voice reads
          as a status light, not a button. */}
      <AnimatePresence>
        {active ? (
          <motion.button
            key="voice-stop"
            type="button"
            data-voice-ui
            onClick={stop}
            aria-label="End voice session"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.6, x: 12 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.6, x: 12 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            // Sits to the left of the orb, which keeps the orb in the spot the
            // launcher occupied so nothing jumps when a session opens.
            style={{
              right: position.right + STOP_OFFSET.right,
              bottom: position.bottom + STOP_OFFSET.bottom,
            }}
            className="fixed z-[201] grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-white/25 bg-black/60 text-white/80 backdrop-blur transition-colors hover:border-white/50 hover:text-white"
          >
            <CloseIcon size={13} />
          </motion.button>
        ) : null}
      </AnimatePresence>

      <motion.button
        type="button"
        data-voice-ui
        aria-label={label}
        aria-pressed={active}
        {...dragHandlers}
        // A drag that ends on the control still fires a click, which would open
        // or end a session every time it is moved. The gesture is consumed here
        // so only a genuine tap reaches the session.
        onClick={() => {
          if (consumeDrag()) return;
          if (active) stop();
          else void start();
        }}
        style={{ ...dragHandlers.style, right: position.right, bottom: position.bottom }}
        // Idle: a slow breathing glow so it is noticeable, not hidden. Open: the
        // orb carries its own motion, so the button itself sits still and lets
        // it do the talking. While being dragged it holds still, so the only
        // movement on screen is the one the finger is making.
        animate={reduceMotion || active || dragging ? { scale: 1 } : { scale: [1, 1.04, 1] }}
        transition={{ duration: 2.4, repeat: active || dragging ? 0 : Infinity, ease: "easeInOut" }}
        className={cn(
          "fixed z-[200]",
          // A circle either way, so the control keeps its shape when a session
          // opens and only its contents change.
          "grid h-16 w-16 place-items-center rounded-full select-none",
          // Last, so twMerge does not resolve it away against an earlier cursor.
          dragging ? "cursor-grabbing" : "cursor-grab",
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
