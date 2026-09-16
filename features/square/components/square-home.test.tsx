import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import enMessages from "@/messages/en.json";
import type {
  MarketSquareFeedPage,
  MarketSquareHouse,
  MarketSquareRoom,
  SuggestedProfile,
} from "@/lib/api/market-square";

// The page composes the Square's Home from five reads. Each is mocked at the
// fetcher, so what is under test is the composition: the order, the omission
// of an empty section, and where every "do more" control leads.
const reads = vi.hoisted(() => ({
  fetchLiveStreams: vi.fn(),
  fetchScheduledStreams: vi.fn(),
  fetchDiscoverHouses: vi.fn(),
  fetchSuggestedProfiles: vi.fn(),
  fetchSquareMe: vi.fn(),
  fetchSquareFeed: vi.fn(),
  fetchSquareTopics: vi.fn(),
  fetchPostComments: vi.fn(),
  fetchCommentReplies: vi.fn(),
  addPostComment: vi.fn(),
  setCommentLike: vi.fn(),
  searchSquare: vi.fn(),
}));

vi.mock("@/lib/api/market-square", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api/market-square")>()),
  ...reads,
}));

vi.mock("@/lib/market-square", () => ({
  MARKET_SQUARE_HIDDEN: false,
  MARKET_SQUARE_URL: "https://square.test",
  marketSquareHref: (path?: string) =>
    path ? `https://square.test/${path}` : "https://square.test",
}));

const { SquareHome } = await import("./square-home");

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={enMessages}>
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

const host = { id: "u-prince", username: "prince", displayName: "Prince", avatarUrl: null };

const liveRoom: MarketSquareRoom = {
  id: "st-live",
  title: "Base season, who wins",
  description: null,
  status: "live",
  scheduledAt: null,
  startedAt: "2026-09-12T10:00:00.000Z",
  peakViewers: 12,
  likeCount: 3,
  topics: ["crypto"],
  owner: host,
};

const soonRoom: MarketSquareRoom = {
  ...liveRoom,
  id: "st-soon",
  title: "testing coming soon",
  status: "scheduled",
  scheduledAt: "2026-09-14T08:00:00.000Z",
  startedAt: null,
  peakViewers: 0,
};

const people: SuggestedProfile[] = [
  {
    id: "u-prince",
    username: "prince",
    displayName: "Prince",
    avatarUrl: null,
    verification: "verified",
    role: "creator",
    followerCount: 1,
  },
  {
    id: "me-1",
    username: "ogazboiz",
    displayName: "ogazboiz",
    avatarUrl: null,
    verification: "none",
    role: "creator",
    followerCount: 1,
  },
];

const house: MarketSquareHouse = {
  id: "h-1",
  title: "Entitle Men",
  description: "let get started",
  imageUrl: null,
  memberCount: 1,
  members: [host],
};

const feedPage: MarketSquareFeedPage = {
  items: [
    {
      id: "post-1",
      type: "post",
      occurredAt: "2026-09-11T09:36:08.543Z",
      post: {
        id: "post-1",
        authorId: "me-1",
        text: "monthly wrap up",
        mediaUrl: null,
        mediaKind: null,
        thumbnailUrl: null,
        deepLink: null,
        preview: null,
        likeCount: 0,
        commentCount: 0,
        repostCount: 0,
        viewCount: 0,
        likedByMe: false,
        repostedByMe: false,
        createdAt: "2026-09-11T09:36:08.543Z",
        author: {
          id: "me-1",
          username: "ogazboiz",
          displayName: "ogazboiz",
          avatarUrl: null,
          verification: "none",
          role: "creator",
        },
      },
    },
  ],
  nextCursor: null,
};

