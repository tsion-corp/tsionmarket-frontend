import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";

const gate = vi.hoisted(() => ({ signedIn: false, asked: [] as string[] }));
vi.mock("@/hooks/use-require-session", () => ({
  useRequireSession: () => (action: string) => {
    if (gate.signedIn) return true;
    gate.asked.push(action);
    return false;
  },
}));
vi.mock("@/hooks/use-signed-in", () => ({ useSignedIn: () => (gate.signedIn ? "yes" : "no") }));
vi.mock("@/hooks/use-sign-in", () => ({ openSignIn: vi.fn() }));
const wallet = vi.hoisted(() => ({ evmAddress: null as string | null }));
vi.mock("@/hooks/use-auth-session", () => ({ useAuthSession: () => wallet }));
vi.mock("@/lib/bns/wallet", () => ({
  readArkWalletBalances: vi.fn(async () => ({ usdcAtomic: "0", ethWei: "0" })),
}));
const addFunds = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-funds-modal", () => ({ useAddFunds: () => addFunds }));
vi.mock("@/hooks/use-evm-send", () => ({ useEvmSend: () => vi.fn() }));
vi.mock("@/hooks/use-withdraw", () => ({ useSendUsdc: () => ({ sendUsdc: vi.fn() }) }));
vi.mock("@/hooks/use-prices", () => ({ usePrices: () => ({ ETH: 3000 }) }));
vi.mock("@/lib/bns/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bns/api")>()),
  getArkLabelAvailability: vi.fn(async () => ({ available: true })),
  getArkLabelPrice: vi.fn(async () => ({ total: "1000000000000000" })),
}));

import { ArkIdView } from "@/features/bns/components/ark-id-view";

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <ArkIdView />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

describe("ArkIdView signed out", () => {
  beforeEach(() => {
    gate.signedIn = false;
    gate.asked = [];
    wallet.evmAddress = null;
  });

  it("lets the visitor press Reserve and asks them to sign in", async () => {
    renderView();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "visitorname" } });
    const reserve = await screen.findByRole("button", { name: messages.bns.reserveCta });
    await waitFor(() => expect(reserve).toBeEnabled());
    fireEvent.click(reserve);
    expect(gate.asked).toEqual(["buy"]);
    expect(screen.queryByText(messages.bns.walletNeeded)).toBeNull();
  });
});

describe("ArkIdView short on USDC", () => {
  it("offers Add funds beside the shortfall", async () => {
    gate.signedIn = true;
    wallet.evmAddress = "0x1111111111111111111111111111111111111111";
    renderView();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "visitorname" } });
    fireEvent.click(await screen.findByRole("button", { name: messages.balance.addFunds }));
    expect(addFunds).toHaveBeenCalledTimes(1);
  });
});
