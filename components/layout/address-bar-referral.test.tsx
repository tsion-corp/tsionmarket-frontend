import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  code: "adaeze" as string | null,
  pathname: "/prediction/local",
  search: "event=x",
}));
vi.mock("@/hooks/use-referral-code", () => ({ useReferralCode: () => state.code }));
vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(state.search),
}));

import { AddressBarReferral } from "./address-bar-referral";

// The bar is written with replaceState, never a navigation, and only when it
// actually differs, so the effect cannot loop on its own write.
describe("AddressBarReferral", () => {
  const replace = vi.fn();

  beforeEach(() => {
    replace.mockReset();
    vi.spyOn(window.history, "replaceState").mockImplementation(replace);
    state.code = "adaeze";
    state.pathname = "/prediction/local";
    state.search = "event=x";
    window.history.pushState(null, "", `${state.pathname}?${state.search}`);
    replace.mockReset();
  });

  it("writes the user's code onto the address, keeping the rest", () => {
    render(<AddressBarReferral />);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0][2]).toBe("/prediction/local?event=x&ref=adaeze");
  });

  it("does nothing when the address already carries the code", () => {
    state.search = "event=x&ref=adaeze";
    window.history.pushState(null, "", `${state.pathname}?${state.search}`);
    replace.mockReset();
    render(<AddressBarReferral />);
    expect(replace).not.toHaveBeenCalled();
  });

  it("writes nothing while there is no code (signed out, or not loaded)", () => {
    state.code = null;
    render(<AddressBarReferral />);
    expect(replace).not.toHaveBeenCalled();
  });

  it.each(["/auth", "/interests", "/legacy-export", "/r/adaeze"])("leaves %s alone", (path) => {
    state.pathname = path;
    state.search = "";
    window.history.pushState(null, "", path);
    replace.mockReset();
    render(<AddressBarReferral />);
    expect(replace).not.toHaveBeenCalled();
  });
});
