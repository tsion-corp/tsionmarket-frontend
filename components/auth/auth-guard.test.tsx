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

function mount() {
  return render(
    <AuthGuard>
      <main data-testid="page">page</main>
    </AuthGuard>
  );
}

describe("AuthGuard", () => {
  beforeEach(() => {
    router.replace.mockReset();
    session.state = { ready: false, authenticated: false };
  });

  it("shows the page while the session is still starting", () => {
    mount();
    expect(screen.getByTestId("page")).toBeInTheDocument();
    expect(screen.queryByTestId("loader")).toBeNull();
  });

  it("shows the page to a signed-out visitor and never sends them to /auth", () => {
    session.state = { ready: true, authenticated: false };
    route.pathname = "/casino/last-standing/274";
    route.search = "private=1";
    mount();
    expect(screen.getByTestId("page")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("shows the page to a signed-in visitor", () => {
    session.state = { ready: true, authenticated: true };
    mount();
    expect(screen.getByTestId("page")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
