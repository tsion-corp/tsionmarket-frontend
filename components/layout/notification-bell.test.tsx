import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NotificationBell } from "./notification-bell";

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

function openBell() {
  fireEvent.click(screen.getByLabelText("notifications"));
}

describe("NotificationBell", () => {
  beforeEach(() => {
    mockItems = [];
    mockLoading = false;
    window.localStorage.clear();
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
});
