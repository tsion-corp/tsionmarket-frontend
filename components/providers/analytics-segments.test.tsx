import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const privy = vi.hoisted(() => ({
  state: { ready: true, authenticated: true },
}));

const analytics = vi.hoisted(() => ({
  setSuper: vi.fn(),
  setProfile: vi.fn(),
  tagClaritySession: vi.fn(() => Promise.resolve()),
}));

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => privy.state,
}));

vi.mock("@/lib/analytics/mixpanel", () => ({
  setSuper: analytics.setSuper,
  setProfile: analytics.setProfile,
}));

vi.mock("@/lib/analytics/clarity", () => ({
  tagClaritySession: analytics.tagClaritySession,
}));

import { AnalyticsSegments } from "@/components/providers/analytics-segments";

function mount(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <AnalyticsSegments />
    </QueryClientProvider>
  );
}

describe("AnalyticsSegments", () => {
  beforeEach(() => {
    analytics.setSuper.mockReset();
    analytics.setProfile.mockReset();
    privy.state = { ready: true, authenticated: true };
  });

  it("starts no portfolio request of its own", () => {
    const client = new QueryClient();
    mount(client);

    // No query was created, so nothing is fetching or polling because of
    // this provider. That is the whole point of listening instead of asking.
    expect(client.getQueryCache().findAll({ queryKey: ["portfolio"] })).toHaveLength(0);
    expect(analytics.setSuper).not.toHaveBeenCalled();
  });

  it("registers a balance the app already knows", () => {
    const client = new QueryClient();
    client.setQueryData(["portfolio", "0xabc", null], { totalUsd: 750, tokens: [] });
    mount(client);

    expect(analytics.setSuper).toHaveBeenCalledWith({
      user_tier: "power",
      has_deposited: true,
      platform: "web",
    });
    expect(analytics.setProfile).toHaveBeenCalledWith({
      portfolio_value_usd: 750,
      has_deposited: true,
    });
  });

  it("follows the balance as pages load it", () => {
    const client = new QueryClient();
    mount(client);

    client.setQueryData(["portfolio", "0xabc", null], { totalUsd: 0, tokens: [] });
    expect(analytics.setSuper).toHaveBeenLastCalledWith({
      user_tier: "new",
      has_deposited: false,
      platform: "web",
    });

    client.setQueryData(["portfolio", "0xabc", null], { totalUsd: 12, tokens: [] });
    expect(analytics.setSuper).toHaveBeenLastCalledWith({
      user_tier: "activated",
      has_deposited: true,
      platform: "web",
    });
  });

  it("ignores other queries", () => {
    const client = new QueryClient();
    mount(client);

    client.setQueryData(["prices", ["ETH"]], { ETH: 3000 });

    expect(analytics.setSuper).not.toHaveBeenCalled();
  });

  it("stays quiet while signed out", () => {
    privy.state = { ready: true, authenticated: false };
    const client = new QueryClient();
    client.setQueryData(["portfolio", "0xabc", null], { totalUsd: 750, tokens: [] });
    mount(client);

    expect(analytics.setSuper).not.toHaveBeenCalled();
  });
});
