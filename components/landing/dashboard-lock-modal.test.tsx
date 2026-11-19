import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import { DashboardLockModal } from "@/components/landing/dashboard-lock-modal";

function renderModal() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DashboardLockModal />
    </NextIntlClientProvider>
  );
}

describe("DashboardLockModal", () => {
  it("covers the page as a modal dialog naming the maintenance", () => {
    renderModal();
    const dialog = screen.getByRole("dialog", { name: "Ark is undergoing maintenance." });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog.className).toContain("fixed");
    expect(dialog.className).toContain("inset-0");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Ark is undergoing maintenance."
    );
  });

  it("says balances are untouched", () => {
    renderModal();
    expect(screen.getByText(messages.dashboardLock.body)).toBeInTheDocument();
  });

  it("leads back to the landing page and offers support", () => {
    renderModal();
    expect(screen.getByRole("link", { name: messages.dashboardLock.home })).toHaveAttribute(
      "href",
      "/"
    );
    expect(screen.getByRole("link", { name: messages.dashboardLock.email })).toHaveAttribute(
      "href",
      "mailto:support@tsionark.com"
    );
  });
});
