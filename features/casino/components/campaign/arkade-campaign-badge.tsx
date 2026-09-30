"use client";

import { useState } from "react";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useArkadeCampaign } from "@/features/casino/hooks/use-arkade-campaign";
import { ArkadeCampaignModal } from "./arkade-campaign-modal";
import { completedMissions, formatCompactCountdown, useCampaignClock } from "./campaign-clock";
import { GiftIcon } from "./gift-icon";
import styles from "./arkade-campaign.module.css";

interface ArkadeCampaignBadgeProps {
  className?: string;
  enabled?: boolean;
}

// The small trigger in a game's top bar. It reads the session itself: the
// journey is authenticated by the wallet, and the wallet keys the cache the
// portfolio and Arkade banners share, so the three are one query.
export function ArkadeCampaignBadge({ className, enabled = true }: ArkadeCampaignBadgeProps) {
  const { ready, authenticated, evmAddress } = useAuthSession();
  const wallet = enabled && ready && authenticated && evmAddress ? evmAddress : null;
  const campaign = useArkadeCampaign(wallet !== null, wallet);
  const [open, setOpen] = useState(false);
  const journey = campaign.data;
  const seconds = useCampaignClock(journey);

  if (!wallet || !journey || journey.campaign.status === "cancelled") return null;

  const completed = completedMissions(journey);
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
      <ArkadeCampaignModal
        open={open}
        onClose={() => setOpen(false)}
        journey={journey}
        seconds={seconds}
      />
    </div>
  );
}
