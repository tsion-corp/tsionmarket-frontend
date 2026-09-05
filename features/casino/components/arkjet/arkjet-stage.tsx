"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import type { ArkjetRound } from "@/features/casino/lib/api/arkjet";
import styles from "./arkjet.module.css";

const DEFAULT_STAGE_WIDTH = 1000;
const DEFAULT_STAGE_HEIGHT = 600;
const PLANE_SOURCE_WIDTH = 150;
const PLANE_SOURCE_HEIGHT = 74;
const PLANE_MARGIN_LEFT = 21;
const PLANE_MARGIN_BOTTOM = 7;
const MOUNT_TIME_SECONDS = 8;
const GLIDE_TIME_SECONDS = 4;

type StageSize = { width: number; height: number };
type FlightPoint = { x: number; y: number };
type FlightGeometry = {
  area: string;
  line: string;
  planeHeight: number;
  planeWidth: number;
  point: FlightPoint;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function easePower1Out(progress: number): number {
  return 1 - (1 - progress) ** 2;
}

function easePower1InOut(progress: number): number {
  return progress < 0.5 ? 2 * progress ** 2 : 1 - (-2 * progress + 2) ** 2 / 2;
}

function interpolate(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function getFlightGeometry(elapsedSeconds: number, stage: StageSize): FlightGeometry {
  const planeScale = clamp(stage.width / 900, 0.65, 1);
  const planeWidth = PLANE_SOURCE_WIDTH * planeScale;
  const planeHeight = PLANE_SOURCE_HEIGHT * planeScale;
  const initialPoint = {
    x: PLANE_MARGIN_LEFT,
    y: stage.height - PLANE_MARGIN_BOTTOM,
  };
  const mountPoint = {
    x: Math.max(stage.width - 1.5 * planeWidth, 0),
    y: Math.min(planeHeight, stage.height),
  };
  const glidePoint = {
    x: Math.max(stage.width - planeWidth, 0),
    y: Math.min(3 * planeHeight, stage.height),
  };

  let point: FlightPoint;
  if (elapsedSeconds <= MOUNT_TIME_SECONDS) {
    const progress = clamp(elapsedSeconds / MOUNT_TIME_SECONDS, 0, 1);
    point = {
      x: interpolate(initialPoint.x, mountPoint.x, easePower1Out(progress)),
      y: interpolate(initialPoint.y, mountPoint.y, easePower1InOut(progress)),
    };
  } else {
    const cycle = ((elapsedSeconds - MOUNT_TIME_SECONDS) / GLIDE_TIME_SECONDS) % 2;
    const progress = cycle <= 1 ? cycle : 2 - cycle;
    const eased = easePower1InOut(progress);
    point = {
      x: interpolate(mountPoint.x, glidePoint.x, eased),
      y: interpolate(mountPoint.y, glidePoint.y, eased),
    };
  }

  const line =
    "M 0 " +
    stage.height.toFixed(2) +
    " Q " +
    (point.x * 0.5).toFixed(2) +
    " " +
    stage.height.toFixed(2) +
    " " +
    point.x.toFixed(2) +
    " " +
    point.y.toFixed(2);

  return {
    area:
      line +
      " L " +
      point.x.toFixed(2) +
      " " +
      stage.height.toFixed(2) +
      " L 0 " +
      stage.height.toFixed(2) +
      " Z",
    line,
    planeHeight,
    planeWidth,
    point,
  };
}

function useStageSize(): {
  ref: RefObject<HTMLElement | null>;
  size: StageSize;
} {
  const ref = useRef<HTMLElement>(null);
  const [size, setSize] = useState<StageSize>({
    width: DEFAULT_STAGE_WIDTH,
    height: DEFAULT_STAGE_HEIGHT,
  });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let frame = 0;
    const update = () => {
      const bounds = element.getBoundingClientRect();
      const next = {
        width: Math.max(1, bounds.width),
        height: Math.max(1, bounds.height),
      };
      setSize((current) =>
        Math.abs(current.width - next.width) < 0.5 && Math.abs(current.height - next.height) < 0.5
          ? current
          : next
      );
    };
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(update);
    });

    observer.observe(element);
    frame = window.requestAnimationFrame(update);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return { ref, size };
}

