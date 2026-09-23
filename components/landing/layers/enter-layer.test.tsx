import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { EnterLayer } from "@/components/landing/layers/enter-layer";
import { ARKSTORE_URL } from "@/lib/brand";
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
  it("sends the app button to the ArkStore listing in a new tab", () => {
    renderEnter();
    const link = linkFor("Get app");
    expect(link).toHaveAttribute("href", ARKSTORE_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link?.getAttribute("rel")).toContain("noopener");
    expect(link?.className).toContain("capitalize");
  });

  it("keeps the app button beside the way in", () => {
    renderEnter();
    expect(linkFor("Get started")).toHaveAttribute("href", "/auth");
  });
});
