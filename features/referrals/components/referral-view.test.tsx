import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";

const stats = vi.hoisted(() => ({ value: { isPending: true, isError: false, data: undefined } }));
vi.mock("@/features/referrals/hooks/use-referrals", () => ({
  useReferralStats: () => stats.value,
}));
const signedIn = vi.hoisted(() => ({ value: "no" as "yes" | "no" | "unknown" }));
vi.mock("@/hooks/use-signed-in", () => ({ useSignedIn: () => signedIn.value }));
vi.mock("@/features/referrals/components/referral-screens", () => ({
  ClaimScreen: () => <div>claim</div>,
  InviteScreen: () => <div>invite</div>,
  Spinner: () => <div data-testid="spinner" />,
}));

import { ReferralView } from "@/features/referrals/components/referral-view";

function renderView() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ReferralView />
    </NextIntlClientProvider>
  );
}

describe("ReferralView signed out", () => {
  beforeEach(() => {
    signedIn.value = "no";
    stats.value = { isPending: true, isError: false, data: undefined };
  });

  it("asks the visitor to sign in instead of spinning", () => {
    renderView();
    expect(screen.getByText(messages.auth.signInToInvite)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.auth.signIn })).toBeInTheDocument();
    expect(screen.queryByTestId("spinner")).toBeNull();
  });

  it("still spins for a signed-in reader whose stats are on the way", () => {
    signedIn.value = "yes";
    renderView();
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });
});
