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

  // wa.me silently fails on a leading zero or a plus, so the number format is
  // pinned here rather than left to review.
  it("opens WhatsApp on the international number, no plus and no leading zero", () => {
    renderFooter();
    const wa = screen.getByRole("link", { name: "WhatsApp" });
    expect(wa).toHaveAttribute("href", "https://wa.me/2349137089482");
    expect(wa).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("keeps the voice line separate from the WhatsApp line", () => {
    renderFooter();
    expect(screen.getByRole("link", { name: "Contact" })).toHaveAttribute(
      "href",
      "tel:+2349035725241"
    );
  });
});
