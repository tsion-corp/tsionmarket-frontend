"use client";

import { useEffect, useState } from "react";
import type { ArkadeCampaignJourney } from "@/features/casino/lib/api/arkjet";

export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${remainder}s`;
  return `${minutes}m ${remainder}s`;
}

export function formatCompactCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.max(1, Math.floor(seconds / 60));
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

// Days and hours, for a banner that must not reflow every second.
export function formatBannerCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

// Seconds to the campaign's next edge: its start while upcoming, its end
// once active. Every surface counts from here so they never disagree.
export function useCampaignClock(journey?: ArkadeCampaignJourney): number {
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

export function completedMissions(journey: ArkadeCampaignJourney): number {
  return [
    journey.progress.arkjet.completed,
    journey.progress.chickenCross.completed,
    journey.progress.spinDaBottle.completed,
  ].filter(Boolean).length;
}
