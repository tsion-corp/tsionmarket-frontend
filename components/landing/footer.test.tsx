import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { Footer } from "@/components/landing/footer";
import messages from "@/messages/en.json";

function renderFooter() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Footer />
    </NextIntlClientProvider>
  );
}

describe("Footer support channels", () => {
  it("mails the support address", () => {
    renderFooter();
    expect(screen.getByRole("link", { name: "Email" })).toHaveAttribute(
      "href",
      "mailto:tsionarksupport@gmail.com"
    );
  });

  it("rings the support line", () => {
    renderFooter();
    expect(screen.getByRole("link", { name: "Contact" })).toHaveAttribute(
      "href",
      "tel:+2349035725241"
    );
  });

  it("offers no WhatsApp channel", () => {
    renderFooter();
    expect(screen.queryByRole("link", { name: /whatsapp/i })).not.toBeInTheDocument();
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href") ?? "").not.toContain("wa.me");
    }
  });
});
