import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import enMessages from "@/messages/en.json";
import { OwnMarketRow } from "./own-market-row";

function renderRow() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <OwnMarketRow />
    </NextIntlClientProvider>
  );
}

describe("the Own The Market shelf", () => {
  it("is a doorway to the perps desk from its heading and its card", () => {
    renderRow();
    expect(
      screen.getByRole("link", { name: "Own the market with leverage trading." })
    ).toHaveAttribute("href", "/perps");
    expect(screen.getByRole("link", { name: enMessages.discovery.arenaCta })).toHaveAttribute(
      "href",
      "/perps"
    );
  });

  it("draws the arena card's own copy", () => {
    renderRow();
    expect(screen.getByRole("heading", { name: enMessages.discovery.arenaTitle })).toBeVisible();
    expect(screen.getByText(enMessages.discovery.arenaBody)).toBeVisible();
  });
});
