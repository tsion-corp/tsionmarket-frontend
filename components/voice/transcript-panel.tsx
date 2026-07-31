"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { TurnPhase, VoiceMessage } from "@/hooks/use-voice-session";
import { cn } from "@/lib/utils";

// The live conversation transcript, shown while a voice session is open: what
// you said and what Vivid replied, turn after turn. Floats just above the voice
// control and auto-scrolls to the latest line.
interface TranscriptPanelProps {
  active: boolean;
  phase: TurnPhase;
  messages: VoiceMessage[];
}

const PHASE_LABEL: Record<TurnPhase, string> = {
  idle: "Vivid",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
};

// The dot beside the phase label. Each turn state gets its own colour so the
// panel can be read at a glance without parsing the word next to it.
const PHASE_DOT: Record<TurnPhase, string> = {
  idle: "bg-white/30",
  listening: "bg-emerald-400",
  thinking: "bg-amber-400",
  speaking: "bg-[#A78BFA]",
};

export function TranscriptPanel({ active, phase, messages }: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Keep the newest line in view as the conversation grows or the phase changes.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, phase]);

  if (!active) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 14, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className={cn(
        "fixed right-5 bottom-44 z-[199] flex max-h-[46vh] w-[min(370px,calc(100vw-2.5rem))] flex-col",
        "overflow-hidden rounded-[22px] border border-white/12",
        // A deep tinted glass rather than a flat panel, so it belongs to the
        // orb below it instead of looking like a separate widget.
        "bg-[#140A28]/90 backdrop-blur-2xl",
        "shadow-[0_24px_60px_-12px_rgba(0,0,0,0.75),0_0_40px_-8px_rgba(139,92,246,0.35)]"
      )}
    >
      {/* A thread of colour along the top edge, tying the panel to the orb. */}
      <div
        aria-hidden
        className="h-px w-full bg-gradient-to-r from-transparent via-[#A78BFA]/70 to-transparent"
      />

      {/* Header: the current phase, so the user knows whose turn it is. */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2.5">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            PHASE_DOT[phase],
            phase !== "idle" && "animate-pulse"
          )}
        />
        <span className="font-sans text-[11.5px] font-semibold tracking-[0.07em] text-white/60 uppercase">
          {PHASE_LABEL[phase]}
        </span>
      </div>

      {/* The conversation. Scrolls internally; the top fades so a long thread
          dissolves upward rather than being sliced by a hard edge. */}
      <div
        ref={scrollRef}
        className={cn(
          "flex flex-col gap-2.5 overflow-y-auto px-4 pt-1 pb-4",
          "[mask-image:linear-gradient(to_bottom,transparent,black_10%)]"
        )}
      >
        {messages.length === 0 ? (
          <p className="py-3 text-center font-sans text-[13px] font-normal text-white/45">
            Say something — I&apos;m listening.
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((m, i) => {
              const isLatest = i === messages.length - 1;
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 8 }}
                  // Older turns fall back so the eye lands on what was just
                  // said, without hiding the history entirely.
                  animate={{ opacity: isLatest ? 1 : 0.6, y: 0 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[86%] px-3.5 py-2 font-sans text-[13.5px] leading-[1.45]",
                      // Asymmetric corners point each bubble at its speaker,
                      // which is what makes a thread readable at a glance.
                      m.role === "user"
                        ? "rounded-[16px] rounded-br-[5px] bg-gradient-to-b from-[#8B5CF6] to-[#6D28D9] text-white shadow-[0_4px_14px_-4px_rgba(139,92,246,0.8)]"
                        : "rounded-[16px] rounded-bl-[5px] border border-white/10 bg-white/[0.07] text-white/90"
                    )}
                  >
                    {m.text}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
}
