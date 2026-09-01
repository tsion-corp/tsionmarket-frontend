import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ReferralListCard } from "./referral-list-card";
import type { ReferralEntry } from "../lib/referrals";

// The labels are not what is under test, so the key comes back as the text.
// The count message still has to interpolate, since one assertion below is
// that a tab with a total but no names reports the total.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values && "count" in values ? `${key}:${values.count}` : key,
}));

const counted: ReferralEntry = {
  username: "micahdi",
  wallet: "0xaaaa1111bbbb2222cccc3333dddd4444eeee5555",
  status: "counted",
};
const alsoCounted: ReferralEntry = {
  username: "tonyareos",
  wallet: "0x1111222233334444555566667777888899990000",
  status: "counted",
};
const waiting: ReferralEntry = {
  username: "jackol",
  wallet: "0xffff6666aaaa7777bbbb8888cccc9999dddd0000",
  status: "deposit_pending",
};

describe("ReferralListCard", () => {
  it("opens on Active and lists only the referrals that counted", () => {
    render(
      <ReferralListCard referrals={[counted, waiting, alsoCounted]} referred={2} pending={1} />
    );

    expect(screen.getByText("@micahdi")).toBeInTheDocument();
    expect(screen.getByText("@tonyareos")).toBeInTheDocument();
    expect(screen.queryByText("@jackol")).not.toBeInTheDocument();
    expect(screen.getAllByText("counted")).toHaveLength(2);
  });

  it("switches to the referrals still waiting on a deposit", () => {
    render(
      <ReferralListCard referrals={[counted, waiting, alsoCounted]} referred={2} pending={1} />
    );

    fireEvent.click(screen.getByRole("tab", { name: "inactiveTab" }));

    expect(screen.getByText("@jackol")).toBeInTheDocument();
    expect(screen.getByText("depositPending")).toBeInTheDocument();
    expect(screen.queryByText("@micahdi")).not.toBeInTheDocument();
  });

  it("marks the open tab as selected", () => {
    render(<ReferralListCard referrals={[counted]} referred={1} pending={0} />);

    expect(screen.getByRole("tab", { name: "activeTab" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: "inactiveTab" }));

    expect(screen.getByRole("tab", { name: "inactiveTab" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("tab", { name: "activeTab" })).toHaveAttribute(
      "aria-selected",
      "false"
    );
  });

  it("reports the total when the engine sends counts but no names", () => {
    // The state the app is in today. Claiming the tab is empty would
    // contradict the Progress card above it, which counts the same referrals.
    render(<ReferralListCard referred={2} pending={3} />);

    expect(screen.getByText("listUnavailable:2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "inactiveTab" }));
    expect(screen.getByText("listUnavailable:3")).toBeInTheDocument();
  });

  it("says a tab is empty only when its total really is zero", () => {
    render(<ReferralListCard referrals={[]} referred={0} pending={0} />);
    expect(screen.getByText("noActive")).toBeInTheDocument();
  });

  it("names an invitee who never claimed a username by their truncated wallet", () => {
    render(
      <ReferralListCard
        referrals={[
          { username: null, wallet: "0x1234567890abcdef1234567890abcdefabcd", status: "counted" },
        ]}
        referred={1}
        pending={0}
      />
    );
    expect(screen.getByText("0x1234…abcd")).toBeInTheDocument();
  });

  it("keeps a referral that has not deposited out of Active and in Inactive", () => {
    // The engine encodes this as qualifiedAt: null, meaning the deposit probe
    // has not seen money arrive, so the referral has not counted.
    render(<ReferralListCard referrals={[waiting]} referred={0} pending={1} />);
    expect(screen.queryByText("@jackol")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "inactiveTab" }));
    expect(screen.getByText("@jackol")).toBeInTheDocument();
    expect(screen.getByText("depositPending")).toBeInTheDocument();
  });
});
