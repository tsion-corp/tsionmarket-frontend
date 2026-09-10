import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TermsPage from "@/app/terms/page";
import { SECTIONS, SUPPORT_EMAIL } from "@/app/terms/content";
import { SUPPORT_EMAIL as BRAND_SUPPORT_EMAIL } from "@/lib/brand";

describe("Terms page", () => {
  it("renders every section, with an anchor the contents list can reach", () => {
    const { container } = render(<TermsPage />);
    for (const section of SECTIONS) {
      expect(container.querySelector(`#${section.id}`)).not.toBeNull();
      expect(screen.getAllByText(section.title).length).toBeGreaterThan(0);
    }
  });

  it("gives every contents entry a target that exists", () => {
    const { container } = render(<TermsPage />);
    const hrefs = Array.from(container.querySelectorAll('nav a[href^="#"]')).map((a) =>
      a.getAttribute("href")!.slice(1)
    );
    expect(hrefs).toHaveLength(SECTIONS.length);
    for (const id of hrefs) expect(container.querySelector(`#${id}`)).not.toBeNull();
  });

  it("offers a way to reach us about it", () => {
    render(<TermsPage />);
    expect(screen.getByRole("link", { name: SUPPORT_EMAIL })).toHaveAttribute(
      "href",
      `mailto:${SUPPORT_EMAIL}`
    );
  });

  // The terms make specific promises about how the platform behaves. These
  // are the ones that would be untrue first if the product changed under it.
  it("still tells the truth about custody and finality", () => {
    render(<TermsPage />);
    expect(screen.getByText(/We never hold your private keys/)).toBeInTheDocument();
    expect(screen.getByText(/Blockchain transactions are final/)).toBeInTheDocument();
  });

  // The house style: no em-dashes anywhere in the document.
  it("is written without em-dashes", () => {
    for (const section of SECTIONS) {
      expect(section.title).not.toContain("—");
      for (const block of section.body) {
        const text = typeof block === "string" ? block : block.items.join(" ");
        expect(text).not.toContain("—");
      }
    }
  });
});

// The terms page's contact address is the brand's one support inbox, not a
// copy that can drift from it.
it("reaches support at the brand's support address", () => {
  expect(SUPPORT_EMAIL).toBe(BRAND_SUPPORT_EMAIL);
});
