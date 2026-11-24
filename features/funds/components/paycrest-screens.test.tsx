import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { SETTLE_CHAINS } from "@/lib/deposit";

// Wiring tests for both Paycrest screens through the real hooks and a real
// query client. Only the HTTP layer (apiFetch), the wallet send and the
// session are faked, so these cover what the screens send to /api/paycrest
// and what they do with each answer.

const WALLET = "0x1111111111111111111111111111111111111111";
const RECEIVE = "0x2222222222222222222222222222222222222222";

const apiFetch = vi.hoisted(() => vi.fn());
const sendToken = vi.hoisted(() => vi.fn());
const portfolio = vi.hoisted(() => ({ rawBalance: "100000000" }));

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({ authenticated: true, evmAddress: WALLET, solanaAddress: null }),
}));
vi.mock("@/hooks/use-portfolio", () => ({
  usePortfolio: () => ({
    tokens: [
      {
        network: SETTLE_CHAINS.base.alchemyNetwork,
        symbol: "USDC",
        rawBalance: portfolio.rawBalance,
        decimals: 6,
        balance: Number(portfolio.rawBalance) / 1e6,
      },
    ],
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-withdraw", () => ({ useSendToken: () => ({ sendToken }) }));
vi.mock("@/components/ui/modal-shell", () => ({ useModalScreen: () => undefined }));
// The calendar popover is exercised in its own tests; here it is just a value.
vi.mock("@/features/funds/components/kyc/date-field", () => ({
  DateField: ({
    label,
    value,
    onChange,
    error,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    error: string | null;
  }) => (
    <label>
      {label}
      <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
      {error ? <span>{error}</span> : null}
    </label>
  ),
}));

import { PaycrestWithdrawScreen } from "./paycrest-withdraw-screen";
import { PaycrestDepositScreen } from "./paycrest-deposit-screen";

function ok(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), { status: 200 });
}

const offrampOrder = {
  id: "off-1",
  status: "initiated",
  direction: "offramp",
  amount: "25",
  rate: "1441.2",
  txHash: null,
  paymentReference: null,
  deposit: {
    kind: "crypto",
    network: "base",
    receiveAddress: RECEIVE,
    amountToTransfer: "25.62",
    currency: "USDC",
    validUntil: "2026-11-24T10:05:00Z",
    memo: null,
  },
};

const onrampOrder = {
  id: "on-1",
  status: "initiated",
  direction: "onramp",
  amount: "34.2",
  rate: "1459.71",
  txHash: null,
  paymentReference: null,
  deposit: {
    kind: "fiat",
    institution: "Guaranty Trust Bank",
    accountIdentifier: "9988776655",
    accountName: "Provider / Ada Obi",
    amountToTransfer: "50000",
    currency: "NGN",
    validUntil: "2026-11-24T10:05:00Z",
  },
};

let orderStatus = "validated";

function routes(path: string, init?: RequestInit) {
  if (path === "/api/paycrest/institutions/NGN") {
    return ok([
      { code: "GTBINGLA", name: "Guaranty Trust Bank", type: "bank" },
      { code: "OPAYNGPC", name: "OPay", type: "mobile_money" },
    ]);
  }
  if (path === "/api/paycrest/verify-account") return ok({ accountName: "ADA OBI" });
  if (path.startsWith("/api/paycrest/rates/USDC/")) {
    return ok({ buy: null, sell: { rate: "1441.2", providerIds: ["YyPrHKaI"] } });
  }
  if (path === "/api/paycrest/orders/offramp") return ok(offrampOrder);
  if (path === "/api/paycrest/orders/onramp") return ok(onrampOrder);
  if (path === "/api/paycrest/orders/off-1") return ok({ ...offrampOrder, status: orderStatus });
  if (path === "/api/paycrest/orders/on-1") return ok({ ...onrampOrder, status: orderStatus });
  throw new Error(`unexpected ${init?.method ?? "GET"} ${path}`);
}

function bodyOf(path: string) {
  const call = apiFetch.mock.calls.find(([p]) => p === path);
  return JSON.parse(String((call![1] as RequestInit).body));
}

function renderWith(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

async function pickVerifiedAccount() {
  fireEvent.click(screen.getByRole("button", { name: /Select bank/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Guaranty Trust Bank" }));
  // Mobile-money institutions are not offered as banks.
  expect(screen.queryByRole("button", { name: "OPay" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Account number"), { target: { value: "0123456789" } });
  await screen.findByText("ADA OBI");
}

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (path: string, init?: RequestInit) => routes(path, init));
  sendToken.mockReset();
  sendToken.mockResolvedValue("0xhash");
  portfolio.rawBalance = "100000000";
  orderStatus = "validated";
});

afterEach(cleanup);

describe("PaycrestWithdrawScreen", () => {
  it("opens an order and sends exactly amountToTransfer to the receive address", async () => {
    renderWith(<PaycrestWithdrawScreen onBack={vi.fn()} />);
    await pickVerifiedAccount();

    fireEvent.change(screen.getByLabelText("Amount (USDC)"), { target: { value: "25" } });
    // 25 USDC at 1441.2 = ₦36,030
    await screen.findByText("You receive about ₦36,030");

    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    await screen.findByText("Paid to your bank");

    expect(bodyOf("/api/paycrest/orders/offramp")).toMatchObject({
      amount: "25",
      token: "USDC",
      currency: "NGN",
      rate: "1441.2",
      providerIds: ["YyPrHKaI"],
      recipient: {
        institution: "GTBINGLA",
        accountIdentifier: "0123456789",
        accountName: "ADA OBI",
      },
    });
    // The browser never names a wallet; the proxy does.
    expect(bodyOf("/api/paycrest/orders/offramp")).not.toHaveProperty("refundAddress");
    expect(sendToken).toHaveBeenCalledWith(
      expect.objectContaining({
        to: RECEIVE,
        amount: 25_620_000n,
        tokenAddress: SETTLE_CHAINS.base.usdc,
      })
    );
  });

  it("sends nothing when the fees take the transfer past the balance", async () => {
    portfolio.rawBalance = "25000000"; // exactly 25 USDC
    renderWith(<PaycrestWithdrawScreen onBack={vi.fn()} />);
    await pickVerifiedAccount();
    fireEvent.change(screen.getByLabelText("Amount (USDC)"), { target: { value: "25" } });
    await screen.findByText("You receive about ₦36,030");
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));

    await screen.findByText(/needs 25.62 USDC/);
    expect(sendToken).not.toHaveBeenCalled();
  });

  it("shows the rail's error and sends nothing when the order cannot be created", async () => {
    apiFetch.mockImplementation(async (path: string, init?: RequestInit) =>
      path === "/api/paycrest/orders/offramp"
        ? new Response(
            JSON.stringify({
              success: false,
              error: { code: "UPSTREAM", message: "Invalid account" },
            }),
            { status: 400 }
          )
        : routes(path, init)
    );
    renderWith(<PaycrestWithdrawScreen onBack={vi.fn()} />);
    await pickVerifiedAccount();
    fireEvent.change(screen.getByLabelText("Amount (USDC)"), { target: { value: "25" } });
    await screen.findByText("You receive about ₦36,030");
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Withdraw" })).toBeEnabled());
    expect(sendToken).not.toHaveBeenCalled();
    expect(screen.queryByText("Paid to your bank")).not.toBeInTheDocument();
  });

  it("explains a failed bank list and lets the user retry", async () => {
    apiFetch.mockImplementation(async (path: string, init?: RequestInit) =>
      path === "/api/paycrest/institutions/NGN"
        ? new Response(JSON.stringify({ success: false, error: { code: "X", message: "x" } }), {
            status: 502,
          })
        : routes(path, init)
    );
    renderWith(<PaycrestWithdrawScreen onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Select bank/ }));
    expect(await screen.findByText("Couldn't load the bank list.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("PaycrestDepositScreen", () => {
  async function fillForm() {
    renderWith(<PaycrestDepositScreen onBack={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Amount (NGN)"), { target: { value: "50000" } });
    await pickVerifiedAccount();
    fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: "1990-04-12" } });
    fireEvent.change(screen.getByLabelText("11-digit BVN"), { target: { value: "22212345678" } });
  }

  it("sends the KYC with the verified account name and shows where to pay", async () => {
    orderStatus = "initiated";
    await fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Get payment details" }));

    expect(await screen.findByText("9988776655")).toBeInTheDocument();
    expect(screen.getByText("₦50,000")).toBeInTheDocument();
    expect(screen.getAllByText("Waiting for your transfer").length).toBeGreaterThan(0);

    expect(bodyOf("/api/paycrest/orders/onramp")).toMatchObject({
      amount: "50000",
      token: "USDC",
      currency: "NGN",
      refundAccount: {
        institution: "GTBINGLA",
        accountIdentifier: "0123456789",
        accountName: "ADA OBI",
      },
      kyc: { fullName: "ADA OBI", birthDate: "1990-04-12", idType: "BVN", idNumber: "22212345678" },
    });
  });

  it("reports the USDC once the order settles", async () => {
    orderStatus = "settled";
    await fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Get payment details" }));
    expect(await screen.findByText("USDC added")).toBeInTheDocument();
    expect(screen.getByText("34.2 USDC is now in your wallet.")).toBeInTheDocument();
  });

  it("keeps the button off for anyone under 18", async () => {
    await fillForm();
    fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: "2015-01-01" } });
    expect(screen.getByText("You must be 18 or over.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get payment details" })).toBeDisabled();
  });
});
