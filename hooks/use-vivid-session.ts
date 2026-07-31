"use client";

import { useCallback, useEffect, useRef } from "react";
import { getAccessToken } from "@privy-io/react-auth";
import type { VividFrame } from "@/lib/voice/vivid-intent";
import { vlog, vwarn } from "@/lib/voice/log";

// The Vivid voice backend's /audio socket base, e.g. wss://ai.worldstreet…
// (dev: ws://localhost:8090). The path (/audio) and the Privy token are added
// here so callers only configure the host.
const AI_WS_BASE = process.env.NEXT_PUBLIC_AI_WS_URL ?? "";

// How audio is chunked onto the wire. A single large send() can stall in a local
// proxy and never flush; the backend accumulates chunks, so chunking is both the
// fix and the intended shape (mirrors the original one-shot socket).
const CHUNK_BYTES = 16 * 1024;

// Application-level keepalive cadence. The backend replies with `pong`; this
// keeps the socket (and any L7 proxy) alive across the quiet gaps between turns
// in a long conversational session.
const PING_INTERVAL_MS = 20_000;

export type FrameHandler = (frame: VividFrame) => void;

export interface VividSession {
  // Stream one recorded utterance to the open session. The turn's frames arrive
  // on the `onFrame` handler passed to `open()`. Rejects only if the socket
  // isn't open (the caller reopens); backend turn errors arrive AS frames.
  sendUtterance: (audio: Blob) => Promise<void>;
  // Tap-to-confirm a pending command on the SAME socket (agent-loop confirm).
  confirm: (token: string) => void;
  // Close the session and release the socket.
  close: () => void;
}

interface UseVividSession {
  configured: boolean;
  // Open ONE persistent session. All turn frames stream to `onFrame` until
  // `close()`. Resolves once the socket is authenticated and open.
  open: (onFrame: FrameHandler) => Promise<VividSession>;
}

/**
 * Owns ONE persistent WebSocket to the Vivid backend for an entire conversation
 * (Step 5). Unlike the one-shot socket, it does NOT close after a turn: it
 * authenticates once, then streams every turn's utterance over the same
 * connection and forwards all frames to a caller-supplied handler, so context
 * persists server-side across turns. Confirm tokens and keepalive pings ride the
 * same socket. The caller (useVoiceSession) drives the listen→speak→relisten
 * loop on top of this transport.
 */
export function useVividSession(): UseVividSession {
  // A single live socket for the hook instance, so open() is idempotent-ish and
  // unmount always releases it.
  const socketRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const teardown = useCallback(() => {
    if (pingRef.current !== null) {
      clearInterval(pingRef.current);
      pingRef.current = null;
    }
    const ws = socketRef.current;
    socketRef.current = null;
    if (ws) {
      try {
        ws.close();
      } catch {
        // already closing
      }
    }
  }, []);

  // Always release the socket when the component using this hook unmounts.
  useEffect(() => teardown, [teardown]);

  const open = useCallback(
    (onFrame: FrameHandler): Promise<VividSession> => {
      return new Promise<VividSession>((resolve, reject) => {
        void (async () => {
          if (!AI_WS_BASE) {
            reject(new Error("Voice backend is not configured"));
            return;
          }
          // Reuse an already-open socket if one exists (e.g. a double open()).
          if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            teardown();
          }

          // WebSockets can't send an Authorization header, so the Privy access
          // token rides on the URL; the backend verifies it against Privy's JWKS.
          const token = await getAccessToken();
          if (!token) {
            reject(new Error("Not signed in"));
            return;
          }

          const url = `${AI_WS_BASE.replace(/\/$/, "")}/audio?token=${encodeURIComponent(token)}`;
          vlog("socket", "connecting", { url: url.replace(/token=[^&]+/, "token=…") });
          const ws = new WebSocket(url);
          ws.binaryType = "arraybuffer";
          socketRef.current = ws;

          let opened = false;

          const startKeepalive = () => {
            pingRef.current = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "ping" }));
              }
            }, PING_INTERVAL_MS);
          };

          const session: VividSession = {
            sendUtterance: (audio: Blob) => this_sendUtterance(ws, audio),
            confirm: (confirmToken: string) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "confirm", token: confirmToken }));
              }
            },
            close: teardown,
          };

          const onReady = () => {
            if (opened) return;
            opened = true;
            startKeepalive();
            resolve(session);
          };

          if (ws.readyState === WebSocket.OPEN) {
            onReady();
          } else {
            ws.onopen = onReady;
          }

          ws.onmessage = (ev) => {
            let frame: VividFrame;
            try {
              frame = JSON.parse(String(ev.data)) as VividFrame;
            } catch {
              return;
            }
            // Keepalive replies never reach the caller.
            if (frame.type === "pong") return;
            onFrame(frame);
          };

          ws.onerror = (e) => {
            vwarn("socket", "error", e);
            if (!opened) reject(new Error("Voice connection failed"));
          };
          ws.onclose = (e) => {
            vlog("socket", "closed", { code: e.code, reason: e.reason, wasClean: e.wasClean });
            if (pingRef.current !== null) {
              clearInterval(pingRef.current);
              pingRef.current = null;
            }
            if (socketRef.current === ws) socketRef.current = null;
            if (!opened) reject(new Error("Voice connection closed"));
          };
        })();
      });
    },
    [teardown]
  );

  return { configured: Boolean(AI_WS_BASE), open };
}

/**
 * Stream one utterance as chunked binary frames, then an `endpoint` frame once
 * the send buffer has flushed — so the turn only runs after all audio has left
 * the client. Resolves when `endpoint` is sent; the turn's result arrives later
 * as frames on the session handler.
 */
function this_sendUtterance(ws: WebSocket, audio: Blob): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    void (async () => {
      if (ws.readyState !== WebSocket.OPEN) {
        reject(new Error("Voice session is not open"));
        return;
      }
      const buffer = await audio.arrayBuffer();
      let chunks = 0;
      for (let offset = 0; offset < buffer.byteLength; offset += CHUNK_BYTES) {
        ws.send(buffer.slice(offset, offset + CHUNK_BYTES));
        chunks++;
      }
      vlog("socket", "audio queued", { bytes: buffer.byteLength, chunks });
      const flushThenEndpoint = () => {
        if (ws.readyState !== WebSocket.OPEN) {
          reject(new Error("Voice session closed mid-utterance"));
          return;
        }
        if (ws.bufferedAmount > 0) {
          setTimeout(flushThenEndpoint, 20);
          return;
        }
        ws.send(JSON.stringify({ type: "endpoint" }));
        vlog("socket", "▶ endpoint sent (turn will run)");
        resolve();
      };
      flushThenEndpoint();
    })();
  });
}