function useFlightTime({
  active,
  animationEnabled,
  runningAt,
}: {
  active: boolean;
  animationEnabled: boolean;
  runningAt: string | null;
}): number {
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!active || !animationEnabled) return;

    let frame = 0;
    const tick = () => {
      setNow(Date.now());
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(frame);
  }, [active, animationEnabled]);

  if (!active || !runningAt) return 0;

  return Math.max(0, now - Date.parse(runningAt)) / 1000;
}

function usePlaneFrame(active: boolean): number {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      setFrame((current) => (current + 1) % 4);
    }, 1000 / 7.5);

    return () => window.clearInterval(timer);
  }, [active]);

  return active ? frame : 0;
}

function multiplierClass(value: number): string {
  if (value >= 10) return styles.multiplierHigh;
  if (value >= 2) return styles.multiplierMedium;
  return styles.multiplierLow;
}

function multiplierGlow(value: number): string {
  if (value >= 10) return "#c017b4";
  if (value >= 2) return "#913ef8";
  return "#34b4ff";
}

function useCountdown(target: string | null): number {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!target) return;
    const update = () => setRemaining(Math.max(0, Date.parse(target) - Date.now()));
    const frame = window.requestAnimationFrame(update);
    const timer = window.setInterval(update, 50);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
    };
  }, [target]);

  return target ? remaining : 0;
}

