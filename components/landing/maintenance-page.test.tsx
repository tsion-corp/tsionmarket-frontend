import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import { MaintenancePage } from "@/components/landing/maintenance-page";

function renderPage() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MaintenancePage />
    </NextIntlClientProvider>
  );
}

describe("MaintenancePage", () => {
  it("says the app is down and that it is planned", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(messages.maintenance.title);
    expect(screen.getByText(messages.maintenance.eyebrow)).toBeInTheDocument();
  });

  // The one question a user with a balance actually has.
  it("states that balances are untouched", () => {
    renderPage();
    expect(screen.getByText(messages.maintenance.funds)).toBeInTheDocument();
  });

  it("offers the support address, so a worried user can reach a human", () => {
    renderPage();
    expect(screen.getByRole("link", { name: messages.maintenance.email })).toHaveAttribute(
      "href",
      "mailto:tsionarksupport@gmail.com"
    );
  });

  it("offers no WhatsApp channel", () => {
    renderPage();
    expect(screen.queryByRole("link", { name: /whatsapp/i })).not.toBeInTheDocument();
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href") ?? "").not.toContain("wa.me");
    }
  });

  // The waitlist page is the pre-launch story. Someone who already holds a
  // balance must never be told the product has not opened yet.
  it("shows no countdown, no waitlist form and no launch language", () => {
    renderPage();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.queryByText(/launching soon/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/doors open/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
