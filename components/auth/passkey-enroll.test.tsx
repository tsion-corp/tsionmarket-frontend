// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

// A skipped passkey is a choice only where a passkey could have been made. On a
// device without WebAuthn the only button is "Continue", and counting that as a
// skip made the skip rate look like a product problem.

const analytics = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/lib/analytics/mixpanel", () => ({ track: analytics.track }));
vi.mock("@privy-io/react-auth", () => ({
  useLinkWithPasskey: () => ({ linkWithPasskey: vi.fn() }),
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PasskeyEnroll } from "@/components/auth/passkey-enroll";

function renderStep() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PasskeyEnroll onDone={() => {}} />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  analytics.track.mockClear();
});

describe("PasskeyEnroll", () => {
  it("says whether the device could have made a passkey when it is skipped", () => {
    Object.defineProperty(window, "PublicKeyCredential", { value: undefined, configurable: true });
    renderStep();
    fireEvent.click(screen.getByRole("button", { name: messages.auth.continue }));
    expect(analytics.track).toHaveBeenCalledWith("passkey_skipped", { supported: false });
  });

  it("reports a real skip where the device supports passkeys", () => {
    Object.defineProperty(window, "PublicKeyCredential", {
      value: function () {},
      configurable: true,
    });
    renderStep();
    fireEvent.click(screen.getByRole("button", { name: messages.auth.passkeyStepSkip }));
    expect(analytics.track).toHaveBeenCalledWith("passkey_skipped", { supported: true });
  });
});
