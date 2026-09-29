"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { useArkadeCampaign } from "@/features/casino/hooks/use-arkade-campaign";
import type {
  ArkadeCampaignJourney,
  ArkadeMultiplierProgress,
} from "@/features/casino/lib/api/arkjet";
import styles from "./arkade-campaign.module.css";

interface ArkadeCampaignBadgeProps {
  className?: string;
  enabled?: boolean;
  playerId?: string | null;
}

interface MissionProps {
  mark: string;
  name: string;
  href: string;
  complete: boolean;
  title: string;
  condition: string;
  progress: string;
  onNavigate: () => void;
}

function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${remainder}s`;
  return `${minutes}m ${remainder}s`;
}

function formatCompactCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.max(1, Math.floor(seconds / 60));
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

function useCampaignClock(journey?: ArkadeCampaignJourney): number {
  const target = journey
    ? journey.campaign.status === "upcoming"
      ? journey.campaign.startsAt
      : journey.campaign.endsAt
    : null;
  const [seconds, setSeconds] = useState(() =>
    target ? Math.max(0, Math.ceil((new Date(target).getTime() - Date.now()) / 1_000)) : 0
  );

  useEffect(() => {
    if (!target) return;
    const update = () =>
      setSeconds(Math.max(0, Math.ceil((new Date(target).getTime() - Date.now()) / 1_000)));
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [target]);

  return seconds;
}

function multiplierProgress(progress: ArkadeMultiplierProgress): string {
  return progress.completed ? "Completed" : `Best: ${progress.bestMultiplier}x`;
}

function GiftIcon({ complete = false }: { complete?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {complete ? (
        <path d="m6.8 12.2 3.2 3.2 7.2-7.3" />
      ) : (
        <>
          <path d="M4 10h16v10H4zM3 7h18v4H3zM12 7v13" />
          <path d="M12 7H8.7C6.9 7 6 6.2 6 5.1 6 4 6.9 3.3 8 3.3c1.8 0 3.2 1.7 4 3.7Zm0 0h3.3C17.1 7 18 6.2 18 5.1c0-1.1-.9-1.8-2-1.8-1.8 0-3.2 1.7-4 3.7Z" />
        </>
      )}
    </svg>
  );
}

function PrizeArt() {
  return (
    <div className={styles.prizeArt} aria-hidden="true">
      <span className={styles.prizeHalo} />
      <span className={styles.prizeBox}>
        <GiftIcon />
      </span>
      <span className={styles.prizeTag}>$50</span>
    </div>
  );
}

function Mission({
  mark,
  name,
  href,
  complete,
  title,
  condition,
  progress,
  onNavigate,
}: MissionProps) {
  return (
    <Link href={href} className={styles.mission} onClick={onNavigate}>
      <span className={`${styles.missionMark} ${complete ? styles.missionMarkComplete : ""}`}>
        {complete ? "✓" : mark}
      </span>
      <span className={styles.missionContent}>
        <span className={styles.missionTitleRow}>
          <strong>{name}</strong>
          <small className={complete ? styles.completeText : ""}>{progress}</small>
        </span>
        <span className={styles.missionRule}>{title}</span>
        <span className={styles.condition}>
          <i aria-hidden />
          {condition}
        </span>
      </span>
      <span className={styles.chevron} aria-hidden>
        ›
      </span>
    </Link>
  );
}

function CampaignPanel({
  journey,
  seconds,
  onClose,
}: {
  journey: ArkadeCampaignJourney;
  seconds: number;
  onClose: () => void;
}) {
  const { campaign, progress } = journey;
  const completed = [
    progress.arkjet.completed,
    progress.chickenCross.completed,
    progress.spinDaBottle.completed,
  ].filter(Boolean).length;
  const active = campaign.status === "active";
  const upcoming = campaign.status === "upcoming";
  const finished = campaign.status === "drawn" || campaign.status === "closed";
  const countdown = upcoming
    ? `Starts in ${formatCountdown(seconds)}`
    : active
      ? `Ends in ${formatCountdown(seconds)}`
      : "Campaign ended";

  return (
    <div className={styles.modalBody}>
      <header className={styles.modalHeader}>
        <PrizeArt />
        <h2>{campaign.displayName}</h2>
      </header>
      <div className={styles.endsIn}>{countdown}</div>

      <div className={styles.scrollArea}>
        <section className={`${styles.tier} ${progress.qualified ? styles.tierComplete : ""}`}>
          <span className={styles.brandWatermark}>A</span>
          <div className={styles.tierContent}>
            <div className={styles.tierTop}>
              <span className={styles.prizeBadge}>
                <strong>{Number(campaign.prize).toFixed(0)}</strong>
                <small>{campaign.currency} PRIZE</small>
              </span>
              <span className={styles.missionTag}>
                {progress.qualified ? "ENTRY SECURED" : "WEEKLY MISSION"}
              </span>
            </div>

            <div className={styles.steps} aria-label={`${completed} of 3 missions complete`}>
              {[
                ["J", "Arkjet", progress.arkjet.completed],
                ["C", "Chicken", progress.chickenCross.completed],
                ["S", "Spin", progress.spinDaBottle.completed],
              ].map(([mark, label, complete], index) => (
                <div className={styles.stepGroup} key={String(label)}>
                  {index > 0 ? (
                    <span
                      className={`${styles.connector} ${complete ? styles.connectorComplete : ""}`}
                    />
                  ) : null}
                  <span className={styles.step}>
                    <span
                      className={`${styles.stepIcon} ${complete ? styles.stepIconComplete : ""}`}
                    >
                      {complete ? "✓" : mark}
                    </span>
                    <small>{label}</small>
                  </span>
                </div>
              ))}
            </div>

            <div className={styles.criteriaHeading}>
              <strong>Complete all 3 missions</strong>
              <span>{completed}/3</span>
            </div>
            <div className={styles.progressTrack} aria-hidden>
              <span style={{ width: `${(completed / 3) * 100}%` }} />
            </div>
            <p className={styles.criteriaSubheading}>
              Finish every mission within 7 days for one draw entry.
            </p>

            <div className={styles.missions}>
              <Mission
                mark="J"
                name="Arkjet"
                href="/casino/arkjet"
                complete={progress.arkjet.completed}
                title={`Cash out at ${campaign.targetMultiplier}x or higher`}
                condition={`Minimum stake: ${campaign.minimumStake} ${campaign.currency}`}
                progress={multiplierProgress(progress.arkjet)}
                onNavigate={onClose}
              />
              <Mission
                mark="C"
                name="Chicken Cross"
                href="/casino/chicken"
                complete={progress.chickenCross.completed}
                title={`Cash out at ${campaign.targetMultiplier}x or higher`}
                condition={`Minimum stake: ${campaign.minimumStake} ${campaign.currency}`}
                progress={multiplierProgress(progress.chickenCross)}
                onNavigate={onClose}
              />
              <Mission
                mark="S"
                name="Spin da' Bottle"
                href="/casino/spin-da-bottle"
                complete={progress.spinDaBottle.completed}
                title={`Win ${campaign.spinStreakTarget} qualifying bets in a row`}
                condition={`Minimum stake each bet: ${campaign.minimumStake} ${campaign.currency}`}
                progress={
                  progress.spinDaBottle.completed
                    ? "Completed"
                    : `${progress.spinDaBottle.currentStreak}/${progress.spinDaBottle.targetStreak} · Best ${progress.spinDaBottle.bestStreak}`
                }
                onNavigate={onClose}
              />
            </div>
          </div>
        </section>

        <div
          className={`${styles.entryState} ${progress.qualified ? styles.entryStateQualified : ""}`}
        >
          <span className={styles.entryIcon}>
            <GiftIcon complete={progress.qualified} />
          </span>
          <span>
            <strong>
              {progress.isWinner
                ? `You won ${campaign.prize} ${campaign.currency}`
                : progress.qualified
                  ? finished
                    ? "Your entry was included in the draw"
                    : "Your draw entry is secured"
                  : `${3 - completed} mission${3 - completed === 1 ? "" : "s"} left to unlock your entry`}
            </strong>
            <small>One entry per eligible player. Winner receives {campaign.prize} USDC.</small>
          </span>
        </div>

        <details className={styles.fairDraw}>
          <summary>Fair draw details</summary>
          <code>{campaign.drawSeedCommitment}</code>
        </details>
      </div>
    </div>
  );
}

function ConnectedCampaignBadge({
  className,
  playerId,
}: Pick<ArkadeCampaignBadgeProps, "className"> & { playerId: string }) {
  const campaign = useArkadeCampaign(true, playerId);
  const [open, setOpen] = useState(false);
  const journey = campaign.data;
  const seconds = useCampaignClock(journey);

  if (!journey || journey.campaign.status === "cancelled") return null;

  const completed = [
    journey.progress.arkjet.completed,
    journey.progress.chickenCross.completed,
    journey.progress.spinDaBottle.completed,
  ].filter(Boolean).length;
  const complete = journey.progress.qualified;
  const progressPercent = complete ? 100 : (completed / 3) * 100;
  const timeLabel =
    journey.campaign.status === "upcoming"
      ? `Starts in ${formatCompactCountdown(seconds)}`
      : ["ended", "drawn", "closed"].includes(journey.campaign.status)
        ? "Campaign ended"
        : `Ends in ${formatCompactCountdown(seconds)}`;

  return (
    <div className={`${styles.root} ${className ?? ""}`}>
      <button
        type="button"
        className={`${styles.badge} ${complete ? styles.badgeQualified : ""}`}
        onClick={() => setOpen(true)}
        aria-label={`Open Arkade campaign: ${complete ? "entry secured" : `${completed} of 3 missions complete`}, ${journey.campaign.prize} ${journey.campaign.currency} prize`}
      >
        <span className={styles.badgeProgress}>
          <span className={styles.badgeProgressFill} style={{ width: `${progressPercent}%` }} />
          <span className={styles.badgeLabel}>{complete ? "Entry secured" : timeLabel}</span>
        </span>
        <span className={styles.badgeGift}>
          <GiftIcon complete={complete} />
          {!complete ? <small>{completed}/3</small> : null}
        </span>
      </button>
      <ModalShell
        open={open}
        onClose={() => setOpen(false)}
        panelClassName={styles.panel}
        contentClassName={styles.panelContent}
        closeButtonClassName={styles.shellClose}
      >
        <CampaignPanel journey={journey} seconds={seconds} onClose={() => setOpen(false)} />
      </ModalShell>
    </div>
  );
}

export function ArkadeCampaignBadge({
  className,
  enabled = true,
  playerId = null,
}: ArkadeCampaignBadgeProps) {
  if (!enabled || !playerId) return null;
  return <ConnectedCampaignBadge className={className} playerId={playerId} />;
}
