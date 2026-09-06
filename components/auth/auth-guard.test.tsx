import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const privy = vi.hoisted(() => ({
  state: { ready: false, authenticated: false },
}));

const router = vi.hoisted(() => ({
  replace: vi.fn(),
}));

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => privy.state,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
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
    privy.state = { ready: false, authenticated: false };
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
    privy.state = { ready: true, authenticated: true };
    mount(true);
    expect(screen.getByTestId("page")).toBeInTheDocument();
  });

  it("still sends a signed-out browser to /auth, even if the server vouched", () => {
    // A cookie that verified but a browser whose Privy state says signed out:
    // Privy is the authority once it has answered.
    privy.state = { ready: true, authenticated: false };
    mount(true);
    expect(screen.queryByTestId("page")).toBeNull();
    expect(router.replace).toHaveBeenCalledWith("/auth");
  });

  it("shows the page once Privy is ready and signed in, without the server", () => {
    privy.state = { ready: true, authenticated: true };
    mount();
    expect(screen.getByTestId("page")).toBeInTheDocument();
  });
});
