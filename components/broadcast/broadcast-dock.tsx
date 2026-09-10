"use client";

// Everything the app shows while a broadcast is running, docked in one place.
//
// Two rules from the spec drive the layout. The live indicator must compress
// the page rather than cover it, so the dock publishes its height as a CSS
// variable the shell adds to its bottom padding. And the self-view is a fixed
// panel, not a floating overlay on top of content, so it snaps into a corner
// and stays out of the reading column.

import { useEffect, useRef, useState } from "react";
import { useBroadcastSession } from "@/components/broadcast/broadcast-session";
import { LiveBar, LIVE_BAR_HEIGHT } from "@/components/broadcast/live-bar";
import { BroadcastConsole } from "@/components/broadcast/broadcast-console";
import { SelfView } from "@/components/broadcast/self-view";

export function BroadcastDock() {
  const session = useBroadcastSession();
  const [consoleOpen, setConsoleOpen] = useState(false);
  const live = session.live;

  // The shell pads by this, so the bar takes space from the page instead of
  // sitting on top of its last row.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--ws-live-bar", live ? `${LIVE_BAR_HEIGHT}px` : "0px");
    return () => {
      root.style.removeProperty("--ws-live-bar");
    };
  }, [live]);

  // A broadcast that ended while the console was open should close it rather
  // than leave a panel describing a session that is over.
  const wasLive = useRef(live);
  useEffect(() => {
    if (wasLive.current && !live) setConsoleOpen(false);
    wasLive.current = live;
  }, [live]);

  if (!live) return null;

  return (
    <>
      <SelfView />
      {/* Above the phone tab bar, and along the bottom of the content column on
          desktop. Same component, so the two can never say different things. */}
      <div className="pointer-events-auto fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[95] md:bottom-0 md:left-[248px]">
        <LiveBar onOpenConsole={() => setConsoleOpen(true)} />
      </div>
      {consoleOpen ? <BroadcastConsole onClose={() => setConsoleOpen(false)} /> : null}
    </>
  );
}
