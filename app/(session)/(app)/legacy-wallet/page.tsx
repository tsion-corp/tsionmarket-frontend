import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegacyWalletPage } from "@/features/wallet-upgrade/components/legacy-wallet-page";
import { readUpgradeEnv, walletUpgradeConfig } from "@/lib/wallet-upgrade/environment";

export const metadata: Metadata = { title: "Legacy wallet", robots: { index: false } };

// Hidden (404) wherever the wallet upgrade is not switched on.
export default function Page() {
  const config = walletUpgradeConfig(readUpgradeEnv());
  if (!config.enabled) notFound();
  return <LegacyWalletPage config={config} />;
}
