"use client";

// What the live bar taps into: the controls that do not belong on a 44px
// strip. Camera, blur, resuming a stopped share, and the reason the video is
// held when a sensitive screen suspended it.

import { useBroadcastSession } from "@/components/broadcast/broadcast-session";
import { formatElapsed, surfaceChipLabel, viewerLabel } from "@/lib/broadcast/format";
import { SUSPEND_LABEL } from "@/lib/broadcast/sensitive";
import { Switch } from "@/components/ui/switch";

export function BroadcastConsole({ onClose }: { onClose: () => void }) {
  const session = useBroadcastSession();
  const viewers = viewerLabel(session.viewers);

  return (
    <div className="fixed inset-0 z-[200] grid place-items-end sm:place-items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-[2px]"
      />
      <div className="bg-sheet relative m-3 w-full max-w-[400px] rounded-[22px] border border-white/12 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[17px] font-semibold text-white">You are live</h2>
          <span className="tnum text-[13px] text-white/60">{formatElapsed(session.elapsedMs)}</span>
        </div>
        <p className="mt-1 text-[12px] text-white/50">
          {surfaceChipLabel(session.mode, session.surface)}
          {viewers ? ` · ${viewers}` : ""}
        </p>

        {session.suspended ? (
          <p className="mt-3 rounded-[12px] border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-[12px] leading-[1.5] text-amber-100">
            {SUSPEND_LABEL[session.suspended]}. Nothing is going out from this screen. It resumes on
            its own when you leave it.
          </p>
        ) : null}

        <label className="mt-3.5 flex cursor-pointer items-center justify-between gap-3 rounded-[12px] border border-white/10 px-3 py-2.5">
          <span className="text-[12.5px] text-white/75">Camera</span>
          <Switch
            checked={session.sharingCamera}
            disabled={session.busy}
            onCheckedChange={(next: boolean) => void session.setCameraEnabled(next)}
          />
        </label>

        <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 rounded-[12px] border border-white/10 px-3 py-2.5">
          <span>
            <span className="block text-[12.5px] text-white/75">Blur balances &amp; wallet</span>
            <span className="block text-[11px] text-white/45">
              Turning this off shows your numbers to everyone watching.
            </span>
          </span>
          <Switch
            checked={session.blurSensitive}
            onCheckedChange={(next: boolean) => session.setBlurSensitive(next)}
          />
        </label>

        {session.phase === "share-stopped" ? (
          <div className="mt-3 rounded-[12px] border border-white/12 px-3 py-2.5">
            <p className="text-[12px] leading-[1.5] text-white/70">
              You stopped sharing your screen, so nothing is going out. Your browser will not let
              the page restart it on its own.
            </p>
            <button
              type="button"
              onClick={() => void session.resumeScreenShare()}
              disabled={session.busy}
              className="mt-2 cursor-pointer rounded-full bg-white px-3.5 py-1.5 text-[12px] font-semibold text-black hover:opacity-90 disabled:opacity-50"
            >
              Share again
            </button>
          </div>
        ) : null}

        {session.error ? (
          <p className="mt-3 rounded-[12px] border border-red-400/30 px-3 py-2 text-[12px] text-red-200">
            {session.error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full cursor-pointer rounded-full border border-white/14 py-2 text-[13px] font-medium text-white/85 hover:bg-white/8"
        >
          Back to Ark
        </button>
      </div>
    </div>
  );
}
