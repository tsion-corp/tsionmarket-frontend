import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/casino",
}));

vi.mock("@/features/casino/components/casino-page", () => ({
  CasinoPage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/features/casino/components/arkade-mobile", () => ({
  ArkadeMobile: () => <div data-testid="mobile-catalogue" />,
}));

const { default: CasinoHubPage } = await import("./page");

// The desktop catalogue's wrapper: the only element that is hidden below md
// and blocks from md up.
function desktopWrapper(container: HTMLElement): HTMLElement {
  const wrapper = container.querySelector<HTMLElement>('[class~="md:block"]');
  if (!wrapper) throw new Error("desktop wrapper not found");
  return wrapper;
}

function renderRoute() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <CasinoHubPage />
    </NextIntlClientProvider>
  );
}

describe("casino hub route", () => {
  it("mounts the mobile catalogue below md and the desktop one from md up", () => {
    const { container } = renderRoute();

    const mobile = screen.getByTestId("mobile-catalogue").parentElement!;
    expect(mobile.className).toBe("md:hidden");

    const desktop = desktopWrapper(container);
    expect(desktop.className).toContain("hidden");
    expect(desktop.className).toContain("md:block");
    // Exactly one catalogue per breakpoint: the desktop tabs live only inside
    // the md:block wrapper, and the phone hub only inside the md:hidden one.
    expect(
      within(desktop as HTMLElement).getByRole("group", { name: "Game categories" })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("group", { name: "Game categories" })).toHaveLength(1);
    expect(mobile.contains(screen.getByRole("group", { name: "Game categories" }))).toBe(false);
  });

  it("lets the desktop grid fill the shell instead of boxing it in a narrow column", () => {
    const { container } = renderRoute();
    const desktop = desktopWrapper(container);

    // The grid divides this container three ways, so a narrow cap here is what
    // put empty gutters either side of the cards. 1200px boxed the catalogue
    // narrower than every other page in the app, which all stop at 1520 or the
    // perps terminal's 1920. Any cap must stay at or above the app's own
    // container width, so this cannot quietly shrink back.
    expect(desktop.className).not.toContain("max-w-[1200px]");
    const cap = desktop.className.match(/max-w-\[(\d+)px\]/);
    expect(cap).not.toBeNull();
    expect(Number(cap![1])).toBeGreaterThanOrEqual(1520);

    // Light horizontal padding, and nothing but padding, at the edges.
    expect(desktop.className).toContain("p-4");
    expect(desktop.className).toContain("sm:p-6");
    expect(desktop.className).toContain("lg:p-8");
  });

  it("navigates to the game the desktop tile reports", () => {
    renderRoute();
    push.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Play Chess" }));
    expect(push).toHaveBeenCalledWith("/casino/chess");
  });

  it("switches categories from the filter tabs", () => {
    renderRoute();

    expect(screen.getByRole("button", { name: "Play ArkBall" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: enMessages.casino.hub.categorySkill }));
    expect(screen.queryByRole("button", { name: "Play ArkBall" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play Chess" })).toBeInTheDocument();
  });

  it("shows coming soon games without making them clickable", () => {
    renderRoute();

    // Ayo, Poker and Racing are the catalogue's coming soon entries. They read
    // under All games but none of them is a control.
    for (const name of ["Ayo", "Poker", "Racing outrights"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: `Play ${name}` })).not.toBeInTheDocument();
    }
    expect(screen.getAllByText(enMessages.casino.hub.badgeComingSoon).length).toBe(3);
  });

  it("draws every tile's art with object-cover", () => {
    const { container } = renderRoute();
    const art = [...container.querySelectorAll("img")];
    expect(art.length).toBeGreaterThan(0);
    for (const img of art) expect(img.className).toContain("object-cover");
  });
});
