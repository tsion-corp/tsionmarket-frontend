// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import { ConsentChecks } from "@/components/auth/consent-checks";
import { readConsent, resetConsentStore } from "@/lib/consent";

function renderChecks() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ConsentChecks />
    </NextIntlClientProvider>
  );
}

describe("ConsentChecks", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetConsentStore();
  });

  it("starts with both boxes unchecked and says the terms are needed", () => {
    renderChecks();
    expect(screen.getByRole("checkbox", { name: /Terms of Service/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /product news/ })).not.toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent(/Accept the terms/);
  });

  it("links both documents, opening beside the sign in", () => {
    renderChecks();
    const terms = screen.getByRole("link", { name: "Terms of Service" });
    const privacy = screen.getByRole("link", { name: "Privacy Policy" });
    expect(terms).toHaveAttribute("href", "/terms");
    expect(privacy).toHaveAttribute("href", "/privacy");
    expect(terms).toHaveAttribute("target", "_blank");
  });

  it("stores each choice as it is made", () => {
    renderChecks();
    fireEvent.click(screen.getByRole("checkbox", { name: /Terms of Service/ }));
    expect(readConsent().terms).toBe(true);
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /product news/ }));
    expect(readConsent().marketing).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /product news/ }));
    expect(readConsent().marketing).toBe(false);
  });
});
