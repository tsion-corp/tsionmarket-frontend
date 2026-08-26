"use client";

// The persistent live indicator. Non-dismissible on purpose: Chrome's own
// "Sharing this tab" banner cannot be dismissed either, and a live indicator a
// user can hide is how people end up broadcasting without realising.
//
// It compresses the page rather than covering it. On a phone it sits directly
// above the tab bar; the shell reserves the height so the bar never hides the
// last row of content, which is the failure mode of a floating pill.
//
// Never colour alone: the pulsing dot AND the word LIVE AND a distinct shape,
// so it survives a colourblind viewer and a greyscale screenshot.

import { useState } from "react";
import { useBroadcastSession } from "@/components/broadcast/broadcast-session";
import { formatElapsed, surfaceChipLabel, viewerLabel } from "@/lib/broadcast/format";
import { SUSPEND_LABEL } from "@/lib/broadcast/sensitive";

/** Height the shell reserves so the bar compresses rather than covers. */
export const LIVE_BAR_HEIGHT = 44;

function Dot({ tone }: { tone: "live" | "amber" | "paused" }) {
  const colour =
    tone === "amber" ? "bg-amber-400" : tone === "paused" ? "bg-white/50" : "bg-violet-400";
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      {tone === "live" ? (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-70" />
      ) : null}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${colour}`} />
    </span>
  );
}

export function LiveBar({ onOpenConsole }: { onOpenConsole: () => void }) {
  const session = useBroadcastSession();
  const [confirming, setConfirming] = useState(false);

  if (!session.live) return null;

  const reconnecting = session.connection === "reconnecting";
  const reconnectingFor = formatElapsed(session.reconnectingMs);
  const tone = reconnecting ? "amber" : session.suspended ? "paused" : "live";
  const viewers = viewerLabel(session.viewers);

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        style={{ height: LIVE_BAR_HEIGHT }}
        className={`flex w-full items-center gap-2 border-t px-3 text-[12px] ${
          reconnecting
            ? "border-amber-400/40 bg-amber-400/12 text-amber-100"
            : "border-violet-400/30 bg-violet-500/12 text-white"
        }`}
      >
        {/* The whole left side taps back to the console. */}
        <button
          type="button"
          onClick={onOpenConsole}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
        >
          <Dot tone={tone} />
          <span className="shrink-0 font-semibold tracking-[0.08em]">
            {reconnecting ? "RECONNECTING" : "LIVE"}
          </span>
          <span className="tnum shrink-0 opacity-80">
            {reconnecting ? reconnectingFor : formatElapsed(session.elapsedMs)}
          </span>
          {viewers ? <span className="shrink-0 opacity-70">{viewers}</span> : null}
          {/* Always visible: what is actually going out. */}
          <span className="truncate rounded-full bg-black/25 px-2 py-0.5 text-[11px] opacity-90">
            {session.suspended
              ? SUSPEND_LABEL[session.suspended]
              : surfaceChipLabel(session.mode, session.surface)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => void session.setMuted(!session.muted)}
          aria-pressed={session.muted}
          className="shrink-0 cursor-pointer rounded-full border border-white/20 px-2.5 py-1 text-[11px] font-medium hover:bg-white/10"
        >
          {session.muted ? "Unmute" : "Mute"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="shrink-0 cursor-pointer rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-black hover:opacity-90"
        >
          End
        </button>
      </div>

      {confirming ? (
        <EndConfirm
          elapsedMs={session.elapsedMs}
          viewers={session.viewers}
          onCancel={() => setConfirming(false)}
          onEnd={() => {
            setConfirming(false);
            void session.stop();
          }}
        />
      ) : null}
    </>
  );
}

// Ending is destructive and irreversible for the people watching, so it gets a
// sheet with what the session actually was, not a bare confirm.
function EndConfirm({
  elapsedMs,
  viewers,
  onCancel,
  onEnd,
}: {
  elapsedMs: number;
  viewers: number | null;
  onCancel: () => void;
  onEnd: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[200] grid place-items-end sm:place-items-center">
      <button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-[2px]"
      />
      <div className="bg-sheet relative m-3 w-full max-w-[380px] rounded-[20px] border border-white/12 p-5">
        <h2 className="text-[16px] font-semibold text-white">End this broadcast?</h2>
        <p className="mt-1.5 text-[12.5px] leading-[1.55] text-white/55">
          Anyone watching will see it end. You can start another at any time.
        </p>
        <dl className="mt-3.5 grid grid-cols-2 gap-2 rounded-[12px] bg-black/25 p-3 text-[12px]">
          <div>
            <dt className="text-white/45">Length</dt>
            <dd className="tnum mt-0.5 font-semibold text-white">{formatElapsed(elapsedMs)}</dd>
          </div>
          <div>
            <dt className="text-white/45">Watching</dt>
            <dd className="tnum mt-0.5 font-semibold text-white">
              {viewers === null ? "—" : viewers}
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 cursor-pointer rounded-full border border-white/14 py-2 text-[13px] font-medium text-white/85 hover:bg-white/8"
          >
            Keep streaming
          </button>
          <button
            type="button"
            onClick={onEnd}
            className="flex-1 cursor-pointer rounded-full bg-white py-2 text-[13px] font-semibold text-black hover:opacity-90"
          >
            End broadcast
          </button>
        </div>
      </div>
    </div>
  );
}
