import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

const known = vi.hoisted(() => ({ value: false }));
vi.mock("@/lib/known-user", () => ({ useIsKnownUser: () => known.value }));
vi.mock("@/components/ui/language-select", () => ({ LanguageSelect: () => null }));

import { Navbar } from "@/components/landing/navbar";

function renderNavbar() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Navbar onNavigate={() => {}} />
    </NextIntlClientProvider>
  );
}

describe("Navbar call to action", () => {
  it("takes a new visitor straight into the app", () => {
    known.value = false;
    renderNavbar();
    expect(screen.getByText(messages.landingNav.getStarted).closest("a")).toHaveAttribute(
      "href",
      "/portfolio"
    );
  });

  it("takes a returning visitor to sign in, as the button says", () => {
    known.value = true;
    renderNavbar();
    expect(screen.getByText(messages.landingNav.login).closest("a")).toHaveAttribute(
      "href",
      "/auth"
    );
  });
});
