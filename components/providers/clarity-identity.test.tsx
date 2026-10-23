// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ADDRESS = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01";

const session = vi.hoisted(() => ({
  ready: true,
  authenticated: false,
  evmAddress: null as string | null,
}));
vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => session,
}));

const clarity = vi.hoisted(() => ({
  identifyClarity: vi.fn(async () => {}),
  tagClaritySession: vi.fn(async () => {}),
}));
vi.mock("@/lib/analytics/clarity", () => clarity);

import { ClarityIdentity } from "@/components/providers/clarity-identity";

function mount(client = new QueryClient()) {
  const view = render(
    <QueryClientProvider client={client}>
      <ClarityIdentity />
    </QueryClientProvider>
  );
  return { client, view };
}

beforeEach(() => {
  vi.clearAllMocks();
  session.ready = true;
  session.authenticated = false;
  session.evmAddress = null;
});

describe("ClarityIdentity", () => {
  it("identifies a signed-in user once and tags the session as new", () => {
    session.authenticated = true;
    session.evmAddress = ADDRESS;
    const { view, client } = mount();
    view.rerender(
      <QueryClientProvider client={client}>
        <ClarityIdentity />
      </QueryClientProvider>
    );

    expect(clarity.identifyClarity).toHaveBeenCalledTimes(1);
    expect(clarity.identifyClarity).toHaveBeenCalledWith(ADDRESS);
    expect(clarity.tagClaritySession).toHaveBeenCalledWith({ user_tier: "new" });
  });

  it("tags the tier from the portfolio the app already loaded", () => {
    session.authenticated = true;
    session.evmAddress = ADDRESS;
    const client = new QueryClient();
    client.setQueryData(["portfolio", ADDRESS], { totalUsd: 750 });
    mount(client);

    expect(clarity.tagClaritySession).toHaveBeenCalledWith({ user_tier: "power" });
  });

  it("does nothing while signed out", () => {
    mount();

    expect(clarity.identifyClarity).not.toHaveBeenCalled();
    expect(clarity.tagClaritySession).not.toHaveBeenCalled();
  });
});
