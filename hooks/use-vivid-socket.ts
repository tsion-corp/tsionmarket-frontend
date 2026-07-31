"use client";

import { useCallback } from "react";
import { getAccessToken } from "@privy-io/react-auth";
import { isTerminalFrame, type TerminalFrame, type VividFrame } from "@/lib/voice/vivid-intent";

// The Vivid voice backend's /audio socket base, e.g. wss://ai.worldstreet…
// (dev: ws://localhost:8090). The path (/audio) and the Privy token are added
// here so callers only configure the host.
const AI_WS_BASE = process.env.NEXT_PUBLIC_AI_WS_URL ?? "";

export interface VividTurn {
  // The terminal frame that ended the turn (navigate/confirm/result/…).
  frame: TerminalFrame;
  // The final transcript, when the backend sent one — for logging/UX.
  transcript: string | null;
}

interface UseVividSocket {
  configured: boolean;
  // Streams one recorded utterance to Vivid and resolves with the terminal
  // frame for that turn. Opens a fresh socket per turn (one utterance, one
  // result) and always closes it — matching the tap-to-talk UX.
  send: (audio: Blob) => Promise<VividTurn>;
}

// Owns one turn's WebSocket round-trip to the Vivid backend: authenticate with
// the Privy access token (so the backend binds the wallet and authorizes
// commands — §13.3), push the audio clip followed by an `endpoint` frame, and
// resolve on the first terminal frame. Kept separate from the command flow so
// the transport stays testable and the socket is always released.
export function useVividSocket(): UseVividSocket {
  const send = useCallback((audio: Blob): Promise<VividTurn> => {
    return new Promise<VividTurn>((resolve, reject) => {
      void (async () => {
        if (!AI_WS_BASE) {
          reject(new Error("Voice backend is not configured"));
          return;
        }
        // WebSockets can't send an Authorization header, so the Privy access
        // token rides on the URL; the backend verifies it against Privy's JWKS.
        const token = await getAccessToken();
        if (!token) {
          reject(new Error("Not signed in"));
          return;
        }

        // Read the clip to a buffer BEFORE opening the socket. Reading it inside
        // `onopen` added an extra async tick, and on a fast (local) connection the
        // socket could reach OPEN before we finished wiring up — so the audio was
        // never sent and the turn hung until the timeout. With the buffer ready
        // up front, sending is synchronous the instant the socket is open.
        const audioBuffer = await audio.arrayBuffer();

        const url = `${AI_WS_BASE.replace(/\/$/, "")}/audio?token=${encodeURIComponent(token)}`;
        const ws = new WebSocket(url);
        ws.binaryType = "arraybuffer";

        let transcript: string | null = null;
        let settled = false;

        // A turn must produce a terminal frame within this window. The backend
        // caps an utterance at 30s and the intent model at ~15s, so a healthy
        // turn always resolves well inside this. Without it, a stalled backend
        // (no terminal frame after the transcript) leaves the UI on "Working…"
        // forever; this converts that silent hang into a surfaced error.
        const TURN_TIMEOUT_MS = 25_000;
        let timeout: ReturnType<typeof setTimeout> | null = null;

        const finish = (fn: () => void) => {
          if (settled) return;
          settled = true;
          if (timeout !== null) clearTimeout(timeout);
          try {
            ws.close();
          } catch {
            // already closing
          }
          fn();
        };

        timeout = setTimeout(() => {
          finish(() => reject(new Error("Voice timed out")));
        }, TURN_TIMEOUT_MS);

        // Stream the clip to the backend as a sequence of small binary frames,
        // then send the `endpoint` frame that ends the turn. A single large
        // send() (a whole ~120KB clip in one frame) could stall in the local
        // proxy and never flush, so the backend never saw the audio and the turn
        // hung. The backend is built to accumulate chunks (audio.push per frame),
        // so chunking is both the fix and the intended shape. We wait for the
        // send buffer to drain before emitting `endpoint`, so the turn only runs
        // once all audio has actually left the client.
        const CHUNK_BYTES = 16 * 1024;

        const sendAudio = () => {
          console.log("[voice] CHUNKED sendAudio", {
            settled,
            readyState: ws.readyState,
            bytes: audioBuffer.byteLength,
          });
          if (settled || ws.readyState !== WebSocket.OPEN) return;

          let count = 0;
          for (let offset = 0; offset < audioBuffer.byteLength; offset += CHUNK_BYTES) {
            ws.send(audioBuffer.slice(offset, offset + CHUNK_BYTES));
            count++;
          }
          console.log("[voice] chunks queued", { count, buffered: ws.bufferedAmount });

          // Emit `endpoint` only once the audio has flushed. Polling bufferedAmount
          // keeps us from ending the turn before the backend has the full clip.
          const flushThenEndpoint = () => {
            if (settled || ws.readyState !== WebSocket.OPEN) return;
            if (ws.bufferedAmount > 0) {
              setTimeout(flushThenEndpoint, 20);
              return;
            }
            ws.send(JSON.stringify({ type: "endpoint" }));
            console.log("[voice] endpoint sent, all audio flushed");
          };
          flushThenEndpoint();
        };

        console.log("[voice] socket created", {
          url,
          readyState: ws.readyState,
          bytes: audioBuffer.byteLength,
        });

        // The socket can already be OPEN by the time we attach this (a cached
        // token + a local backend open on the same tick), in which case `onopen`
        // would never fire. Handle both: fire now if already open, else on open.
        if (ws.readyState === WebSocket.OPEN) {
          console.log("[voice] socket already OPEN, sending now");
          sendAudio();
        } else {
          ws.onopen = () => {
            console.log("[voice] onopen fired");
            sendAudio();
          };
        }

        ws.onmessage = (ev) => {
          let frame: VividFrame;
          try {
            frame = JSON.parse(String(ev.data)) as VividFrame;
          } catch {
            return;
          }
          console.log("[voice] frame:", frame.type, JSON.stringify(frame).slice(0, 200));
          if (frame.type === "transcript") {
            if (frame.isFinal) transcript = frame.text;
            return;
          }
          if (frame.type === "session") return;
          if (isTerminalFrame(frame)) {
            finish(() => resolve({ frame, transcript }));
          }
        };

        ws.onerror = (e) => {
          console.log("[voice] ws.onerror", e);
          finish(() => reject(new Error("Voice connection failed")));
        };
        ws.onclose = (e) => {
          console.log("[voice] ws.onclose", {
            code: e.code,
            reason: e.reason,
            wasClean: e.wasClean,
          });
          finish(() => reject(new Error("Voice connection closed")));
        };
      })();
    });
  }, []);

  return { configured: Boolean(AI_WS_BASE), send };
}
