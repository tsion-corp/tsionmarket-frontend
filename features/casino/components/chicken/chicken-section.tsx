"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AppModalHost, useAppModals } from "@/components/layout/modals/app-modals";
import { useMoney } from "@/components/ui/currency-select";
import type { ChickenDifficulty, ChickenSession } from "@/features/casino/lib/api/arkjet";
import { useChicken } from "@/features/casino/hooks/use-chicken";
import { gameActionError } from "@/features/casino/lib/game-error";
import { sampleTrafficPass } from "@/features/casino/lib/chicken-traffic";
import { usePortfolio } from "@/hooks/use-portfolio";
import { fromBaseUnits } from "@/lib/trade/math";
import { amountUnits, normalizeArkjetAmount, stepArkjetAmount } from "../../lib/arkjet-funding";
import { GameHowToPlay } from "../game-how-to-play";
import { GameMoneyInput } from "../game-money-input";
import { ChickenCharacter, type ChickenAnimation } from "./chicken-character";
import styles from "./chicken.module.css";

const ASSET = "/casino/chicken/spribe";
const DIFFICULTY_LABEL: Record<ChickenDifficulty, string> = {
  easy: "🐣 Easy",
  medium: "🐔 Medium",
  hard: "🍗 Hard",
};
const FAST_STAKES = [1, 2, 5, 10];
const PLANES = [
  "plane-cargo",
  "plane-double-engine",
  "plane-drone",
  "plane-fighter",
  "plane-new-gen",
  "plane-old",
  "plane-stealth",
];
const CROSSING_MS = 250;
const CHECKPOINT_REVEAL_MS = 150;
const RESULT_HOLD_MS = 1_000;
const WORLD_RESET_MS = 500;

const ArkjetCashier = dynamic(
  () => import("../arkjet/arkjet-cashier").then((module) => module.ArkjetCashier),
  { ssr: false }
);

const ArkadeCampaignBadge = dynamic(
  () => import("../campaign/arkade-campaign-badge").then((module) => module.ArkadeCampaignBadge),
  { ssr: false }
);

type VisualPhase =
  "setup" | "ready" | "walking" | "waiting" | "lost" | "lost-reset" | "won" | "won-reset";

interface ResultBanner {
  tone: "lost" | "won";
  title: string;
  detail?: string;
}

interface CrossingTraffic {
  collision: boolean;
  key: string;
  step: number;
  texture: string;
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

function collisionPlaneTexture(resultHash: string) {
  const hashPrefix = resultHash.replace(/^0x/, "").slice(0, 8);
  const hashValue = Number.parseInt(hashPrefix, 16);
  return PLANES[(Number.isFinite(hashValue) ? hashValue : 0) % PLANES.length];
}

function LanePlane({ muted }: { muted: boolean }) {
  const [plane, setPlane] = useState({
    durationMs: 500,
    pass: 0,
    texture: 0,
    visible: false,
  });

  useEffect(() => {
    let timer: number | undefined;
    let flight: number | undefined;

    const schedule = () => {
      const next = sampleTrafficPass(PLANES.length);
      timer = window.setTimeout(() => {
        setPlane((current) => ({
          durationMs: next.durationMs,
          pass: current.pass + 1,
          texture: next.textureIndex,
          visible: true,
        }));
        flight = window.setTimeout(() => {
          setPlane((current) => ({ ...current, visible: false }));
          schedule();
        }, next.durationMs);
      }, next.delayMs);
    };

    schedule();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      if (flight !== undefined) window.clearTimeout(flight);
    };
  }, []);

  if (!plane.visible) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={plane.pass}
      className={`${styles.plane} ${muted ? styles.planeMuted : ""}`}
      src={`${ASSET}/img/${PLANES[plane.texture]}@2x.png`}
      style={{ "--plane-duration": `${plane.durationMs}ms` } as CSSProperties}
      alt=""
    />
  );
}

