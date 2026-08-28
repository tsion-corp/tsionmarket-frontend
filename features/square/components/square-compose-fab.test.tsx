import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SquareComposeFab } from "./square-compose-fab";

// next-intl needs a provider; the labels themselves are not what is under test.
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/square/links", () => ({
  squareLinks: {
    home: () => "https://square.test",
    notifications: () => "https://square.test/notifications",
    profile: (u: string) => `https://square.test/u/${u}`,
    post: (id: string) => `https://square.test/p/${id}`,
    live: (id: string) => `https://square.test/live/${id}`,
  },
}));
// The real control needs BroadcastSessionProvider (mounted app-wide in
// app/providers.tsx) and has its own suite. What matters HERE is that the
// sheet renders it rather than a placeholder gated on a callback nobody
// passes, which is how it shipped permanently disabled.
vi.mock("@/components/broadcast/go-live-control", () => ({
  GoLiveControl: ({ variant }: { variant: string }) => (
    <button type="button" data-testid="go-live" data-variant={variant}>
      Go Live
    </button>
  ),
}));

const fetchTrendingDiscussions = vi.fn();
vi.mock("@/lib/api/market-square", () => ({
  fetchSquareMe: vi.fn().mockResolvedValue(null),
  fetchSquareTopics: vi.fn().mockResolvedValue([{ key: "crypto", label: "Crypto" }]),
  fetchSquareUnread: vi.fn().mockResolvedValue(0),
  fetchTrendingDiscussions: (...args: unknown[]) => fetchTrendingDiscussions(...args),
  createSquarePost: vi.fn(),
}));

beforeEach(() => {
  // Default: nothing trending yet, which is the state of a fresh deployment.
  fetchTrendingDiscussions.mockReset();
  fetchTrendingDiscussions.mockResolvedValue([]);
});

function renderFab(
  props: { onPickTopic?: (key: string) => void; onPickDiscussion?: (tag: string) => void } = {}
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SquareComposeFab {...props} />
    </QueryClientProvider>
  );
}

/**
 * The plus shipped inert: its sheet was imported but never rendered, so the
 * click set state that nothing read and the button did nothing at all. Type
 * checking cannot catch an unused import, and neither can a lint rule that
 * counts the import as "used". Only pressing it can.
 */
describe("SquareComposeFab", () => {
  it("embeds the real Go Live control rather than a disabled placeholder", () => {
    renderFab();
    fireEvent.click(screen.getByRole("button", { name: "compose" }));
    const live = screen.getByTestId("go-live");
    expect(live).toHaveAttribute("data-variant", "tile");
    expect(live).not.toBeDisabled();
  });

  it("opens the actions sheet when pressed", () => {
    renderFab();
    // Revealed on scroll; the sheet is what is under test, so force it visible.
    Object.defineProperty(window, "scrollY", { value: 5000, writable: true });
    window.dispatchEvent(new Event("scroll"));

    const plus = screen.getByRole("button", { name: "compose" });
    expect(screen.queryByText("tilePost")).toBeNull();

    fireEvent.click(plus);
    // All three ways in, which is the whole point of the sheet existing
    // rather than the plus jumping straight to the composer.
    expect(screen.getByText("tilePost")).toBeInTheDocument();
    expect(screen.getByText("tileMedia")).toBeInTheDocument();
    // Live is the broadcast control itself, which brings its own label.
    expect(screen.getByTestId("go-live")).toBeInTheDocument();
  });

  it("opens the composer from the sheet's Post tile", () => {
    renderFab();
    fireEvent.click(screen.getByRole("button", { name: "compose" }));
    fireEvent.click(screen.getByText("tilePost"));
    // The composer's own field, not the sheet's tile label.
    expect(screen.getByPlaceholderText("composePlaceholder")).toBeInTheDocument();
  });

  /**
   * Tapping a discussion did nothing in production: the handler was optional
   * and the dashboard never passed one, so the sheet closed and called into
   * a `?.()` that was undefined. Nothing type-checks that a caller supplied an
   * optional prop, so the wiring is asserted here instead.
   */
  it("reports the discussion that was tapped", async () => {
    fetchTrendingDiscussions.mockResolvedValue([
      { tag: "btc", label: "#btc", postCount: 4, participantCount: 3, viewCount: 1240 },
    ]);
    const onPickDiscussion = vi.fn();
    renderFab({ onPickDiscussion });
    fireEvent.click(screen.getByRole("button", { name: "compose" }));

    // Reach is shown next to people, compacted, and the two are never merged.
    expect(await screen.findByText(/viewsCount/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("#btc"));
    expect(onPickDiscussion).toHaveBeenCalledWith("btc");
  });

  // A fresh deployment has nothing trending. An empty "Discussions" heading
  // is worse than offering the curated shelf, so topics stand in.
  it("falls back to topics when nothing is trending yet", async () => {
    const onPickTopic = vi.fn();
    renderFab({ onPickTopic });
    fireEvent.click(screen.getByRole("button", { name: "compose" }));

    fireEvent.click(await screen.findByText("Crypto"));
    expect(onPickTopic).toHaveBeenCalledWith("crypto");
  });

  it("renders nothing at all when the square is not configured", async () => {
    vi.resetModules();
    vi.doMock("@/lib/square/links", () => ({ squareLinks: { home: () => null } }));
    const { SquareComposeFab: Unconfigured } = await import("./square-compose-fab");
    const client = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={client}>
        <Unconfigured />
      </QueryClientProvider>
    );
    expect(container).toBeEmptyDOMElement();
  });
});
