"use client";

import { useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import {
  followedGameServerSnapshot,
  followedGameSnapshot,
  subscribeFollowedGame,
} from "@/features/casino/lib/last-standing/followed-game";

// Loaded on demand: the host reaches viem, the sponsored-send stack and the
// motion library through the wager button, and mounted unconditionally from
// the session providers it put all of that in front of every signed-in route
// for a pop-out almost nobody has open.
const MiniTimerHost = dynamic(
  () =>
    import("@/features/casino/components/last-standing/mini-timer").then((m) => m.MiniTimerHost),
  { ssr: false }
);

/**
 * Mounts the Last Man Standing pop-out host only where it can matter.
 *
 * It is useful while a game is being followed, which is what keeps the floating
 * clock alive across navigation. Otherwise there is nothing for it to do.
 *
 * There used to be a second case: on an Arkade route the launcher's click
 * handler reaches the host's offscreen video surfaces synchronously, inside the
 * user gesture, so the host had to be there before the click. That launcher is
 * The Last Man's tile, which is hidden on production, so mounting the wager
 * stack on every Arkade route buys nothing. Restore both together.
 */
export function MiniTimerGate() {
  const followed = useSyncExternalStore(
    subscribeFollowedGame,
    followedGameSnapshot,
    followedGameServerSnapshot
  );
  // The Arkade case is gone while The Last Man is hidden on production: the
  // launcher whose click handler needed the host already mounted is the game's
  // own tile, and that tile is commented out of the catalogue. Following a game
  // is still honoured, so a clock already running survives navigation.
  if (followed === null) return null;
  return <MiniTimerHost />;
}