beforeEach(() => {
  for (const read of Object.values(reads)) read.mockReset();
  reads.fetchLiveStreams.mockResolvedValue([liveRoom]);
  reads.fetchScheduledStreams.mockResolvedValue([soonRoom]);
  reads.fetchDiscoverHouses.mockResolvedValue([house]);
  reads.fetchSuggestedProfiles.mockResolvedValue(people);
  reads.fetchSquareMe.mockResolvedValue({
    id: "me-1",
    username: "ogazboiz",
    displayName: "ogazboiz",
    avatarUrl: null,
    verification: "none",
    role: "creator",
  });
  reads.fetchSquareFeed.mockResolvedValue(feedPage);
  reads.fetchSquareTopics.mockResolvedValue([{ key: "crypto", label: "Crypto" }]);
  reads.fetchPostComments.mockResolvedValue({
    items: [
      {
        id: "c-1",
        authorId: "u-prince",
        text: "nice one",
        createdAt: "2026-09-11T10:00:00.000Z",
        parentId: null,
        replyCount: 1,
        likeCount: 2,
        likedByMe: false,
        author: { ...people[0] },
      },
    ],
    nextCursor: null,
  });
  reads.fetchCommentReplies.mockResolvedValue({
    items: [
      {
        id: "c-2",
        authorId: "me-1",
        text: "thanks",
        createdAt: "2026-09-11T11:00:00.000Z",
        parentId: "c-1",
        replyCount: 0,
        likeCount: 0,
        author: {
          id: "me-1",
          username: "ogazboiz",
          displayName: "ogazboiz",
          avatarUrl: null,
          verification: "none",
          role: "creator",
        },
      },
    ],
    nextCursor: null,
  });
  reads.addPostComment.mockResolvedValue({
    id: "c-3",
    text: "hello",
    createdAt: "2026-09-12T00:00:00.000Z",
    author: null,
  });
  reads.setCommentLike.mockResolvedValue({ liked: true, likeCount: 3 });
  reads.searchSquare.mockResolvedValue({
    items: [
      {
        kind: "profile",
        id: "u-sam",
        profile: {
          id: "u-sam",
          username: "samuel",
          displayName: "Samuel Yaras",
          avatarUrl: null,
          verification: "none",
          role: "citizen",
          orgBadge: null,
        },
      },
      {
        kind: "stream",
        id: "st-9",
        stream: {
          id: "st-9",
          title: "Sam's room",
          owner: { username: "samuel", displayName: null },
        },
      },
      {
        kind: "post",
        id: "p-9",
        post: { id: "p-9", text: "sam says hi", author: { username: "samuel" } },
      },
      {
        kind: "product",
        id: "pr-1",
        product: { id: "pr-1", slug: "sam-tee", name: "Sam tee", tagline: "soft" },
      },
    ],
    nextCursor: null,
  });
});

function headings(): string[] {
  return screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent ?? "");
}

const outbound = (link: HTMLElement, href: string) => {
  expect(link).toHaveAttribute("href", href);
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
};

