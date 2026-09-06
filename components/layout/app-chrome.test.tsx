import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const navigation = vi.hoisted(() => ({ pathname: "/dashboard" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import {
  AppChromeProvider,
  useAppChrome,
  useReportActiveSection,
} from "@/components/layout/app-chrome";
import type { SectionId } from "@/lib/sections";

function Highlight() {
  const { activeSection } = useAppChrome();
  return <output data-testid="active">{activeSection}</output>;
}

function Reporter({ id }: { id: SectionId }) {
  useReportActiveSection(id);
  return null;
}

describe("AppChromeProvider", () => {
  beforeEach(() => {
    navigation.pathname = "/dashboard";
  });

  it("derives the highlight from the path", () => {
    navigation.pathname = "/prediction/event/xyz";
    render(
      <AppChromeProvider>
        <Highlight />
      </AppChromeProvider>
    );
    expect(screen.getByTestId("active")).toHaveTextContent("prediction");
  });

  it("builds the nav once, with portfolio leading", () => {
    function Nav() {
      const { nav } = useAppChrome();
      return <output data-testid="nav">{nav.map((n) => n.id).join(",")}</output>;
    }
    render(
      <AppChromeProvider>
        <Nav />
      </AppChromeProvider>
    );
    expect(screen.getByTestId("nav").textContent?.startsWith("portfolio,")).toBe(true);
  });

  it("lets a mounted page override the highlight, and gives it back on unmount", () => {
    const view = render(
      <AppChromeProvider>
        <Highlight />
        <Reporter id="spot" />
      </AppChromeProvider>
    );
    expect(screen.getByTestId("active")).toHaveTextContent("spot");

    view.rerender(
      <AppChromeProvider>
        <Highlight />
      </AppChromeProvider>
    );
    expect(screen.getByTestId("active")).toHaveTextContent("portfolio");
  });

  it("follows the reported section as it changes", () => {
    const view = render(
      <AppChromeProvider>
        <Highlight />
        <Reporter id="portfolio" />
      </AppChromeProvider>
    );
    view.rerender(
      <AppChromeProvider>
        <Highlight />
        <Reporter id="rwa" />
      </AppChromeProvider>
    );
    expect(screen.getByTestId("active")).toHaveTextContent("rwa");
  });

  it("refuses to run outside the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Highlight />)).toThrow(/inside AppChromeProvider/);
    spy.mockRestore();
  });
});
