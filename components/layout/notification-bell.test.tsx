import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NotificationBell } from "./notification-bell";
import type { InboxNotification } from "@/lib/notifications/types";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, onClick }: React.ComponentProps<"a">) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}));

let mockItems: unknown[] = [];
let mockLoading = false;
vi.mock("@/features/activity/hooks/use-activity", () => ({
  BELL_POLL_MS: 600_000,
  useActivity: () => ({ items: mockItems, loading: mockLoading }),
}));

const routerPush = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: routerPush }) }));

const inbox = vi.hoisted(() => ({
  items: [] as InboxNotification[],
  unreadCount: 0,
  hasMore: false,
  loadMore: vi.fn(),
  isLoadingMore: false,
  markRead: vi.fn(async () => {}),
  markAllRead: vi.fn(async () => {}),
  isLoading: false,
  error: null as unknown,
  refetch: vi.fn(),
}));
vi.mock("@/hooks/use-notification-inbox", () => ({ useNotificationInbox: () => inbox }));

const push = vi.hoisted(() => ({
  state: "unsupported" as string,
  error: null as string | null,
  enable: vi.fn(async () => {}),
  disable: vi.fn(async () => {}),
  retry: vi.fn(),
}));
vi.mock("@/hooks/use-push-subscription", () => ({ usePushSubscription: () => push }));

function notification(over: Partial<InboxNotification> = {}): InboxNotification {
  return {
    id: "n1",
    campaignId: "c1",
    title: "Season two is live",
    body: "Trading contests start today.",
    url: "/perps",
    imageUrl: null,
    readAt: null,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    ...over,
  };
}

// Dated ahead of the read marker the bell seeds on mount, so it counts as
// unread whatever the stored marker says.
function unreadActivity() {
  return {
    id: "a1",
    kind: "deposited",
    symbol: "USDC",
    network: "base-mainnet",
    direction: "in",
    amount: 12,
    timestamp: Date.now() + 60_000,
    logo: null,
  };
}

function openBell() {
  fireEvent.click(screen.getByLabelText("notifications"));
}

