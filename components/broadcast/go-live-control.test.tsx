import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const gate = vi.hoisted(() => ({ signedIn: false, asked: [] as string[] }));
vi.mock("@/hooks/use-require-session", () => ({
  useRequireSession: () => (action: string) => {
    if (gate.signedIn) return true;
    gate.asked.push(action);
    return false;
  },
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/casino" }));
vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({ profile: { name: "visitor" } }),
}));
vi.mock("@/components/broadcast/broadcast-session", () => ({
  useBroadcastSession: () => ({ live: false }),
}));
vi.mock("@/components/broadcast/share-flow", () => ({
  ShareFlow: () => <div>share flow</div>,
}));

import { GoLiveControl } from "@/components/broadcast/go-live-control";

describe("GoLiveControl without a session", () => {
  it("asks for a sign-in and opens no share flow", () => {
    render(<GoLiveControl variant="rail" />);
    fireEvent.click(screen.getByRole("button", { name: "Go Live" }));
    expect(gate.asked).toEqual(["broadcast"]);
    expect(screen.queryByText("share flow")).toBeNull();
  });
});
