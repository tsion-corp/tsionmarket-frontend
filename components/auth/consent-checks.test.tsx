// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast }));

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
    toast.error.mockReset();
  });

  // Asked for on 2026-09-11: both boxes start ticked, so the usual sign in is
  // one tap fewer, and the person who does untick the terms is told at once
  // why the buttons went dark rather than left to work it out.
  it("starts with both boxes checked and no warning", () => {
    renderChecks();
    expect(screen.getByRole("checkbox", { name: /Terms of Service/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /product news/ })).toBeChecked();
    expect(screen.queryByRole("status")).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("warns with a toast when the terms are unticked, and only then", () => {
    renderChecks();
    const terms = screen.getByRole("checkbox", { name: /Terms of Service/ });
    fireEvent.click(terms);
    expect(terms).not.toBeChecked();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error.mock.calls[0][0]).toMatch(/agree to the Terms of Service/);
    expect(screen.getByRole("status")).toHaveTextContent(/Accept the terms/);
    expect(readConsent().terms).toBe(false);

    fireEvent.click(terms);
    expect(terms).toBeChecked();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).toBeNull();

    // Product email is optional: no warning for turning it off.
    fireEvent.click(screen.getByRole("checkbox", { name: /product news/ }));
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(readConsent().marketing).toBe(false);
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
    fireEvent.click(screen.getByRole("checkbox", { name: /product news/ }));
    expect(readConsent().marketing).toBe(false);
    fireEvent.click(screen.getByRole("checkbox", { name: /product news/ }));
    expect(readConsent().marketing).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /Terms of Service/ }));
    expect(readConsent().terms).toBe(false);
    fireEvent.click(screen.getByRole("checkbox", { name: /Terms of Service/ }));
    expect(readConsent().terms).toBe(true);
  });
});
