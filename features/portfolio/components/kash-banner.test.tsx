import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { KashBanner } from "./kash-banner";

function renderBanner() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <KashBanner onBuy={vi.fn()} />
    </NextIntlClientProvider>
  );
}

describe("KashBanner", () => {
  // The phone used to carry a flat export of this banner with its lettering
  // baked in, so the words were a different face from every other heading in
  // the app and could not be translated. Both widths render the same text now.
  it("sets its words as text in the app's display face", () => {
    renderBanner();
    const headline = screen.getByText(messages.kash.railTitle);
    expect(headline).toBeInTheDocument();
    expect(headline.className).toContain("ws-poster");
    expect(screen.getByText(messages.kash.railSubtitle)).toBeInTheDocument();
  });
});
