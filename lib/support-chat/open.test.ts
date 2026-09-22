import { describe, expect, it, vi } from "vitest";
import { onOpenSupportChat, openSupportChat } from "@/lib/support-chat/open";

describe("openSupportChat", () => {
  it("tells a subscribed widget to open", () => {
    const open = vi.fn();
    const off = onOpenSupportChat(open);
    openSupportChat();
    expect(open).toHaveBeenCalledTimes(1);
    off();
  });

  // The menu can be pressed on a route where the shell, and so the widget, is
  // not mounted. Asking must not throw there.
  it("does nothing when no widget is listening", () => {
    expect(() => openSupportChat()).not.toThrow();
  });

  it("stops telling a widget that has unmounted", () => {
    const open = vi.fn();
    onOpenSupportChat(open)();
    openSupportChat();
    expect(open).not.toHaveBeenCalled();
  });

  // A remount during a fast refresh can leave two subscribed for a tick; both
  // should hear it rather than one silently winning.
  it("tells every listener", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = onOpenSupportChat(a);
    const offB = onOpenSupportChat(b);
    openSupportChat();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    offA();
    offB();
  });
});
