"use client";

// The minimised self-view: a small fixed panel showing the camera back to the
// broadcaster, draggable between the four corners.
//
// No Document Picture-in-Picture. It is not Baseline, has effectively no
// mobile support, allows one window per tab, cannot be positioned, and dies
// with its opener. The spec calls it a desktop-only enhancement and says to
// skip it if it costs disproportionate effort; it does, and the live bar is
// the thing that actually has to be right, so this is the fixed panel for both
// platforms and the corner is remembered.

import { useCallback, useState, useSyncExternalStore } from "react";
import { useBroadcastSession } from "@/components/broadcast/broadcast-session";

type Corner = "tl" | "tr" | "bl" | "br";

const STORAGE_KEY = "ws.broadcast.selfView.v1";

const POSITION: Record<Corner, string> = {
  tl: "top-[76px] left-3",
  tr: "top-[76px] right-3",
  bl: "bottom-[130px] left-3",
  br: "bottom-[130px] right-3",
};

// A tiny external store over localStorage, the same shape the balance toggle
// uses: SSR-safe, no setState in an effect, and consistent across tabs.
const listeners = new Set<() => void>();

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  window.addEventListener("storage", notify);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", notify);
  };
}

function readCorner(): Corner {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "tl" || saved === "tr" || saved === "bl" || saved === "br") return saved;
  } catch {
    // Private mode; the default corner is fine.
  }
  return "br";
}

export function SelfView() {
  const session = useBroadcastSession();
  const corner = useSyncExternalStore<Corner>(subscribe, readCorner, () => "br");
  const [hidden, setHidden] = useState(false);

  const move = useCallback((next: Corner) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not being able to remember the corner is not worth an error.
    }
    listeners.forEach((notify) => notify());
  }, []);

  if (!session.sharingCamera || hidden) return null;

  const nextCorner: Record<Corner, Corner> = { br: "bl", bl: "tl", tl: "tr", tr: "br" };

  return (
    <div
      className={`fixed z-[96] w-[96px] overflow-hidden rounded-[12px] border border-white/18 bg-[#141416] shadow-[0_18px_50px_-16px_rgba(0,0,0,0.95)] ${POSITION[corner]}`}
    >
      <div className="grid h-[128px] place-items-center bg-[radial-gradient(circle_at_50%_35%,#2a2a2e_0%,#141416_72%)] text-[10px] text-white/45">
        Camera on
      </div>
      <div className="flex border-t border-white/10">
        <button
          type="button"
          onClick={() => move(nextCorner[corner])}
          aria-label="Move the self view"
          className="flex-1 cursor-pointer py-1.5 text-[10px] text-white/60 hover:bg-white/8"
        >
          Move
        </button>
        <button
          type="button"
          onClick={() => setHidden(true)}
          aria-label="Hide the self view"
          className="flex-1 cursor-pointer border-l border-white/10 py-1.5 text-[10px] text-white/60 hover:bg-white/8"
        >
          Hide
        </button>
      </div>
    </div>
  );
}
