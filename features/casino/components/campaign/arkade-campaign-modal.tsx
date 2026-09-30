"use client";

import Link from "next/link";
import { ModalShell } from "@/components/ui/modal-shell";
import type {
  ArkadeCampaignJourney,
  ArkadeMultiplierProgress,
} from "@/features/casino/lib/api/arkjet";
import { completedMissions, formatCountdown } from "./campaign-clock";
import { GiftIcon } from "./gift-icon";
import styles from "./arkade-campaign.module.css";

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

function multiplierProgress(progress: ArkadeMultiplierProgress): string {
  return progress.completed ? "Completed" : `Best: ${progress.bestMultiplier}x`;
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

// The campaign in full. One DOM for every width: a sheet on a phone, and from
// md a landscape panel where the hero column (prize, clock, progress, entry)
// stands beside the missions column, so the two can never drift apart.
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
  const completed = completedMissions(journey);
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
        <section
          data-column="hero"
          className={`${styles.tier} ${progress.qualified ? styles.tierComplete : ""}`}
        >
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
          </div>
        </section>

        <section
          data-column="missions"
          className={`${styles.tier} ${styles.missionsTier} ${progress.qualified ? styles.tierComplete : ""}`}
        >
          <div className={styles.tierContent}>
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

            <details className={styles.fairDraw}>
              <summary>Fair draw details</summary>
              <code>{campaign.drawSeedCommitment}</code>
            </details>
          </div>
        </section>
      </div>
    </div>
  );
}

interface ArkadeCampaignModalProps {
  open: boolean;
  onClose: () => void;
  journey: ArkadeCampaignJourney;
  seconds: number;
}

export function ArkadeCampaignModal({ open, onClose, journey, seconds }: ArkadeCampaignModalProps) {
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      size="lg"
      panelClassName={`${styles.panel} ${styles.panelLandscape}`}
      contentClassName={styles.panelContent}
      closeButtonClassName={styles.shellClose}
    >
      <CampaignPanel journey={journey} seconds={seconds} onClose={onClose} />
    </ModalShell>
  );
}
