"use client";

// The Go Live control, in the two places the spec puts it.
//
// Mobile: the centre node of the existing tab bar, a ringed circle breaking
// the bar's top edge. It reads as floating without floating: Material 3 is
// explicit that a FAB must not obstruct the navigation bar, and a genuinely
// free-floating button permanently covers content underneath it. This gets the
// affordance with none of the occlusion, and lands in the thumb zone by
// construction.
//
// Desktop: pinned at the top of the rail above a divider, never an overlay.
//
// Always icon AND label. A bare icon here would be mystery meat, and this
// button starts a public broadcast of somebody's trading screen.

import { useState } from "react";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { deriveProfile } from "@/lib/user";
import { arkBroadcastTarget } from "@/components/broadcast/ark-target";
import { useBroadcastSession } from "@/components/broadcast/broadcast-session";
import { ShareFlow } from "@/components/broadcast/share-flow";

function LiveIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3.2" fill="currentColor" />
      <path
        d="M7.4 7.4a6.5 6.5 0 0 0 0 9.2M16.6 16.6a6.5 6.5 0 0 0 0-9.2M4.6 4.6a10.5 10.5 0 0 0 0 14.8M19.4 19.4a10.5 10.5 0 0 0 0-14.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Two to six items, laid out as a menu rather than a speed dial: mini-FAB
// stacks are unlabelled by nature and the spec rules them out.
/**
 * `tile` is the square's entry sheet: a square button in a three-up grid
 * beside Post and Media. It exists so that sheet reuses the REAL control —
 * session state, the broadcast target derived from the route, the whole menu —
 * rather than a lookalike button wired to a callback that has to be threaded
 * down and, as shipped, never was.
 */
export function GoLiveControl({ variant }: { variant: "tab" | "rail" | "tile" }) {
  const session = useBroadcastSession();
  const pathname = usePathname() ?? "/";
  const { user } = usePrivy();
  const [sharing, setSharing] = useState(false);

  const target = arkBroadcastTarget(pathname, deriveProfile(user).name);
  const live = session.live;

  /**
   * One press, straight into the broadcast picker.
   *
   * There used to be a menu here, and it was a tap that bought nothing: "Go
   * Live" and "Share screen" invoked the SAME handler, and the picker it opens
   * asks camera-or-screen as its first question anyway. So the menu made
   * people choose, then asked them to choose again.
   *
   * "Invite viewers" is gone with it. It copied the CURRENT PAGE URL to the
   * clipboard, which is not a link to the stream — and it silently claimed
   * success whether or not the clipboard was available.
   */
  const onPress = () => {
    if (live) {
      // While live the control stops offering to start a second broadcast and
      // becomes the way back into the console.
      setSharing(false);
      return;
    }
    setSharing(true);
  };

  const label = live ? "Live" : "Go Live";

  return (
    <div className={variant === "rail" ? "relative w-full" : "relative"}>
      <button
        type="button"
        onClick={onPress}
        data-tour="go-live"
        aria-label={label}
        title={label}
        className={
          variant === "tile"
            ? // The square's entry sheet: a square button matching Post and
              // Media beside it, so the three read as one row of choices.
              `ws-inset flex w-full cursor-pointer flex-col items-center gap-2 px-2 py-4 transition-colors hover:bg-white/5 ${
                live ? "ring-1 ring-violet-400/50" : ""
              }`
            : variant === "tab"
              ? // Sits IN the bar at the same 44px height as every other tab.
                // It was a raised 52px node breaking the pill's top edge, which
                // overflowed the bar on a phone — the reason a raised node works
                // elsewhere is a full-width bar with room above it, and this is a
                // floating pill with neither. Distinction comes from the violet
                // ring and fill rather than from size or elevation, so it reads
                // as the one different thing in the row without leaving it.
                `pointer-events-auto grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-white ring-1 transition-colors ${
                  live
                    ? "bg-violet-500 ring-violet-300/70"
                    : "bg-violet-500/22 ring-violet-400/55 hover:bg-violet-500/32"
                }`
              : `flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-[11px] text-left font-sans text-[14.5px] font-medium transition-colors ${
                  live
                    ? "bg-violet-500/22 text-white ring-1 ring-violet-400/50"
                    : "text-white/75 hover:bg-white/6 hover:text-white"
                }`
        }
      >
        <span
          className={
            variant === "tile"
              ? "text-accent grid size-6 place-items-center"
              : "grid size-5 place-items-center"
          }
        >
          <LiveIcon size={variant === "tab" ? 22 : variant === "tile" ? 24 : 20} />
        </span>
        {variant === "tab" ? null : (
          <span
            className={variant === "tile" ? "text-[12.5px] font-semibold text-white" : "flex-1"}
          >
            {label}
          </span>
        )}
      </button>

      {sharing ? <ShareFlow target={target} onClose={() => setSharing(false)} /> : null}
    </div>
  );
}