describe("SquareHome", () => {
  // Home's own headings, in Home's own order and words.
  it("renders the Square's Home sections in Home's order", async () => {
    render(<SquareHome markets={[]} />, { wrapper });
    await screen.findByText("Base season, who wins");
    await screen.findByText("monthly wrap up");
    expect(headings()).toEqual([
      "Top GistRooms",
      "Make some friends",
      "Coming Soon",
      "Popular Houses",
      "Post For You",
    ]);
  });

  it("omits a section that has nothing, rather than showing an empty shelf", async () => {
    reads.fetchScheduledStreams.mockResolvedValue([]);
    reads.fetchDiscoverHouses.mockResolvedValue([]);
    render(<SquareHome markets={[]} />, { wrapper });
    await screen.findByText("monthly wrap up");
    expect(headings()).toEqual(["Top GistRooms", "Make some friends", "Post For You"]);
  });

  // A profile without a display name is named by its handle, never left
  // blank beside its seal: prince on the local gateway has none.
  it("names an author by handle when there is no display name", async () => {
    reads.fetchSquareFeed.mockResolvedValue({
      ...feedPage,
      items: [
        {
          ...feedPage.items[0],
          id: "post-2",
          post: {
            ...feedPage.items[0].post!,
            id: "post-2",
            authorId: "u-prince",
            text: "gm",
            // Whitespace is what the live directory holds for some accounts.
            author: { ...people[0], displayName: "  " },
          },
        },
      ],
    });
    render(<SquareHome markets={[]} />, { wrapper });
    await screen.findByText("gm");
    const card = screen.getByText("gm").closest("article");
    if (card === null) throw new Error("the post rendered no card");
    expect(card.querySelector("header")).toHaveTextContent("prince");
    expect(card.querySelector("header")?.textContent?.startsWith("@")).toBe(false);
  });

  it("labels a room's topic from the Square's vocabulary", async () => {
    render(<SquareHome markets={[]} />, { wrapper });
    await screen.findByText("Base season, who wins");
    // Once on the live room, once on the coming-soon room.
    expect(await screen.findAllByText("Crypto")).toHaveLength(2);
  });

  it("sends the reader to the Square for everything this app does not back", async () => {
    render(<SquareHome markets={[]} />, { wrapper });
    await screen.findByText("monthly wrap up");

    outbound(screen.getByRole("link", { name: "Open the Square" }), "https://square.test");
    outbound(
      screen.getByRole("link", { name: "Join Gistroom" }),
      "https://square.test/live/st-live"
    );
    outbound(screen.getByRole("link", { name: "Remind me" }), "https://square.test/live/st-soon");
    outbound(screen.getByRole("link", { name: "Join House" }), "https://square.test/houses/h-1");
    // Home's banner and its search row, carried over.
    for (const host of screen.getAllByRole("link", { name: "Host Room" })) {
      outbound(host, "https://square.test/gist-rooms?open=1");
    }
    expect(
      screen.getByRole("searchbox", { name: "Search Gistrooms, houses, friends" })
    ).toBeInTheDocument();

    // Each section's "View more" continues on the Square's matching page.
    const more = screen.getAllByRole("link", { name: "View more" });
    expect(more.map((link) => link.getAttribute("href"))).toEqual([
      "https://square.test/gist-rooms",
      "https://square.test/pals",
      "https://square.test/gist-rooms",
      "https://square.test/houses",
      "https://square.test/feed",
    ]);
    for (const link of more) outbound(link, link.getAttribute("href") ?? "");

    outbound(screen.getByRole("link", { name: "Wink at Prince" }), "https://square.test/u/prince");
    outbound(screen.getByRole("link", { name: "Prince" }), "https://square.test/u/prince");

    outbound(
      screen.getByRole("link", { name: enMessages.square.openPost }),
      "https://square.test/p/post-1"
    );
  });

  // The deck is people to meet; the reader is not one of them.
  it("leaves the reader out of Make some friends", async () => {
    render(<SquareHome markets={[]} />, { wrapper });
    await screen.findByText("monthly wrap up");
    expect(screen.getByRole("button", { name: "Skip Prince" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skip ogazboiz" })).toBeNull();
  });

  // Following is backed here, so it stays a button on the person's card
  // rather than a trip to the Square.
  it("keeps follow in this app", async () => {
    render(<SquareHome markets={[]} />, { wrapper });
    await screen.findByText("monthly wrap up");
    expect(screen.getByRole("button", { name: "Follow Prince" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    // The post card's header pill is the Square's, and never offers the
    // reader their own post to follow: this post is theirs.
    expect(screen.queryByRole("button", { name: "Follow" })).toBeNull();
  });

  // The deck is the Square's: the front card is the one that acts, pass
  // steps to the next person, and the arrows page it.
  it("deals the people as a deck, and pass steps to the next person", async () => {
    const { fireEvent } = await import("@testing-library/react");
    reads.fetchSuggestedProfiles.mockResolvedValue([
      ...people,
      { ...people[0], id: "u-ada", username: "ada", displayName: "Ada" },
    ]);
    render(<SquareHome markets={[]} />, { wrapper });
    await screen.findByText("monthly wrap up");
    expect(screen.getByRole("button", { name: "Skip Prince" })).toBeEnabled();
    // No right disc: going on is the pass or a swipe. The next card is in
    // the fan, blurred and out of the accessibility tree.
    expect(screen.queryByRole("button", { name: "Next person" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Skip Ada" })).toBeNull();
    expect(screen.getByRole("button", { name: "Previous person" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Skip Prince" }));
    expect(screen.getByRole("button", { name: "Skip Ada" })).toBeEnabled();
    // Prince's card is behind the front one now, and a card behind is hidden
    // from the accessibility tree as the file marks it.
    expect(screen.queryByRole("button", { name: "Skip Prince" })).toBeNull();
    expect(screen.getByRole("button", { name: "Previous person" })).toBeEnabled();
  });
});

// The page follows the rail's switch and nothing else: a hidden square has
// no page, the same way it has no rail entry. It does not read the
// portfolio's SQUARE_SECTIONS_HIDDEN.
describe("SquareHome while the square is hidden", () => {
  it("renders nothing", async () => {
    vi.resetModules();
    vi.doMock("@/lib/market-square", () => ({
      MARKET_SQUARE_HIDDEN: true,
      SQUARE_SECTIONS_HIDDEN: true,
      MARKET_SQUARE_URL: "https://square.test",
      marketSquareHref: () => "https://square.test",
    }));
    const { SquareHome: Hidden } = await import("./square-home");
    const { container } = render(<Hidden markets={[]} />, { wrapper });
    expect(container).toBeEmptyDOMElement();
    expect(reads.fetchLiveStreams).not.toHaveBeenCalled();
  });
});

// The Square's comments sheet on the Square's post card: the thread with
// its replies behind an expander, a heart on each comment, and a reply that
// names who it answers and carries that parent to the service.
describe("the comments sheet", () => {
  it("opens the thread from the tally, expands replies, likes, and replies to a comment", async () => {
    const { fireEvent, within, waitFor } = await import("@testing-library/react");
    render(<SquareHome markets={[]} />, { wrapper });
    await screen.findByText("monthly wrap up");

    fireEvent.click(screen.getByRole("button", { name: "Comments" }));
    const sheet = await screen.findByRole("dialog", { name: "Comments" });
    await within(sheet).findByText("nice one");

    fireEvent.click(within(sheet).getByRole("button", { name: "View 1 reply" }));
    await within(sheet).findByText("thanks");

    // The root's heart sits after its replies in the document, as the
    // Square's row draws it; the reply's heart comes first.
    const hearts = within(sheet).getAllByRole("button", { name: "Like this comment" });
    fireEvent.click(hearts[hearts.length - 1]);
    await waitFor(() => expect(reads.setCommentLike).toHaveBeenCalledWith("c-1", true));

    fireEvent.click(within(sheet).getAllByRole("button", { name: "Reply" })[0]);
    // The field's row says who the reply answers.
    expect(within(sheet).getByText("Replying to").parentElement).toHaveTextContent("@prince");
    const field = within(sheet).getByRole("textbox", { name: "Write a reply to this comment" });
    fireEvent.change(field, { target: { value: "hello" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Post reply to comment" }));
    await within(sheet).findByText("hello");
    expect(reads.addPostComment).toHaveBeenCalledWith("post-1", "hello", "c-1");
  });
});

// Home answers its own search, in place: while the field holds words the
// sections give way to what the Square found, each row opening the thing it
// names in the Square, and clearing the field puts the page back.
describe("the search row", () => {
  it("answers in place and gives the page back when cleared", async () => {
    const { fireEvent } = await import("@testing-library/react");
    render(<SquareHome markets={[]} />, { wrapper });
    await screen.findByText("monthly wrap up");

    const field = screen.getByRole("searchbox", { name: "Search Gistrooms, houses, friends" });
    fireEvent.change(field, { target: { value: "sam" } });
    await screen.findByText("Samuel Yaras");
    expect(reads.searchSquare).toHaveBeenCalledWith("sam", null);
    expect(screen.queryByText("monthly wrap up")).toBeNull();
    expect(headings()).toEqual(["People", "Gist rooms", "Posts", "ARK Store"]);
    expect(screen.getByRole("button", { name: "Follow" })).toBeInTheDocument();
    outbound(
      screen.getByRole("link", { name: "Wink at Samuel Yaras" }),
      "https://square.test/u/samuel"
    );
    outbound(screen.getByRole("link", { name: /Sam's room/ }), "https://square.test/live/st-9");
    outbound(screen.getByRole("link", { name: /sam says hi/ }), "https://square.test/p/p-9");
    outbound(screen.getByRole("link", { name: /Sam tee/ }), "https://square.test/store/sam-tee");

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    await screen.findByText("monthly wrap up");
    expect(screen.queryByText("Samuel Yaras")).toBeNull();
  });

  it("offers the room when the words are a room code", async () => {
    const { fireEvent } = await import("@testing-library/react");
    reads.searchSquare.mockResolvedValue({ items: [], nextCursor: null });
    render(<SquareHome markets={[]} />, { wrapper });
    await screen.findByText("monthly wrap up");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search Gistrooms, houses, friends" }), {
      target: { value: "bcd-2345-fg" },
    });
    outbound(
      await screen.findByRole("link", { name: /Open this room/ }),
      "https://square.test/code/bcd2345fg"
    );
    expect(screen.getByText("bcd-2345-fg")).toBeInTheDocument();
    expect(screen.queryByText("Nothing matched")).toBeNull();
  });
});
