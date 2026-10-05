"use client";

import dynamic from "next/dynamic";
import { useFundsModalOpen } from "@/hooks/use-funds-modal";

// Loaded on first open so it stays out of every page's first load.
const FundsModal = dynamic(
  () => import("@/components/layout/funds-modal").then((m) => m.FundsModal),
  { ssr: false }
);

export function FundsModalHost() {
  return useFundsModalOpen() ? <FundsModal /> : null;
}
