"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useArkadeCampaign } from "@/features/casino/hooks/use-arkade-campaign";
import { ArkadeCampaignModal } from "./arkade-campaign-modal";
import { completedMissions, formatBannerCountdown, useCampaignClock } from "./campaign-clock";
import { GiftIcon } from "./gift-icon";
import styles from "./arkade-campaign-banner.module.css";

interface ArkadeCampaignBannerProps {
  className?: string;
}

// The campaign's front door, on the portfolio page and at the top of Arkade.
// One button: the whole ticket opens the modal the in-game badge opens, from
// the same cache. Nothing renders without a session or a campaign, so a page
// without one is unchanged.
export function ArkadeCampaignBanner({ className }: ArkadeCampaignBannerProps) {
  const t = useTranslations("casino.campaign");
  const { ready, authenticated, evmAddress } = useAuthSession();
  const wallet = ready && authenticated && evmAddress ? evmAddress : null;
  const campaign = useArkadeCampaign(wallet !== null, wallet);
  const [open, setOpen] = useState(false);
  const journey = campaign.data;
  const seconds = useCampaignClock(journey);

  if (!wallet || !journey || journey.campaign.status === "cancelled") return null;

  const { campaign: details, progress } = journey;
  const completed = completedMissions(journey);
  const qualified = progress.qualified;
  const status = details.status;
  const clock =
    status === "upcoming"
      ? t("startsIn", { time: formatBannerCountdown(seconds) })
      : status === "active"
        ? t("endsIn", { time: formatBannerCountdown(seconds) })
        : t("ended");
  const nodes: Array<[string, boolean]> = [
    ["J", progress.arkjet.completed],
    ["C", progress.chickenCross.completed],
    ["S", progress.spinDaBottle.completed],
  ];

  return (
    <>
      <button
        type="button"
        className={`${styles.banner} ${qualified ? styles.qualified : ""} ${className ?? ""}`}
        onClick={() => setOpen(true)}
        aria-label={t("open", { name: details.displayName })}
      >
        <span className={styles.sparkles} aria-hidden />
        <span className={styles.sweep} aria-hidden />
        <span className={styles.watermark} aria-hidden>
          A
        </span>

        <span className={styles.art} aria-hidden>
          <span className={styles.halo} />
          <span className={styles.box}>
            <GiftIcon complete={qualified} />
          </span>
          <span className={styles.tag}>${Number(details.prize).toFixed(0)}</span>
        </span>

        <span className={styles.words}>
          <span className={styles.eyebrow}>{qualified ? t("eyebrowSecured") : t("eyebrow")}</span>
          <span className={styles.title}>{details.displayName}</span>
          <span className={styles.rule}>
            {t("rule", { multiplier: details.targetMultiplier, streak: details.spinStreakTarget })}
          </span>
        </span>

        <span className={styles.track} aria-label={t("progress", { done: completed })}>
          {nodes.map(([mark, complete], index) => (
            <span key={mark} style={{ display: "contents" }}>
              {index > 0 ? <span className={styles.link} data-complete={complete} /> : null}
              <span className={styles.node} data-complete={complete}>
                {complete ? "✓" : mark}
              </span>
            </span>
          ))}
          <span className={styles.link} data-complete={qualified} />
          <span className={styles.reward}>
            <GiftIcon complete={qualified} />
          </span>
          {qualified ? null : <span className={styles.count}>{completed}/3</span>}
        </span>

        <span className={styles.actions}>
          <span className={styles.clock}>
            <i aria-hidden />
            {clock}
          </span>
          <span className={styles.cta}>{qualified ? t("viewEntry") : t("seeMissions")}</span>
        </span>
      </button>
      <ArkadeCampaignModal
        open={open}
        onClose={() => setOpen(false)}
        journey={journey}
        seconds={seconds}
      />
    </>
  );
}
