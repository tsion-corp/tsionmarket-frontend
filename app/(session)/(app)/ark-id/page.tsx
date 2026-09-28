import type { Metadata } from "next";
import { ArkIdView } from "@/features/bns/components/ark-id-view";

// Ark ID is a route, not a sheet, for the reason invites became /referrals: it
// is a purchase people come back to, its commit-and-reveal flow has to survive
// a reload mid-payment, and a name is worth linking to.
export const metadata: Metadata = { title: "Ark ID" };

export default function ArkIdPage() {
  return <ArkIdView />;
}