export function ChickenSection() {
  const game = useChicken();
  const portfolio = usePortfolio({ scope: "base" });
  const modals = useAppModals();
  const money = useMoney();
  const [difficulty, setDifficulty] = useState<ChickenDifficulty>("medium");
  const [amount, setAmount] = useState("0.10");
  const [notice, setNotice] = useState<string | null>(null);
  const [cashierOpen, setCashierOpen] = useState(false);
  const [cashierInitialAmount, setCashierInitialAmount] = useState<string | undefined>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  const [chickenEntered, setChickenEntered] = useState(false);
  const [visualStep, setVisualStep] = useState(0);
  const [revealedStep, setRevealedStep] = useState(0);
  const [visualSessionId, setVisualSessionId] = useState<string | null>(null);
  const [phase, setPhase] = useState<VisualPhase>("setup");
  const [resultBanner, setResultBanner] = useState<ResultBanner | null>(null);
  const [crossingTraffic, setCrossingTraffic] = useState<CrossingTraffic | null>(null);
  const animationSequence = useRef(0);
  const interactionLocked = useRef(false);
  const session = game.session;
  const activeSession = session?.status === "active" ? session : null;
  const active = Boolean(activeSession);
  const selectedDifficulty = activeSession?.difficulty ?? difficulty;
  const visualSession = session?.sessionId === visualSessionId ? session : null;
  const stageDifficulty = visualSession?.difficulty ?? selectedDifficulty;
  const ladder =
    game.rules?.difficulties.find((item) => item.difficulty === stageDifficulty)
      ?.payoutMultipliersHundredths ?? [];
  const currentStep = activeSession?.currentStep ?? 0;
  const visibleSteps =
    visualSession?.steps.filter((item) => item.won && item.step <= revealedStep) ?? [];
  const currentWonStep = visibleSteps.at(-1)?.step ?? 0;
  const nextStep = currentStep + 1;
  const currency = game.risk?.currency ?? game.balance?.currency ?? "USDC";
  const displayCurrency = money.ready ? money.currency.code : "USD";
  const formatGameMoney = (value: string | null | undefined) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? money.formatExact(parsed) : String(value ?? "");
  };
  const minimumStake = game.risk?.minimumBet ?? "0.1";
  const normalizedAmount = normalizeArkjetAmount(amount, 6);
  const validAmount = amountUnits(normalizedAmount, 6) >= amountUnits(minimumStake, 6);
  const needsFunding =
    validAmount &&
    amountUnits(normalizedAmount, 6) >
      amountUnits(normalizeArkjetAmount(game.balance?.available ?? "0", 6), 6);
  const requiredUnits = amountUnits(normalizedAmount, 6);
  const playableUnits = amountUnits(normalizeArkjetAmount(game.balance?.available ?? "0", 6), 6);
  const shortfallUnits = requiredUnits > playableUnits ? requiredUnits - playableUnits : 0n;
  const walletToken = portfolio.tokens.find(
    (token) => token.network === "base-mainnet" && token.symbol.toUpperCase() === "USDC"
  );
  const walletRaw = BigInt(walletToken?.rawBalance ?? "0");
  const openFunding = () => {
    if (!portfolio.loading && walletRaw < shortfallUnits) {
      modals.openFunds();
      return;
    }
    setCashierInitialAmount(fromBaseUnits(shortfallUnits, 6));
    setCashierOpen(true);
  };
  const openBalance = () => {
    if (!portfolio.loading && needsFunding && walletRaw < shortfallUnits) {
      modals.openFunds();
      return;
    }
    setCashierInitialAmount(needsFunding ? fromBaseUnits(shortfallUnits, 6) : undefined);
    setCashierOpen(true);
  };
  const overlayVisible = menuOpen || historyOpen;
  const visualBusy = !["ready", "waiting"].includes(phase);
  const controlsLocked = game.pending || visualBusy;
  const showRoundActions = Boolean(activeSession && activeSession.sessionId === visualSessionId);
  const chickenAnimation: ChickenAnimation = ["setup", "walking"].includes(phase)
    ? "Walk"
    : ["lost", "lost-reset"].includes(phase)
      ? "Collision Ultimate Bloodless"
      : ["won", "won-reset"].includes(phase)
        ? "Happy Jump"
        : phase === "waiting"
          ? "Idle Active"
          : "Start";
  const stageMessage = notice;
  const worldStyle = {
    "--world-transition": ["lost-reset", "won-reset"].includes(phase)
      ? `${WORLD_RESET_MS}ms`
      : `${CROSSING_MS}ms`,
    "--world-scroll":
      visualStep === 0
        ? "0px"
        : `calc((var(--road-start) + ${visualStep - 1.5} * var(--lane-width)) * -1)`,
    "--chicken-position": !chickenEntered
      ? "calc(var(--chicken-window-width) * -0.5)"
      : visualStep === 0
        ? "calc(var(--road-start) - var(--lane-width) * 0.5)"
        : `calc(var(--road-start) + ${visualStep - 0.5} * var(--lane-width))`,
  } as CSSProperties;

  useEffect(() => {
    const sequence = ++animationSequence.current;
    let setupTimer: number | undefined;
    const frame = window.requestAnimationFrame(() => {
      setChickenEntered(true);
      setupTimer = window.setTimeout(() => {
        if (animationSequence.current === sequence) setPhase("ready");
      }, CROSSING_MS);
    });

    return () => {
      animationSequence.current += 1;
      window.cancelAnimationFrame(frame);
      if (setupTimer !== undefined) window.clearTimeout(setupTimer);
    };
  }, []);

  useEffect(() => {
    if (
      phase !== "ready" ||
      game.pending ||
      !activeSession ||
      activeSession.sessionId === visualSessionId
    ) {
      return;
    }

    const restoreTimer = window.setTimeout(() => {
      setVisualSessionId(activeSession.sessionId);
      setVisualStep(activeSession.currentStep);
      setRevealedStep(activeSession.currentStep);
      if (activeSession.currentStep > 0) setPhase("waiting");
    }, 0);

    return () => window.clearTimeout(restoreTimer);
  }, [activeSession, game.pending, phase, visualSessionId]);

  async function resetVisual(sequence: number, terminalPhase: "lost" | "won") {
    await delay(RESULT_HOLD_MS);
    if (animationSequence.current !== sequence) return;

    setPhase(terminalPhase === "lost" ? "lost-reset" : "won-reset");
    setCrossingTraffic(null);
    setVisualStep(0);
    await delay(WORLD_RESET_MS);
    if (animationSequence.current !== sequence) return;

    setRevealedStep(0);
    setVisualSessionId(null);
    setResultBanner(null);
    setChickenEntered(false);
    setPhase("setup");
    await delay(16);
    if (animationSequence.current !== sequence) return;

    setChickenEntered(true);
    await delay(CROSSING_MS);
    if (animationSequence.current === sequence) setPhase("ready");
  }

  async function animateResolvedStep(updated: ChickenSession, sequence: number) {
    const outcome = updated.steps.at(-1);
    if (!outcome) throw new Error("The Chicken step result is missing");

    setVisualSessionId(updated.sessionId);
    setCrossingTraffic({
      collision: !outcome.won,
      key: `${updated.sessionId}-${outcome.resultHash}`,
      step: outcome.step,
      texture: collisionPlaneTexture(outcome.resultHash),
    });
    setPhase("walking");
    setVisualStep(outcome.step);

    if (outcome.won) {
      await delay(CHECKPOINT_REVEAL_MS);
      if (animationSequence.current !== sequence) return;
      setRevealedStep(outcome.step);
      await delay(CROSSING_MS - CHECKPOINT_REVEAL_MS);
    } else {
      await delay(CROSSING_MS);
    }
    if (animationSequence.current !== sequence) return;

    if (!outcome.won) {
      setPhase("lost");
      setResultBanner({
        tone: "lost",
        title: "Lost",
      });
      await resetVisual(sequence, "lost");
      return;
    }

    setCrossingTraffic(null);

    if (updated.status === "active") {
      setPhase("waiting");
      return;
    }

    setPhase("won");
    setResultBanner({
      tone: "won",
      title: "Win",
      detail: formatGameMoney(updated.payout),
    });
    await resetVisual(sequence, "won");
  }

  async function executeStep(operation: () => Promise<ChickenSession>, freshRound = false) {
    if (interactionLocked.current) return;
    interactionLocked.current = true;
    const sequence = ++animationSequence.current;
    setNotice(null);
    setResultBanner(null);
    if (freshRound) {
      setCrossingTraffic(null);
      setVisualSessionId(null);
      setVisualStep(0);
      setRevealedStep(0);
      setPhase("ready");
    }

    try {
      const updated = await operation();
      if (animationSequence.current === sequence) await animateResolvedStep(updated, sequence);
    } catch (error) {
      if (animationSequence.current !== sequence) return;
      setCrossingTraffic(null);
      setNotice(gameActionError(error, "Chicken Cross", "That crossing could not be completed."));
      setPhase(visualStep > 0 ? "waiting" : "ready");
    } finally {
      if (animationSequence.current === sequence) interactionLocked.current = false;
    }
  }

  async function executeCashout(operation: () => Promise<ChickenSession>) {
    if (interactionLocked.current) return;
    interactionLocked.current = true;
    const sequence = ++animationSequence.current;
    setNotice(null);
    setCrossingTraffic(null);
    try {
      const updated = await operation();
      if (animationSequence.current !== sequence) return;
      setVisualSessionId(updated.sessionId);
      setPhase("won");
      setResultBanner({
        tone: "won",
        title: "Win",
        detail: formatGameMoney(updated.payout),
      });
      await resetVisual(sequence, "won");
    } catch (error) {
      if (animationSequence.current !== sequence) return;
      setNotice(gameActionError(error, "Chicken Cross", "That cashout could not be completed."));
      setPhase("waiting");
    } finally {
      if (animationSequence.current === sequence) interactionLocked.current = false;
    }
  }

  return (
    <main className={styles.game}>
      <header className={styles.header}>
        <Link href="/casino" className={styles.backButton} aria-label="Back to Arkade">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m14.5 5-7 7 7 7" />
          </svg>
        </Link>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.logoDesktop} src={`${ASSET}/img/logo@2x.png`} alt="Pilot Chicken" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.logoMobile}
          src={`${ASSET}/img/logo-mobile@2x.png`}
          alt="Pilot Chicken"
        />
        <button
          type="button"
          className={styles.howToPlayTag}
          onClick={() => {
            setHistoryOpen(false);
            setMenuOpen(false);
            setHowToPlayOpen(true);
          }}
        >
          ? How to play
        </button>
        <ArkadeCampaignBadge
          className={styles.campaignSlot}
          enabled={game.authReady && game.authenticated}
        />
        <div className={styles.headerRight}>
          <button
            type="button"
            className={styles.balance}
            aria-label={game.authenticated ? "Open Chicken Cross balance" : "Sign in to add funds"}
            onClick={() => {
              setHistoryOpen(false);
              setMenuOpen(false);
              if (game.authenticated) {
                openBalance();
              } else game.login();
            }}
          >
            <span className={styles.balanceAmount}>
              {formatGameMoney(game.authenticated ? game.balance?.available : "0")}
            </span>
            <span className={styles.balanceCurrency}>{displayCurrency}</span>
            <span className={styles.balanceAdd} aria-hidden="true">
              +
            </span>
          </button>
          <button
            type="button"
            className={styles.circleButton}
            aria-label="Game menu"
            aria-expanded={menuOpen}
            onClick={() => {
              setHistoryOpen(false);
              setMenuOpen((open) => !open);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${ASSET}/icons/icon-menu.svg`} alt="" />
          </button>
        </div>
      </header>

      <section className={styles.gameStage}>
        <div className={styles.stageHeader}>
          <label className={styles.difficulty}>
            <span className={styles.srOnly}>Difficulty</span>
            <select
              value={selectedDifficulty}
              disabled={active || controlsLocked}
              onChange={(event) => setDifficulty(event.target.value as ChickenDifficulty)}
            >
              {(Object.keys(DIFFICULTY_LABEL) as ChickenDifficulty[]).map((item) => (
                <option key={item} value={item}>
                  {DIFFICULTY_LABEL[item]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={styles.stats}
            aria-label="Round history"
            aria-expanded={historyOpen}
            onClick={() => {
              setMenuOpen(false);
              setHistoryOpen((open) => !open);
            }}
          >
            <div className={styles.payouts}>
              {game.history.slice(0, 8).map((item) => (
                <span
                  className={
                    Number(item.currentMultiplier) >= 10
                      ? styles.pink
                      : Number(item.currentMultiplier) >= 2
                        ? styles.purple
                        : styles.blue
                  }
                  key={item.sessionId}
                >
                  {item.currentMultiplier}x
                </span>
              ))}
              {game.history.length === 0 ? <span>Round History</span> : null}
            </div>
            <span className={styles.historyButton}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/casino/chicken/spribe/icons/icon-bets-history.svg" alt="" />
            </span>
          </button>
        </div>

        <div className={styles.stage}>
          <div className={styles.world} style={worldStyle}>
            <div className={styles.startPart} />
            <div className={styles.roads}>
              {ladder.map((hundredths, index) => {
                const step = index + 1;
                const result = visibleSteps.find((item) => item.step === step);
                const cleared = Boolean(result?.won);
                const isCurrent = currentWonStep === step;
                const traffic = crossingTraffic?.step === step ? crossingTraffic : null;
                return (
                  <div className={styles.roadLane} key={`${stageDifficulty}-${step}`}>
                    <div className={styles.checkpoint}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`${ASSET}/img/${cleared ? "cap-golden" : "cap-normal"}@2x.png`}
                        alt=""
                      />
                      {!isCurrent ? (
                        <span className={styles.multiplier}>{(hundredths / 100).toFixed(2)}x</span>
                      ) : null}
                    </div>
                    {isCurrent ? (
                      <div className={styles.currentMultiplier}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`${ASSET}/img/current-multiplier@2x.png`} alt="" />
                        <span>{(hundredths / 100).toFixed(2)}x</span>
                      </div>
                    ) : null}
                    <LanePlane muted={Boolean(traffic)} />
                    {traffic?.collision ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={traffic.key}
                        className={`${styles.plane} ${styles.collisionPlane}`}
                        src={`${ASSET}/img/${traffic.texture}@2x.png`}
                        alt=""
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className={styles.finishPart} />
            <ChickenCharacter className={styles.chicken} animation={chickenAnimation} />
          </div>
          {resultBanner ? (
            <div
              className={`${styles.resultBanner} ${
                resultBanner.tone === "lost" ? styles.resultLost : styles.resultWon
              }`}
            >
              <strong>{resultBanner.title}</strong>
              {resultBanner.detail ? <span>{resultBanner.detail}</span> : null}
            </div>
          ) : null}
          {stageMessage ? <div className={styles.stageNotice}>{stageMessage}</div> : null}
        </div>
      </section>

      {overlayVisible ? (
        <button
          type="button"
          className={styles.overlayMask}
          aria-label="Close overlay"
          onClick={() => {
            setMenuOpen(false);
            setHistoryOpen(false);
          }}
        />
      ) : null}

      {historyOpen ? (
        <aside className={styles.historyPanel} aria-label="Round history">
          <div className={styles.panelTitle}>
            <span>Round History</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${ASSET}/icons/icon-bets-history.svg`} alt="" />
          </div>
          <div className={styles.historyGrid}>
            {game.history.length ? (
              game.history.map((item) => (
                <span
                  className={
                    Number(item.currentMultiplier) >= 10
                      ? styles.pink
                      : Number(item.currentMultiplier) >= 2
                        ? styles.purple
                        : styles.blue
                  }
                  key={item.sessionId}
                >
                  {item.currentMultiplier}x
                </span>
              ))
            ) : (
              <span className={styles.emptyHistory}>No completed rounds</span>
            )}
          </div>
        </aside>
      ) : null}

      {menuOpen ? (
        <aside className={styles.menuPanel} aria-label="Game menu">
          <strong className={styles.menuUser}>
            {game.authenticated ? "Arkjet player" : "Guest"}
          </strong>
          <div className={styles.riskSummary}>
            <span>
              House edge <strong>{game.rules?.houseEdgePercent ?? "38.00"}%</strong>
            </span>
            <span>
              Reserve exposure <strong>{game.rules?.reserveRiskPercent ?? "20.00"}% max</strong>
            </span>
          </div>
          <div className={styles.audioGroup}>
            <div className={styles.menuRow}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${ASSET}/icons/icon-sound.svg`} alt="" />
              <span>Sound</span>
              <span className={styles.toggle} aria-hidden="true" />
            </div>
            <div className={styles.menuRow}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${ASSET}/icons/icon-music.svg`} alt="" />
              <span>Music</span>
              <span className={styles.toggle} aria-hidden="true" />
            </div>
          </div>
          <nav className={styles.menuLinks}>
            <span className={styles.menuRow}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${ASSET}/icons/icon-free-bets.svg`} alt="" />
              Free Tickets
            </span>
            <button
              type="button"
              className={styles.menuRow}
              onClick={() => {
                setMenuOpen(false);
                setHistoryOpen(true);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${ASSET}/icons/icon-bets-history.svg`} alt="" />
              Session History
            </button>
            <span className={styles.menuRow}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${ASSET}/icons/icon-game-limits.svg`} alt="" />
              Game Limits
            </span>
            <button
              type="button"
              className={styles.menuRow}
              onClick={() => {
                setMenuOpen(false);
                setHowToPlayOpen(true);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${ASSET}/icons/icon-hint.svg`} alt="" />
              How to Play
            </button>
            <span className={styles.menuRow}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${ASSET}/icons/icon-game-rules.svg`} alt="" />
              Game Rules
            </span>
            <span className={styles.menuRow}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${ASSET}/icons/icon-PFS.svg`} alt="" />
              Provably Fair Settings
            </span>
          </nav>
          <Link className={`${styles.menuRow} ${styles.homeLink}`} href="/casino">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${ASSET}/icons/icon-home.svg`} alt="" />
            Home
          </Link>
          <div className={styles.fairFooter}>Provably Fair Game</div>
        </aside>
      ) : null}

      <section className={styles.betControl}>
        <div className={styles.betWrapper}>
          <div className={styles.tabs}>
            <button type="button" className={styles.activeTab}>
              Ticket
            </button>
            <button type="button" disabled>
              Free Ticket
            </button>
          </div>
          <div className={styles.betHalf}>
            <div className={styles.inputs}>
              <div className={styles.spinner}>
                <button
                  type="button"
                  disabled={active || controlsLocked}
                  onClick={() => setAmount(stepArkjetAmount(amount, minimumStake, "decrease"))}
                  aria-label="Decrease stake"
                >
                  −
                </button>
                <label>
                  <span className={styles.srOnly}>Stake</span>
                  <GameMoneyInput
                    inputMode="decimal"
                    disabled={active || controlsLocked}
                    value={amount}
                    currencyDecimals={6}
                    onValueChange={setAmount}
                  />
                  <small>{displayCurrency}</small>
                </label>
                <button
                  type="button"
                  disabled={active || controlsLocked}
                  onClick={() => setAmount(stepArkjetAmount(amount, minimumStake, "increase"))}
                  aria-label="Increase stake"
                >
                  +
                </button>
              </div>
              <div className={styles.fastBets}>
                {FAST_STAKES.map((stake) => (
                  <button
                    type="button"
                    disabled={active || controlsLocked}
                    key={stake}
                    onClick={() => setAmount(String(stake))}
                  >
                    {money.formatExact(stake)}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.actions}>
              {!showRoundActions || !activeSession ? (
                <button
                  type="button"
                  className={styles.mainBet}
                  disabled={controlsLocked || !validAmount || active}
                  onClick={() => {
                    if (!game.authenticated) {
                      game.login();
                      return;
                    }
                    if (needsFunding) {
                      openFunding();
                      return;
                    }
                    void executeStep(() => game.start({ amount, currency, difficulty }), true);
                  }}
                >
                  <span>
                    {game.pending
                      ? "WAIT..."
                      : !game.authenticated
                        ? "SIGN IN"
                        : needsFunding
                          ? "ADD FUNDS"
                          : "SUBMIT"}
                  </span>
                  <span>{formatGameMoney(amount)}</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className={styles.cashout}
                    disabled={controlsLocked || currentStep === 0}
                    onClick={() => void executeCashout(() => game.cashout(activeSession))}
                  >
                    <span>CASH OUT</span>
                    <span>{formatGameMoney(activeSession.potentialPayout)}</span>
                  </button>
                  <button
                    type="button"
                    className={styles.next}
                    disabled={controlsLocked}
                    onClick={() => void executeStep(() => game.step(activeSession))}
                  >
                    <span>{game.pending ? "WAIT..." : "NEXT"}</span>
                    <span>STEP {nextStep}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {cashierOpen ? (
        <ArkjetCashier
          balance={game.balance}
          minimumAmount={game.risk?.minimumBet ?? "0.10"}
          initialAmount={cashierInitialAmount}
          productName="Chicken Cross"
          onClose={() => setCashierOpen(false)}
          onOpenFunds={() => {
            setCashierOpen(false);
            modals.openFunds();
          }}
        />
      ) : null}
      <GameHowToPlay
        accent="chicken"
        open={howToPlayOpen}
        title="How to play Chicken Cross"
        steps={[
          "Choose a difficulty and ticket amount, then submit to start the crossing.",
          "Press Next to cross one lane. Every safe lane increases your possible payout.",
          "Cash out after a safe lane. If the chicken is hit before cashout, the ticket loses.",
        ]}
        onClose={() => setHowToPlayOpen(false)}
      />
      <AppModalHost
        active={modals.modal}
        onClose={modals.close}
        onConfirmed={modals.showDone}
        onOpenFunds={modals.openFunds}
      />
    </main>
  );
}
