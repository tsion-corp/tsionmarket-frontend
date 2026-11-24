import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { EnterLayer } from "@/components/landing/layers/enter-layer";
import messages from "@/messages/en.json";

// The layer paints hidden until the scroll engine reveals it, so nothing here
// is in the accessibility tree. Query by text and read the anchor it sits in.
function linkFor(label: string) {
  return screen.getByText(label).closest("a");
}

function renderEnter() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EnterLayer />
    </NextIntlClientProvider>
  );
}

describe("EnterLayer", () => {
  it("has a way in", () => {
    renderEnter();
    expect(linkFor("Get started")).toHaveAttribute("href", "/portfolio");
  });

  // The ArkStore listing is paused; the CTA that pointed to it is not
  // rendered rather than linking somewhere that doesn't work.
  it("does not show an app-store button", () => {
    renderEnter();
    expect(screen.queryByText("Get app")).toBeNull();
  });
});
