import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import type { KashLedgerEntry } from "@/features/portfolio/lib/kash";

const kashHooks = vi.hoisted(() => ({ useKashLedger: vi.fn() }));
vi.mock("@/features/portfolio/hooks/use-kash", () => kashHooks);

import { KashHistoryModal } from "@/features/portfolio/components/kash-history-modal";

// The modal reads copy through next-intl and (indirectly) sits under a React
// Query tree, so the wrapper provides both, mirroring lobby-section.test.tsx.
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </NextIntlClientProvider>
  );
}

const entry = (over: Partial<KashLedgerEntry> = {}): KashLedgerEntry => ({
  id: "1",
  wallet: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  deltaKash: "30",
  kind: "purchase",
  createdAt: "2026-08-14T00:00:00.000Z",
  ...over,
});

describe("KashHistoryModal — rendering ledger entry kinds, including the new transfer kinds", () => {
  it("still renders an existing kind (purchase) correctly — a regression guard for the shared lookup tables", () => {
    kashHooks.useKashLedger.mockReturnValue({
      data: [entry({ kind: "purchase", deltaKash: "500" })],
      isPending: false,
      isError: false,
    });
    render(<KashHistoryModal open onClose={() => {}} />, { wrapper });
    expect(screen.getByText("Purchase")).toBeInTheDocument();
    expect(screen.getByText("+500 KASH")).toBeInTheDocument();
  });

  it("renders a transfer-in entry as Received, with the counterparty and a positive amount", () => {
    kashHooks.useKashLedger.mockReturnValue({
      data: [
        entry({
          kind: "transfer-in",
          deltaKash: "30",
          counterparty: "0x1234567890123456789012345678901234567890",
        }),
      ],
      isPending: false,
      isError: false,
    });
    render(<KashHistoryModal open onClose={() => {}} />, { wrapper });
    expect(screen.getByText("Received")).toBeInTheDocument();
    expect(screen.getByText("from 0x1234…7890")).toBeInTheDocument();
    expect(screen.getByText("+30 KASH")).toBeInTheDocument();
  });

  it("renders a transfer-out entry as Sent, with the counterparty and a negative amount", () => {
    kashHooks.useKashLedger.mockReturnValue({
      data: [
        entry({
          kind: "transfer-out",
          deltaKash: "-30",
          counterparty: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        }),
      ],
      isPending: false,
      isError: false,
    });
    render(<KashHistoryModal open onClose={() => {}} />, { wrapper });
    expect(screen.getByText("Sent")).toBeInTheDocument();
    expect(screen.getByText("to 0xabcd…abcd")).toBeInTheDocument();
    expect(screen.getByText("-30 KASH")).toBeInTheDocument();
  });

  it("links a transfer's tx hash to Basescan, same as any other on-chain row", () => {
    const txHash = `0x${"a".repeat(64)}`;
    kashHooks.useKashLedger.mockReturnValue({
      data: [
        entry({
          kind: "transfer-in",
          ref: txHash,
          counterparty: "0x1234567890123456789012345678901234567890",
        }),
      ],
      isPending: false,
      isError: false,
    });
    render(<KashHistoryModal open onClose={() => {}} />, { wrapper });
    const link = screen.getByRole("link", { name: "tx" });
    expect(link).toHaveAttribute("href", `https://basescan.org/tx/${txHash}`);
  });
});
