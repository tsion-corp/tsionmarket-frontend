import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UpgradePage } from "@/features/wallet-upgrade/components/upgrade-page";
import { readUpgradeEnv, walletUpgradeConfig } from "@/features/wallet-upgrade/lib/environment";

export const metadata: Metadata = { title: "Upgrade your wallet", robots: { index: false } };

// Sits in (session) so Decane is mounted beside Clerk. Hidden (404) wherever
// the upgrade is not switched on; shown with the reason where a safety rule
// switched it off, so a misconfigured deployment explains itself.
export default function Page() {
  const config = walletUpgradeConfig(readUpgradeEnv());
  if (!config.enabled && !config.blockedReason) notFound();
  return <UpgradePage config={config} />;
}
