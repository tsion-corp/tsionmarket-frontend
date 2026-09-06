import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { RQ_PERSIST_KEY } from "@/lib/query-persist";

const privy = vi.hoisted(() => ({
  state: { ready: false, authenticated: false },
}));

const query = vi.hoisted(() => ({
  clear: vi.fn(),
}));

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => privy.state,
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ clear: query.clear }),
}));

import { SessionCacheGuard } from "@/components/providers/session-cache-guard";

function setSession(ready: boolean, authenticated: boolean) {
  privy.state = { ready, authenticated };
}

describe("SessionCacheGuard", () => {
  beforeEach(() => {
    query.clear.mockReset();
    window.localStorage.setItem(RQ_PERSIST_KEY, '{"clientState":"previous user"}');
  });

  it("leaves the cache alone while Privy is still deciding", () => {
    setSession(false, false);
    render(<SessionCacheGuard />);

    expect(query.clear).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(RQ_PERSIST_KEY)).not.toBeNull();
  });

  it("leaves the cache alone for a signed-in session", () => {
    setSession(true, true);
    render(<SessionCacheGuard />);

    expect(query.clear).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(RQ_PERSIST_KEY)).not.toBeNull();
  });

  it("empties memory and storage once the session is known to be signed out", () => {
    setSession(true, false);
    render(<SessionCacheGuard />);

    expect(query.clear).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(RQ_PERSIST_KEY)).toBeNull();
  });

  it("clears on sign-out, not only on a cold signed-out load", () => {
    setSession(true, true);
    const view = render(<SessionCacheGuard />);
    expect(query.clear).not.toHaveBeenCalled();

    setSession(true, false);
    view.rerender(<SessionCacheGuard />);

    expect(query.clear).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(RQ_PERSIST_KEY)).toBeNull();
  });
});
