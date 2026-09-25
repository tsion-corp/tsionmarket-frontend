import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const session = vi.hoisted(() => ({
  state: { ready: false, authenticated: false },
}));

const router = vi.hoisted(() => ({
  replace: vi.fn(),
}));

vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => session.state,
}));

const route = { pathname: "/portfolio", search: "" };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/hooks/use-idle-logout", () => ({
  useIdleLogout: () => {},
}));

vi.mock("@/components/ui/market-logo", () => ({
  MarketLogo: () => <i data-testid="loader" />,
}));

import { AuthGuard } from "@/components/auth/auth-guard";

function mount(serverVerified?: boolean) {
  return render(
    <AuthGuard serverVerified={serverVerified}>
      <main data-testid="page">page</main>
    </AuthGuard>
  );
}

describe("AuthGuard", () => {
  beforeEach(() => {
    router.replace.mockReset();
    session.state = { ready: false, authenticated: false };
  });

  it("holds the page back while Privy starts and the server did not vouch", () => {
    mount();
    expect(screen.queryByTestId("page")).toBeNull();
    expect(screen.getByTestId("loader")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("shows the page at once when the server verified the session", () => {
    mount(true);
    expect(screen.getByTestId("page")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("keeps showing the page once Privy agrees", () => {
    session.state = { ready: true, authenticated: true };
    mount(true);
    expect(screen.getByTestId("page")).toBeInTheDocument();
  });

  it("still sends a signed-out browser to /auth, even if the server vouched", () => {
    // A cookie that verified but a browser whose Privy state says signed out:
    // Privy is the authority once it has answered.
    session.state = { ready: true, authenticated: false };
    mount(true);
    expect(screen.queryByTestId("page")).toBeNull();
    expect(router.replace).toHaveBeenCalledWith("/auth?next=%2Fportfolio");
  });

  // Not a game-link feature: any protected route a signed-out browser lands on
  // is carried through sign-in, query string included.
  it.each([
    ["/casino/last-standing/150", "", "/auth?next=%2Fcasino%2Flast-standing%2F150"],
    ["/spot", "asset=DOGE", "/auth?next=%2Fspot%3Fasset%3DDOGE"],
    ["/square", "", "/auth?next=%2Fsquare"],
  ])("carries %s through sign-in", (pathname, search, expected) => {
    route.pathname = pathname;
    route.search = search;
    session.state = { ready: true, authenticated: false };
    render(<AuthGuard>content</AuthGuard>);
    expect(router.replace).toHaveBeenCalledWith(expected);
    route.pathname = "/portfolio";
    route.search = "";
  });

  it("shows the page once Privy is ready and signed in, without the server", () => {
    session.state = { ready: true, authenticated: true };
    mount();
    expect(screen.getByTestId("page")).toBeInTheDocument();
  });
});
