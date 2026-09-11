import { fireEvent, render, screen } from "@testing-library/react";
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

  it("shows a transfer's tx hash, a copy control and a Basescan link", () => {
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
    expect(screen.getByText("0xaaaa…aaaa")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "tx" });
    expect(link).toHaveAttribute("href", `https://basescan.org/tx/${txHash}`);
  });

  it("never shows a tx hash, copy control or Basescan link for a purchase or a claim — those are mints", () => {
    const txHash = `0x${"b".repeat(64)}`;
    kashHooks.useKashLedger.mockReturnValue({
      data: [
        entry({ id: "1", kind: "purchase", deltaKash: "500", txHash }),
        entry({ id: "2", kind: "settlement", deltaKash: "40", txHash }),
      ],
      isPending: false,
      isError: false,
    });
    render(<KashHistoryModal open onClose={() => {}} />, { wrapper });
    expect(screen.queryByText("0xbbbb…bbbb")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "tx" })).not.toBeInTheDocument();
  });
});

describe("KashHistoryModal — transactions vs activity points split", () => {
  const mixed = [
    entry({ id: "1", kind: "purchase", deltaKash: "500" }),
    entry({ id: "2", kind: "transfer-in", deltaKash: "30", counterparty: entry().wallet }),
    entry({ id: "3", kind: "points", deltaKash: "0", points: "275" }),
    entry({ id: "4", kind: "locked-activity", deltaKash: "0" }),
  ];

  it("defaults to the Transactions tab, showing only real KSH movement", () => {
    kashHooks.useKashLedger.mockReturnValue({ data: mixed, isPending: false, isError: false });
    render(<KashHistoryModal open onClose={() => {}} />, { wrapper });

    expect(screen.getByText("Purchase")).toBeInTheDocument();
    expect(screen.getByText("Received")).toBeInTheDocument();
    expect(screen.queryByText("Points earned")).not.toBeInTheDocument();
    expect(screen.queryByText("Arkivity (below gate)")).not.toBeInTheDocument();
  });

  it("says Activity Points is coming rather than listing rows that do not earn yet", () => {
    // The tab is switched off until Kash+ activity earnings go live. It must
    // not draw the points rows the ledger happens to carry, and it must not
    // fall through to the transactions either.
    kashHooks.useKashLedger.mockReturnValue({ data: mixed, isPending: false, isError: false });
    render(<KashHistoryModal open onClose={() => {}} />, { wrapper });

    fireEvent.click(screen.getByRole("tab", { name: "Activity Points" }));

    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(screen.queryByText("Points earned")).not.toBeInTheDocument();
    expect(screen.queryByText("Arkivity (below gate)")).not.toBeInTheDocument();
    expect(screen.queryByText("Purchase")).not.toBeInTheDocument();
    expect(screen.queryByText("Received")).not.toBeInTheDocument();
  });

  it("keeps the transactions tab listing transactions", () => {
    // The guard is on one tab only. Switching away and back must still show
    // the real ledger, which is what proves nothing else was gated with it.
    kashHooks.useKashLedger.mockReturnValue({ data: mixed, isPending: false, isError: false });
    render(<KashHistoryModal open onClose={() => {}} />, { wrapper });

    fireEvent.click(screen.getByRole("tab", { name: "Activity Points" }));
    fireEvent.click(screen.getByRole("tab", { name: "Transactions" }));

    expect(screen.getByText("Purchase")).toBeInTheDocument();
    expect(screen.queryByText("Coming soon")).not.toBeInTheDocument();
  });

  it("shows the transactions-specific empty state when there are only points rows", () => {
    kashHooks.useKashLedger.mockReturnValue({
      data: [entry({ kind: "points", deltaKash: "0", points: "10" })],
      isPending: false,
      isError: false,
    });
    render(<KashHistoryModal open onClose={() => {}} />, { wrapper });

    expect(
      screen.getByText("Nothing here yet. Purchases, rewards and conversions will appear here.")
    ).toBeInTheDocument();
  });

  it("shows the coming-soon panel instead of the points empty state", () => {
    // "No points yet" reads as a balance of zero, which is a claim about the
    // user. The tab is not earning at all yet, so it says that instead.
    kashHooks.useKashLedger.mockReturnValue({
      data: [entry({ kind: "purchase", deltaKash: "500" })],
      isPending: false,
      isError: false,
    });
    render(<KashHistoryModal open onClose={() => {}} />, { wrapper });

    fireEvent.click(screen.getByRole("tab", { name: "Activity Points" }));

    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(screen.queryByText("No points yet.")).not.toBeInTheDocument();
  });
});
