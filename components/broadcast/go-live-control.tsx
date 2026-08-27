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

import { useEffect, useRef, useState } from "react";
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
function Menu({
  onGoLive,
  onShareScreen,
  onInvite,
  onClose,
  align,
}: {
  onGoLive: () => void;
  onShareScreen: () => void;
  onInvite: () => void;
  onClose: () => void;
  align: "up" | "down";
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    // Deferred so the click that opened the menu does not immediately close it.
    const timer = setTimeout(() => window.addEventListener("click", onClick), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
      clearTimeout(timer);
    };
  }, [onClose]);

  const items = [
    { label: "Go Live", body: "Broadcast this view", action: onGoLive },
    { label: "Share screen", body: "Pick a tab or window", action: onShareScreen },
    // Posting deliberately does NOT live here any more. This menu is about
    // broadcasting — camera, screen, viewers — and a text composer sat in it
    // as a fourth unrelated verb. Composing now belongs to the square's own
    // plus control on the dashboard, which is where someone who wants to write
    // something actually is.
    { label: "Invite viewers", body: "Copy a link to your stream", action: onInvite },
  ];

  return (
    <div
      ref={ref}
      role="menu"
      className={`bg-sheet absolute left-1/2 z-[150] w-[212px] -translate-x-1/2 rounded-[16px] border border-white/12 p-1.5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.95)] ${
        align === "up" ? "bottom-[calc(100%+10px)]" : "top-[calc(100%+10px)]"
      }`}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          onClick={item.action}
          className="w-full cursor-pointer rounded-[11px] px-3 py-2 text-left hover:bg-white/8"
        >
          <span className="block text-[13px] font-medium text-white">{item.label}</span>
          <span className="block text-[11px] text-white/45">{item.body}</span>
        </button>
      ))}
    </div>
  );
}

export function GoLiveControl({ variant }: { variant: "tab" | "rail" }) {
  const session = useBroadcastSession();
  const pathname = usePathname() ?? "/";
  const { user } = usePrivy();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sharing, setSharing] = useState(false);

  const target = arkBroadcastTarget(pathname, deriveProfile(user).name);
  const live = session.live;

  const openShare = () => {
    setMenuOpen(false);
    setSharing(true);
  };

  // While live the control stops offering to start a second broadcast and
  // becomes the way back into the console.
  const onPress = () => {
    if (live) {
      setSharing(false);
      setMenuOpen(false);
      return;
    }
    setMenuOpen((open) => !open);
  };

  const label = live ? "Live" : "Go Live";

  return (
    <div className={variant === "tab" ? "relative" : "relative w-full"}>
      <button
        type="button"
        onClick={onPress}
        aria-haspopup={live ? undefined : "menu"}
        aria-expanded={menuOpen}
        data-tour="go-live"
        aria-label={label}
        title={label}
        className={
          variant === "tab"
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
        <span className="grid size-5 place-items-center">
          <LiveIcon size={variant === "tab" ? 22 : 20} />
        </span>
        {variant === "tab" ? null : <span className="flex-1">{label}</span>}
      </button>

      {menuOpen ? (
        <Menu
          align={variant === "tab" ? "up" : "down"}
          onGoLive={openShare}
          onShareScreen={openShare}
          onInvite={() => {
            setMenuOpen(false);
            void navigator.clipboard?.writeText(window.location.href);
          }}
          onClose={() => setMenuOpen(false)}
        />
      ) : null}

      {sharing ? <ShareFlow target={target} onClose={() => setSharing(false)} /> : null}
    </div>
  );
}
