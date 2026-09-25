import { LegacyPrivyProvider } from "@/components/providers/legacy-privy-provider";

// TEMPORARY — scratch route for trying Privy's wallet export. Delete the whole
// app/(session)/legacy-export/ folder when you are done looking at it.
//
// It needs its own provider for the same reason /prediction/reclaim does: the
// app runs on Decane now, so Privy is only mounted on the surfaces that still
// touch the OLD embedded wallets. usePrivy throws outside this tree.
export default function LegacyExportLayout({ children }: { children: React.ReactNode }) {
  return <LegacyPrivyProvider>{children}</LegacyPrivyProvider>;
}
