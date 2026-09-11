// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { SupportButton } from "@/components/layout/support-button";
import { SUPPORT_EMAIL } from "@/lib/brand";

// Support moved from a Google Form to the support inbox: the bubble opens
// the user's mail client addressed to it, in the same tab.
describe("SupportButton", () => {
  it("opens a new email to the support address", () => {
    render(<SupportButton />);
    const link = screen.getByRole("link", { name: /support/i });
    expect(link).toHaveAttribute("href", `mailto:${SUPPORT_EMAIL}`);
    expect(link).not.toHaveAttribute("target");
  });
});
