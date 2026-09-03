"use client";

import { useEffect, useRef, useState } from "react";
import type { SpinePlayer as SpinePlayerInstance } from "@esotericsoftware/spine-player";

export type ChickenAnimation =
  "Start" | "Walk" | "Idle Active" | "Happy Jump" | "Collision Ultimate Bloodless";

const SKELETON = "/casino/chicken/spribe/img/pilot-chicken-new@2x.json";
const ATLAS = "/casino/chicken/spribe/img/pilot-chicken-new@2x.atlas";

function loops(animation: ChickenAnimation) {
  return animation !== "Collision Ultimate Bloodless";
}

export function ChickenCharacter({
  animation,
  className,
}: {
  animation: ChickenAnimation;
  className: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<SpinePlayerInstance | null>(null);
  const animationRef = useRef(animation);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    animationRef.current = animation;
    const player = playerRef.current;
    if (!player?.animationState) return;

    player.setAnimation(animation, loops(animation));
    player.play();
  }, [animation]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let player: SpinePlayerInstance | null = null;

    void import("@esotericsoftware/spine-player")
      .then(({ SpinePlayer }) => {
        if (disposed) return;

        player = new SpinePlayer(host, {
          jsonUrl: SKELETON,
          atlasUrl: ATLAS,
          animation: animationRef.current,
          alpha: true,
          backgroundColor: "00000000",
          defaultMix: 0,
          mipmaps: true,
          premultipliedAlpha: true,
          preserveDrawingBuffer: false,
          showControls: false,
          showLoading: false,
          viewport: {
            x: -50,
            y: -20,
            width: 110,
            height: 190,
            padLeft: 0,
            padRight: 0,
            padTop: 0,
            padBottom: 0,
            transitionTime: 0,
          },
          success: (loadedPlayer) => {
            if (disposed) return;
            playerRef.current = loadedPlayer;
            queueMicrotask(() => {
              if (disposed || !loadedPlayer.animationState) return;
              const current = animationRef.current;
              loadedPlayer.setAnimation(current, loops(current));
              loadedPlayer.play();
            });
          },
          error: () => {
            if (!disposed) setFailed(true);
          },
        });
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });

    return () => {
      disposed = true;
      playerRef.current = null;
      player?.dispose();
    };
  }, []);

  return (
    <div className={className} aria-label={`Chicken animation: ${animation}`}>
      <div ref={hostRef} className="h-full w-full" />
      {failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/casino/chicken/spribe/img/pilot-chicken-tutorial@2x.png"
          className="absolute inset-0 h-full w-full object-contain"
          alt=""
        />
      ) : null}
    </div>
  );
}
