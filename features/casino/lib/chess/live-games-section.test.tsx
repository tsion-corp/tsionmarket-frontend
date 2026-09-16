import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const api = vi.hoisted(() => ({ fetchLiveMatches: vi.fn() }));

vi.mock("@/components/providers/server-session", () => ({
  useSessionWallet: () => null,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/features/casino/hooks/use-casino-chess", () => ({
  CHESS_KEYS: { liveMatches: ["casino", "chess", "live"] },
}));

vi.mock("@/features/casino/lib/api/chess", () => api);

vi.mock("@/features/casino/components/chess/broadcast/live-game-list", () => ({
  LiveGameList: () => <div>Live games</div>,
}));

import { LiveGamesSection } from "@/features/casino/components/chess-app/broadcast/live-games-section";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("LiveGamesSection polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.fetchLiveMatches.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("does not repeatedly fetch the active catalog between safety polls", async () => {
    render(<LiveGamesSection />, { wrapper });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(api.fetchLiveMatches).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_999);
    });
    expect(api.fetchLiveMatches).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(api.fetchLiveMatches).toHaveBeenCalledTimes(2);
  });
});
