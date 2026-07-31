"use client";

import { useCallback, useEffect, useRef } from "react";
import { getAccessToken } from "@privy-io/react-auth";
import { vlog } from "@/lib/voice/log";

// Speaks Vivid's replies aloud via the /api/tts streaming proxy (ElevenLabs,
// British-English voice). Two levels of chunking keep it responsive:
//   1) Sentence chunking — long answers are split into sentences and spoken
//      sequentially, so the FIRST sentence starts almost immediately instead of
//      waiting for the whole reply to synthesise.
//   2) Stream playback — each sentence's audio streams from the server and plays
//      as it arrives.
// Barge-in: a new speak() (or stop()) cancels whatever is currently playing, so
// Vivid never talks over itself or over a new command.

// Split into speakable chunks on sentence boundaries, keeping punctuation. Falls
// back to the whole string when there are no sentence breaks. Chunks are capped
// so one very long run-on still starts quickly.
const MAX_CHUNK_CHARS = 220;

function chunkText(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]*/g) ?? [clean];
  const chunks: string[] = [];
  let current = "";
  for (const s of sentences) {
    const piece = s.trim();
    if (!piece) continue;
    if ((current + " " + piece).trim().length > MAX_CHUNK_CHARS && current) {
      chunks.push(current.trim());
      current = piece;
    } else {
      current = (current + " " + piece).trim();
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

export interface UseSpeech {
  // Speak the text aloud. Cancels any in-progress speech first (barge-in).
  speak: (text: string) => Promise<void>;
  // Stop any current speech immediately.
  stop: () => void;
  // Whether TTS is configured (always true client-side; the server may still 503).
  supported: boolean;
}

export function useSpeech(): UseSpeech {
  // A monotonically increasing turn id. Each speak() bumps it; any playback from
  // an older turn is abandoned the instant a newer speak()/stop() happens.
  const turnRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const cleanupAudio = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      el.onended = null;
      el.onerror = null;
      try {
        el.pause();
      } catch {
        // ignore
      }
      el.src = "";
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    vlog("tts", "stop (barge-in / cancel)");
    turnRef.current += 1; // invalidate any in-flight/queued playback
    cleanupAudio();
  }, [cleanupAudio]);

  // Play a single chunk to completion. Resolves when it finishes or is superseded.
  const playChunk = useCallback(
    async (text: string, myTurn: number, token: string): Promise<void> => {
      if (turnRef.current !== myTurn) return;
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text }),
      });
      if (turnRef.current !== myTurn) return; // superseded while fetching
      if (!res.ok || !res.body) return; // silently skip a failed chunk

      // The streamed body plays via a blob URL. (MediaSource append could start
      // playback a touch earlier, but blob-per-chunk keeps this robust across
      // browsers, and sentence chunking already makes the first audio fast.)
      const blob = await res.blob();
      if (turnRef.current !== myTurn) return;

      const url = URL.createObjectURL(blob);
      const el = new Audio(url);
      audioRef.current = el;
      urlRef.current = url;

      await new Promise<void>((resolve) => {
        el.onended = () => resolve();
        el.onerror = () => resolve();
        void el.play().catch(() => resolve());
      });

      if (urlRef.current === url) {
        URL.revokeObjectURL(url);
        urlRef.current = null;
      }
    },
    []
  );

  const speak = useCallback(
    async (text: string): Promise<void> => {
      const chunks = chunkText(text);
      if (chunks.length === 0) return;
      vlog("tts", "speak", { text: text.slice(0, 80), chunks: chunks.length });

      // Barge-in: supersede any current speech.
      turnRef.current += 1;
      const myTurn = turnRef.current;
      cleanupAudio();

      let token: string | null = null;
      try {
        token = await getAccessToken();
      } catch {
        token = null;
      }
      if (!token || turnRef.current !== myTurn) return;

      // Speak chunks in order; bail out the moment a newer turn supersedes us.
      for (const chunk of chunks) {
        if (turnRef.current !== myTurn) return;
        await playChunk(chunk, myTurn, token);
      }
    },
    [cleanupAudio, playChunk]
  );

  // Never leave audio playing if the component unmounts.
  useEffect(() => () => stop(), [stop]);

  return { speak, stop, supported: true };
}
