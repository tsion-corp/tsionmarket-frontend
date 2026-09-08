import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import { AddressPanel } from "@/features/funds/components/address-panel";

vi.mock("@/components/ui/qr-code", () => ({ QrCode: () => <div data-testid="qr" /> }));

// The deposit address comes from Dextopus and only takes the deposit's own
// asset. KASH+ sent to it is lost, so the deposit screen hands the panel a
// warning to show right under the address, where the copy button is.
describe("AddressPanel", () => {
  it("shows a notice under the address when given one", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AddressPanel
          address="0x1234567890abcdef1234567890abcdef12345678"
          notice="Do not send KASH+ here."
        />
      </NextIntlClientProvider>
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Do not send KASH+ here.");
  });

  it("shows nothing extra without a notice", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AddressPanel address="0x1234567890abcdef1234567890abcdef12345678" />
      </NextIntlClientProvider>
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
