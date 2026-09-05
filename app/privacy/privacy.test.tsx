import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PrivacyPage from "@/app/privacy/page";
import { SECTIONS, SUPPORT_EMAIL } from "@/app/privacy/content";

describe("Privacy page", () => {
  it("renders every section, with an anchor the contents list can reach", () => {
    const { container } = render(<PrivacyPage />);
    for (const section of SECTIONS) {
      expect(container.querySelector(`#${section.id}`)).not.toBeNull();
      expect(screen.getAllByText(section.title).length).toBeGreaterThan(0);
    }
  });

  it("gives every contents entry a target that exists", () => {
    const { container } = render(<PrivacyPage />);
    const hrefs = Array.from(container.querySelectorAll('nav a[href^="#"]')).map((a) =>
      a.getAttribute("href")!.slice(1)
    );
    expect(hrefs).toHaveLength(SECTIONS.length);
    for (const id of hrefs) expect(container.querySelector(`#${id}`)).not.toBeNull();
  });

  it("offers a way to reach us about it", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("link", { name: SUPPORT_EMAIL })).toHaveAttribute(
      "href",
      `mailto:${SUPPORT_EMAIL}`
    );
  });

  // The policy makes specific promises about behaviour elsewhere in the app.
  // These are the two that would be untrue first if the code changed under it.
  it("still tells the truth about what is masked and how sessions are identified", () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/never by your email address/)).toBeInTheDocument();
    expect(screen.getByText(/are not in any replay/)).toBeInTheDocument();
  });
});