describe("NotificationBell", () => {
  beforeEach(() => {
    mockItems = [];
    mockLoading = false;
    window.localStorage.clear();
    routerPush.mockClear();
    inbox.items = [];
    inbox.unreadCount = 0;
    inbox.hasMore = false;
    inbox.isLoading = false;
    inbox.error = null;
    inbox.markRead.mockClear();
    inbox.markAllRead.mockClear();
    inbox.loadMore.mockClear();
    inbox.refetch.mockClear();
    push.state = "unsupported";
    push.error = null;
    push.enable.mockClear();
    push.disable.mockClear();
    push.retry.mockClear();
  });

  it("renders nothing extra when closed", () => {
    render(<NotificationBell />);
    expect(screen.queryByText("emptyTitle")).toBeNull();
  });

  it("opens the panel on click and shows the empty state", () => {
    render(<NotificationBell />);
    openBell();
    expect(screen.getByText("emptyTitle")).toBeInTheDocument();
  });

  it("plays an exit animation instead of vanishing instantly on close", async () => {
    // Regression guard: the panel used to sit behind a bare `{open ? (...) :
    // null}`, unmounting with no closing frame. It must now stay in the DOM
    // through AnimatePresence's exit before it is finally removed.
    render(<NotificationBell />);
    openBell();
    expect(screen.getByText("emptyTitle")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument());
  });

  it("closes on click outside", async () => {
    render(<NotificationBell />);
    openBell();
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument());
  });

  it("closes on Escape", async () => {
    render(<NotificationBell />);
    openBell();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument());
  });

  it("shows the loading state while activity is still being fetched", () => {
    mockLoading = true;
    render(<NotificationBell />);
    openBell();
    expect(screen.getByText("loading")).toBeInTheDocument();
  });

  it("shows the notification inbox above the activity list", () => {
    inbox.items = [notification()];
    render(<NotificationBell />);
    openBell();

    const notifications = screen.getByText("title");
    const activity = screen.getByText("activity");
    expect(screen.getByText("Season two is live")).toBeInTheDocument();
    expect(screen.getByText("emptyTitle")).toBeInTheDocument();
    expect(notifications.compareDocumentPosition(activity)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("shows the inbox empty state without touching the activity one", () => {
    render(<NotificationBell />);
    openBell();
    expect(screen.getByText("empty")).toBeInTheDocument();
    expect(screen.getByText("emptyTitle")).toBeInTheDocument();
  });

  it("adds the server's unread count to the unread activity count in the badge", () => {
    mockItems = [unreadActivity()];
    inbox.unreadCount = 2;
    render(<NotificationBell />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("badges the inbox on its own when no activity is unread", () => {
    inbox.unreadCount = 4;
    render(<NotificationBell />);
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("does not mark notifications read just because the panel was opened", () => {
    inbox.items = [notification()];
    inbox.unreadCount = 1;
    render(<NotificationBell />);
    openBell();
    expect(inbox.markRead).not.toHaveBeenCalled();
    expect(inbox.markAllRead).not.toHaveBeenCalled();
  });

  it("marks one row read and routes to an in-app destination", () => {
    inbox.items = [notification({ url: "/perps" })];
    render(<NotificationBell />);
    openBell();
    fireEvent.click(screen.getByText("Season two is live"));

    expect(inbox.markRead).toHaveBeenCalledWith(["n1"]);
    expect(routerPush).toHaveBeenCalledWith("/perps");
  });

  it("opens an external destination in a new tab with no opener", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    inbox.items = [notification({ url: "https://docs.example.com/season-two" })];
    render(<NotificationBell />);
    openBell();
    fireEvent.click(screen.getByText("Season two is live"));

    expect(open).toHaveBeenCalledWith(
      "https://docs.example.com/season-two",
      "_blank",
      "noopener,noreferrer"
    );
    expect(routerPush).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it("renders a refused destination as plain text and goes nowhere", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    inbox.items = [notification({ url: "javascript:alert(1)" })];
    render(<NotificationBell />);
    openBell();
    fireEvent.click(screen.getByText("Season two is live"));

    expect(routerPush).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(inbox.markRead).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it("does not mark a row that was already read", () => {
    inbox.items = [notification({ readAt: new Date().toISOString() })];
    render(<NotificationBell />);
    openBell();
    fireEvent.click(screen.getByText("Season two is live"));

    expect(inbox.markRead).not.toHaveBeenCalled();
    expect(routerPush).toHaveBeenCalledWith("/perps");
  });

  it("marks everything read from the section header", () => {
    inbox.items = [notification()];
    inbox.unreadCount = 1;
    render(<NotificationBell />);
    openBell();
    fireEvent.click(screen.getByText("markAllRead"));

    expect(inbox.markAllRead).toHaveBeenCalledTimes(1);
  });

  it("offers mark all read only while something is unread", () => {
    inbox.items = [notification({ readAt: new Date().toISOString() })];
    render(<NotificationBell />);
    openBell();
    expect(screen.queryByText("markAllRead")).toBeNull();
  });

  it("asks for older rows only when the server said there are more", () => {
    inbox.items = [notification()];
    inbox.hasMore = true;
    render(<NotificationBell />);
    openBell();
    fireEvent.click(screen.getByText("loadMore"));
    expect(inbox.loadMore).toHaveBeenCalledTimes(1);
  });

  it("offers a retry when the inbox could not be read", () => {
    inbox.error = new Error("nope");
    render(<NotificationBell />);
    openBell();
    expect(screen.getByText("error")).toBeInTheDocument();
    fireEvent.click(screen.getByText("retry"));
    expect(inbox.refetch).toHaveBeenCalledTimes(1);
  });

  it("offers the soft ask only when push can actually be turned on", () => {
    push.state = "prompt";
    render(<NotificationBell />);
    openBell();
    expect(screen.getByText("enableTitle")).toBeInTheDocument();
    fireEvent.click(screen.getByText("enable"));
    expect(push.enable).toHaveBeenCalledTimes(1);
  });

  it("offers turning push off once it is on", () => {
    push.state = "enabled";
    render(<NotificationBell />);
    openBell();
    expect(screen.queryByText("enableTitle")).toBeNull();
    fireEvent.click(screen.getByText("disable"));
    expect(push.disable).toHaveBeenCalledTimes(1);
  });

  it("explains a blocked browser instead of asking again", () => {
    push.state = "blocked";
    render(<NotificationBell />);
    openBell();
    expect(screen.getByText("blockedTitle")).toBeInTheDocument();
    expect(screen.queryByText("enable")).toBeNull();
  });

  it("says nothing about push on a browser that cannot do it", () => {
    push.state = "unsupported";
    render(<NotificationBell />);
    openBell();
    expect(screen.queryByText("enableTitle")).toBeNull();
    expect(screen.queryByText("unavailableTitle")).toBeNull();
  });

  it("offers a retry when turning push on failed", () => {
    push.state = "failed";
    push.error = "failed";
    render(<NotificationBell />);
    openBell();
    expect(screen.getByText("failed")).toBeInTheDocument();
    fireEvent.click(screen.getByText("retry"));
    expect(push.retry).toHaveBeenCalledTimes(1);
  });
});
