"use client";

import Link from "next/link";
import { useState } from "react";
import type { ArkjetFairnessRules, ArkjetRound } from "@/features/casino/lib/api/arkjet";
import { useArkjet } from "@/features/casino/hooks/use-arkjet";
import { usePortfolio } from "@/hooks/use-portfolio";
import { ArkjetBetCard } from "./arkjet-bet-card";
import { ArkjetCashier } from "./arkjet-cashier";
import { ArkjetChatRail } from "./arkjet-chat-rail";
import { ArkjetMultiplierBar, ArkjetStage } from "./arkjet-stage";
import styles from "./arkjet.module.css";

type RailTab = "all" | "previous" | "top";

function orderedRounds(rounds: ArkjetRound[], tab: RailTab): ArkjetRound[] {
  const completed = rounds.filter((round) => round.crashMultiplier);
  if (tab === "top") {
    return [...completed].sort(
      (left, right) => Number(right.crashMultiplier) - Number(left.crashMultiplier)
    );
  }
  return completed;
}

function displayVersion(version: string): string {
  const match = version.match(/^arkjet-(v\d+)$/iu);
  return match ? `Arkjet ${match[1].toLowerCase()}` : version;
}

function displayMoney(value: string, currency: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${value} ${currency}`;
  return `${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

function LeftRail({
  rounds,
  algorithmVersion,
}: {
  rounds: ArkjetRound[];
  algorithmVersion: string;
}) {
  const [tab, setTab] = useState<RailTab>("all");
  const shown = orderedRounds(rounds, tab).slice(0, 20);

  return (
    <aside className={`${styles.panel} ${styles.leftRail}`}>
      <div className={styles.tabs}>
        {(["all", "previous", "top"] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={`${styles.tab} ${tab === item ? styles.tabActive : ""}`}
            onClick={() => setTab(item)}
          >
            {item === "all" ? "All Bets" : item === "previous" ? "Previous" : "Top"}
          </button>
        ))}
      </div>
      <div className={styles.railSummary}>
        <div className={styles.summaryTop}>
          <div className={styles.avatarStack}>
            <span className={styles.avatar}>A</span>
            <span className={styles.avatar}>R</span>
            <span className={styles.avatar}>K</span>
          </div>
          <strong className={styles.summaryValue}>{shown.length}</strong>
        </div>
        <div className={styles.summaryMeta}>
          <span>{shown.length} verified rounds</span>
          <span>Live feed</span>
        </div>
      </div>
      <div className={styles.railColumns}>
        <span>Round</span>
        <span>Result</span>
        <span>Proof</span>
      </div>
      <div className={styles.railRows}>
        {shown.map((round) => {
          const multiplier = Number(round.crashMultiplier);
          return (
            <div
              key={round.roundId}
              className={`${styles.railRow} ${multiplier >= 2 ? styles.railRowWon : ""}`}
            >
              <div className={styles.roundIdentity}>
                <span className={styles.roundDot}>{String(round.sequence).slice(-2)}</span>
                <span className={styles.roundLabel}>Round #{round.sequence}</span>
              </div>
              <strong className={multiplier >= 2 ? styles.multiplierHigh : styles.multiplierLow}>
                {multiplier.toFixed(2)}x
              </strong>
              <span>{round.serverSeedCommitment.slice(0, 4)}</span>
            </div>
          );
        })}
        {shown.length === 0 ? (
          <div className={styles.railRow}>No completed rounds currently</div>
        ) : null}
      </div>
      <div className={styles.railFooter}>
        <span className={styles.fairBadge}>⬡ Provably Fair Game</span>
        <span>{displayVersion(algorithmVersion)}</span>
      </div>
    </aside>
  );
}

function Toggle({ enabled }: { enabled: boolean }) {
  return (
    <span className={styles.toggle}>
      <span className={`${styles.toggleKnob} ${enabled ? styles.toggleOn : ""}`} />
    </span>
  );
}

function SettingsMenu({
  sound,
  animation,
  onSound,
  onAnimation,
  onFairness,
}: {
  sound: boolean;
  animation: boolean;
  onSound: () => void;
  onAnimation: () => void;
  onFairness: () => void;
}) {
  return (
    <div className={styles.menu}>
      <div className={styles.menuProfile}>
        <div className={styles.brandWrap}>
          <span className={styles.avatar}>A</span>
          <strong>Arkjet player</strong>
        </div>
        <span className={styles.balance}>Settings</span>
      </div>
      <button type="button" className={styles.menuRow} onClick={onSound}>
        <span>◖ Sound</span>
        <Toggle enabled={sound} />
      </button>
      <button type="button" className={styles.menuRow} onClick={onAnimation}>
        <span>⌁ Animation</span>
        <Toggle enabled={animation} />
      </button>
      <button type="button" className={styles.menuRow}>
        <span>☆ Free Bets</span>
      </button>
      <button type="button" className={styles.menuRow}>
        <span>↶ My Bet History</span>
      </button>
      <button type="button" className={styles.menuRow}>
        <span>▣ Game Limits</span>
      </button>
      <button type="button" className={styles.menuRow}>
        <span>? How To Play</span>
      </button>
      <button type="button" className={styles.menuRow}>
        <span>▤ Game Rules</span>
      </button>
      <button type="button" className={styles.menuRow} onClick={onFairness}>
        <span>⬡ Provably Fair Settings</span>
      </button>
    </div>
  );
}

function FairnessDialog({
  current,
  rules,
  onClose,
}: {
  current: ArkjetRound;
  rules: ArkjetFairnessRules | null;
  onClose: () => void;
}) {
  return (
    <div
      className={styles.fairOverlay}
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className={styles.fairDialog} role="dialog" aria-modal="true">
        <div className={styles.summaryTop}>
          <div>
            <div className={styles.messageMeta}>ARKJET INTEGRITY</div>
            <h2 className={styles.fairTitle}>Provably Fair Settings</h2>
          </div>
          <button type="button" className={styles.iconButton} onClick={onClose}>
            ×
          </button>
        </div>
        <div className={styles.commitment}>{current.serverSeedCommitment}</div>
        <div className={styles.fairStats}>
          <div className={styles.fairStat}>
            Algorithm<strong>{rules?.algorithmVersion ?? current.algorithmVersion}</strong>
          </div>
          <div className={styles.fairStat}>
            Published RTP<strong>{rules?.rtpPercent ?? "76.00"}%</strong>
          </div>
          <div className={styles.fairStat}>
            Hash<strong>{rules?.result.hashAlgorithm ?? "SHA-256"}</strong>
          </div>
          <div className={styles.fairStat}>
            Risk model
            <strong>{rules?.liquidityModelVersion ?? "Not published"}</strong>
          </div>
        </div>
      </section>
    </div>
  );
}

export function ArkjetSection() {
  const arkjet = useArkjet();
  const portfolio = usePortfolio();
  const [menuOpen, setMenuOpen] = useState(false);
  const [fairnessOpen, setFairnessOpen] = useState(false);
  const [cashierOpen, setCashierOpen] = useState(false);
  const [sound, setSound] = useState(true);
  const [animation, setAnimation] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);

  if (arkjet.loading) {
    return <main className={`${styles.page} ${styles.unavailable}`}>Loading Arkjet…</main>;
  }

  if (arkjet.error || !arkjet.current) {
    return (
      <main className={`${styles.page} ${styles.unavailable}`}>
        <div>
          <h1 className={styles.fairTitle}>Arkjet is between flights</h1>
          <p className={styles.summaryMeta}>No bet was accepted and no balance was charged.</p>
          <button type="button" className={styles.menuRow} onClick={() => void arkjet.refresh()}>
            Try again
          </button>
        </div>
      </main>
    );
  }

  const wageringEnabled = arkjet.capabilities?.wageringEnabled === true;
  const settlementEnabled = arkjet.capabilities?.settlementEnabled === true;
  const currency = arkjet.balance?.currency ?? arkjet.riskRules?.currency ?? "NGN";
  const minimumBet = arkjet.riskRules?.minimumBet ?? "10.00";
  const minimumCashout = arkjet.riskRules?.minimumCashoutMultiplier ?? "1.10";
  const maximumCashout = arkjet.riskRules?.maximumCashoutMultiplier ?? "100.00";
  const activeBets = arkjet.bets.filter(
    (bet) => bet.roundId === arkjet.current?.roundId && bet.status === "ACCEPTED"
  );
  const panelABet = activeBets.find((bet) => bet.panelId === "A") ?? null;
  const panelBBet = activeBets.find((bet) => bet.panelId === "B") ?? null;
  const walletUsdc =
    portfolio.tokens.find(
      (token) => token.network === "base-mainnet" && token.symbol.toUpperCase() === "USDC"
    )?.balance ?? 0;
  const balance = !arkjet.authReady
    ? "Checking account…"
    : arkjet.authenticated
      ? arkjet.balance
        ? displayMoney(arkjet.balance.available, arkjet.balance.currency)
        : "Balance unavailable"
      : "Sign in";

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brandWrap}>
          <Link href="/casino" className={styles.backButton} aria-label="Back to Arkade">
            ‹
          </Link>
          <span className={styles.brandMark}>A</span>
          <span className={styles.brandName}>Arkjet</span>
        </div>
        <div className={styles.topActions}>
          <button
            type="button"
            className={styles.balanceButton}
            onClick={() => {
              if (arkjet.authenticated) setCashierOpen(true);
              else arkjet.login();
            }}
          >
            <span className={styles.balance}>{balance}</span>
            {arkjet.authenticated ? (
              <small>
                {walletUsdc.toLocaleString(undefined, { maximumFractionDigits: 4 })} USDC wallet
              </small>
            ) : null}
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={chatOpen ? "Close chat" : "Open chat"}
            aria-expanded={chatOpen}
            onClick={() => setChatOpen((open) => !open)}
          >
            ◉
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Open Arkjet settings"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            ≡
          </button>
        </div>
        {menuOpen ? (
          <SettingsMenu
            sound={sound}
            animation={animation}
            onSound={() => setSound((enabled) => !enabled)}
            onAnimation={() => setAnimation((enabled) => !enabled)}
            onFairness={() => {
              setMenuOpen(false);
              setFairnessOpen(true);
            }}
          />
        ) : null}
      </header>

      <div className={`${styles.layout} ${chatOpen ? "" : styles.layoutChatClosed}`}>
        <LeftRail rounds={arkjet.history} algorithmVersion={arkjet.current.algorithmVersion} />
        <section className={styles.center}>
          <ArkjetMultiplierBar rounds={arkjet.history} />
          <ArkjetStage round={arkjet.current} animationEnabled={animation} soundEnabled={sound} />
          <div className={styles.controlsGrid}>
            <ArkjetBetCard
              slot={1}
              round={arkjet.current}
              currency={currency}
              minimumAmount={minimumBet}
              minimumCashoutMultiplier={minimumCashout}
              maximumCashoutMultiplier={maximumCashout}
              activeBet={panelABet}
              wageringEnabled={wageringEnabled}
              settlementEnabled={settlementEnabled}
              authenticated={arkjet.authenticated}
              authReady={arkjet.authReady}
              busy={arkjet.wagerPending}
              onLogin={arkjet.login}
              onPlace={arkjet.placeBet}
              onCancel={arkjet.cancelBet}
              onCashout={arkjet.cashoutBet}
            />
            <ArkjetBetCard
              slot={2}
              round={arkjet.current}
              currency={currency}
              minimumAmount={minimumBet}
              minimumCashoutMultiplier={minimumCashout}
              maximumCashoutMultiplier={maximumCashout}
              activeBet={panelBBet}
              wageringEnabled={wageringEnabled}
              settlementEnabled={settlementEnabled}
              authenticated={arkjet.authenticated}
              authReady={arkjet.authReady}
              busy={arkjet.wagerPending}
              onLogin={arkjet.login}
              onPlace={arkjet.placeBet}
              onCancel={arkjet.cancelBet}
              onCashout={arkjet.cashoutBet}
            />
          </div>
          {!wageringEnabled ? (
            <div className={styles.wagerNotice}>
              Live rounds and proofs are active. Bet placement remains locked until Arkjet wagering
              and settlement are enabled.
            </div>
          ) : null}
        </section>
        {chatOpen ? <ArkjetChatRail onClose={() => setChatOpen(false)} /> : null}
      </div>

      {fairnessOpen ? (
        <FairnessDialog
          current={arkjet.current}
          rules={arkjet.rules}
          onClose={() => setFairnessOpen(false)}
        />
      ) : null}
      {cashierOpen ? (
        <ArkjetCashier
          balance={arkjet.balance}
          minimumAmount={minimumBet}
          onClose={() => setCashierOpen(false)}
        />
      ) : null}
    </main>
  );
}
