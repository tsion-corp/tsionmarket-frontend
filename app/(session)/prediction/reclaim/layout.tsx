import { LegacyPrivyProvider } from "@/components/providers/legacy-privy-provider";

// Reclaim pays out winnings owed to the OLD (superseded) prediction contract,
// which only the old Privy wallets can claim, so this route keeps the legacy
// provider that the rest of the app no longer mounts.
export default function ReclaimLayout({ children }: { children: React.ReactNode }) {
  return <LegacyPrivyProvider>{children}</LegacyPrivyProvider>;
}