export function ArkjetMultiplierBar({ rounds }: { rounds: ArkjetRound[] }) {
  const [expanded, setExpanded] = useState(false);
  const completed = rounds.filter((round) => round.crashMultiplier).slice(0, 28);

  return (
    <div className={styles.center}>
      <div className={styles.multiplierBar}>
        <div className={styles.multiplierList}>
          {completed.slice(0, 14).map((round) => {
            const value = Number(round.crashMultiplier);
            return (
              <button
                key={round.roundId}
                type="button"
                className={styles.historyMultiplier + " " + multiplierClass(value)}
                title={`Round ${round.sequence}: ${value.toFixed(2)}x`}
              >
                {value.toFixed(2)}x
              </button>
            );
          })}
          {completed.length === 0 ? (
            <span className={styles.historyMultiplier}>Round history</span>
          ) : null}
        </div>
        <button
          type="button"
          className={styles.historyButton}
          aria-label="Toggle round history"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          •••
        </button>
      </div>
      {expanded ? (
        <div className={styles.historyPopup}>
          <div className={styles.historyTitle}>Round History</div>
          <div className={styles.historyGrid}>
            {completed.map((round) => {
              const value = Number(round.crashMultiplier);
              return (
                <span
                  key={round.roundId}
                  className={styles.historyMultiplier + " " + multiplierClass(value)}
                >
                  {value.toFixed(2)}x
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ArkjetStage({
  round,
  animationEnabled,
  soundEnabled,
}: {
  round: ArkjetRound;
  animationEnabled: boolean;
  soundEnabled: boolean;
}) {
  const waiting = round.status === "COMMITTED" || round.status === "LOCKED";
  const running = round.status === "RUNNING";
  const revealed = round.status === "REVEALED";
  const cancelled = round.status === "CANCELLED";
  const closesIn = useCountdown(waiting ? round.bettingClosesAt : null);
  const fullBetTime = Math.max(
    1,
    Date.parse(round.bettingClosesAt) - Date.parse(round.committedAt)
  );
  const timerProgress = clamp(closesIn / fullBetTime, 0, 1);
  const multiplier = Number(round.currentMultiplier ?? round.crashMultiplier ?? "1");
  const elapsedSeconds = useFlightTime({
    active: running,
    animationEnabled,
    runningAt: round.runningAt,
  });
  const { ref: boardRef, size: stageSize } = useStageSize();
  const flight = getFlightGeometry(elapsedSeconds, stageSize);
  const crashElapsed =
    round.runningAt && round.crashAt
      ? Math.max(0, Date.parse(round.crashAt) - Date.parse(round.runningAt)) / 1000
      : elapsedSeconds;
  const crashFlight = getFlightGeometry(crashElapsed, stageSize);
  const [hiddenAfterExit, setHiddenAfterExit] = useState<string | null>(null);
  const lastSoundRoundRef = useRef<string | null>(null);
  const showPlane = hiddenAfterExit !== round.roundId;
  const frame = usePlaneFrame(animationEnabled && showPlane && !cancelled);
  const sunSize = 2 * Math.hypot(stageSize.width, stageSize.height);

  useEffect(() => {
    if (!revealed) return;

    const timer = window.setTimeout(() => setHiddenAfterExit(round.roundId), 500);
    return () => window.clearTimeout(timer);
  }, [revealed, round.roundId]);

  useEffect(() => {
    if (!revealed || !soundEnabled || lastSoundRoundRef.current === round.roundId) return;

    lastSoundRoundRef.current = round.roundId;
    const audio = new Audio("/casino/arkjet/sounds/fly-away.mp3");
    audio.preload = "auto";
    audio.volume = 0.3;
    void audio.play().catch(() => {
      // Browsers can block sound until the user has interacted with the page.
    });

    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  }, [revealed, round.roundId, soundEnabled]);

  let planePoint = waiting
    ? { x: PLANE_MARGIN_LEFT, y: stageSize.height - PLANE_MARGIN_BOTTOM }
    : flight.point;
  if (revealed) {
    planePoint = {
      x: stageSize.width + PLANE_SOURCE_WIDTH,
      y: crashFlight.point.y - 200,
    };
  }

  const planeStyle: CSSProperties = {
    height: flight.planeHeight + "px",
    left: planePoint.x + "px",
    top: planePoint.y + "px",
    width: flight.planeWidth + "px",
  };
  const glowStyle = {
    "--arkjet-multiplier-color": multiplierGlow(multiplier),
  } as CSSProperties;

  return (
    <section ref={boardRef} className={styles.board} aria-label={"Arkjet round " + round.sequence}>
      <div
        className={styles.boardSun + (running ? " " + styles.boardSunRunning : "")}
        aria-hidden="true"
        style={{
          height: sunSize + "px",
          left: -sunSize / 2 + "px",
          top: stageSize.height - sunSize / 2 + "px",
          width: sunSize + "px",
        }}
      />
      <div
        className={styles.multiplierBlur + (running ? " " + styles.multiplierBlurRunning : "")}
        style={glowStyle}
      />

      {animationEnabled ? (
        <svg
          className={styles.curve}
          viewBox={"0 0 " + stageSize.width + " " + stageSize.height}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {running ? <path d={flight.area} fill="#d0021b" fillOpacity="0.5" /> : null}
          {running ? <path d={flight.line} fill="none" stroke="#f00b3e" strokeWidth="4" /> : null}
        </svg>
      ) : null}

      {waiting ? (
        <div className={styles.waitingWidget}>
          <div className={styles.waitingProp} aria-hidden="true" />
          <div className={styles.waitingText}>WAITING FOR NEXT ROUND</div>
          <div className={styles.waitingTimer}>
            <span style={{ width: timerProgress * 100 + "%" }} />
          </div>
        </div>
      ) : null}

      {running || revealed ? (
        <div
          className={styles.multiplierDisplay + (revealed ? " " + styles.multiplierCrashed : "")}
        >
          {revealed ? <span className={styles.flewAway}>FLEW AWAY!</span> : null}
          {multiplier.toFixed(2)}x
        </div>
      ) : null}

      {cancelled ? <div className={styles.cancelledState}>ROUND CANCELLED</div> : null}

      {animationEnabled && showPlane && !cancelled ? (
        <div
          className={styles.plane + (revealed ? " " + styles.planeFlewAway : "")}
          style={planeStyle}
          aria-hidden="true"
        >
          <div
            className={styles.planeFrame}
            style={{
              backgroundImage: 'url("/casino/arkjet/canvas/plane/spribe/plane-' + frame + '.svg")',
            }}
          />
        </div>
      ) : null}
    </section>
  );
}
