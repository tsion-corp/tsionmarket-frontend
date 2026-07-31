"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { TurnPhase, VoiceMessage } from "@/hooks/use-voice-session";
import { cn } from "@/lib/utils";

// The live conversation transcript, shown while a voice session is open — what
// you said and what Vivid replied, turn after turn (the ChatGPT/Claude voice
// model). Floats just above the mic button and auto-scrolls to the latest line.
interface TranscriptPanelProps {
  active: boolean;
  phase: TurnPhase;
  messages: VoiceMessage[];
}

const PHASE_LABEL: Record<TurnPhase, string> = {
  idle: "",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

export function TranscriptPanel({ active, phase, messages }: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Keep the newest line in view as the conversation grows or the phase changes.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, phase]);

  if (!active) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      className={cn(
        "fixed right-5 bottom-52 z-[199] flex max-h-[46vh] w-[min(360px,calc(100vw-2.5rem))] flex-col",
        "overflow-hidden rounded-2xl border border-white/12 shadow-2xl",
        "bg-[#160C2E]/95 backdrop-blur-xl"
      )}
    >
      {/* Header: the current phase, so the user knows if it's their turn. */}
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            phase === "listening" && "animate-pulse bg-emerald-400",
            phase === "thinking" && "animate-pulse bg-amber-400",
            phase === "speaking" && "animate-pulse bg-[#8B5CF6]",
            phase === "idle" && "bg-white/30"
          )}
        />
        <span className="text-[12.5px] font-medium text-white/70">
          {PHASE_LABEL[phase] || "Vivid"}
        </span>
      </div>

      {/* The conversation. Scrolls internally; newest line auto-focused. */}
      <div ref={scrollRef} className="flex flex-col gap-2.5 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <p className="py-2 text-center text-[13px] text-white/45">
            Say something — I&apos;m listening.
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
              >
                <span
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-snug",
                    m.role === "user"
                      ? "bg-gradient-to-b from-[#8B5CF6] to-[#6D28D9] text-white"
                      : "bg-white/8 text-white/90"
                  )}
                >
                  {m.text}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
}
