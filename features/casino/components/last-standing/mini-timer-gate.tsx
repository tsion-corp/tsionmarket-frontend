"use client";

import { useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
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
 * Two cases need it. On an Arkade route the launcher's click handler reaches
 * the host's offscreen video surfaces synchronously, inside the user gesture,
 * so the host has to be there before the click. Anywhere else it is only
 * useful while a game is being followed, which is what keeps the floating
 * clock alive across navigation. With neither there is nothing for it to do.
 */
export function MiniTimerGate() {
  const pathname = usePathname();
  const followed = useSyncExternalStore(
    subscribeFollowedGame,
    followedGameSnapshot,
    followedGameServerSnapshot
  );
  const onArkade = pathname?.startsWith("/casino") ?? false;
  if (!onArkade && followed === null) return null;
  return <MiniTimerHost />;
}
