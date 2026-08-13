import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pageNameForPath, pageNameForSection } from "@/lib/analytics/page-name";

// A hand-rolled mock, not vi.fn() defaults, so every assertion below reads
// straight off calls the module actually made.
const init = vi.fn();
const identify = vi.fn();
const peopleSet = vi.fn();
const reset = vi.fn();
const track = vi.fn();
const register = vi.fn();

vi.mock("mixpanel-browser", () => ({
  default: {
    init,
    identify,
    people: { set: peopleSet },
    reset,
    track,
    register,
  },
}));

// The module reads NEXT_PUBLIC_MIXPANEL_TOKEN and caches "initialized" at
// module scope, so each scenario needs its own fresh import.
async function loadWithToken(token: string | undefined) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_MIXPANEL_TOKEN", token as string);
  return import("@/lib/analytics/mixpanel");
}

beforeEach(() => {
  init.mockClear();
  identify.mockClear();
  peopleSet.mockClear();
  reset.mockClear();
  track.mockClear();
  register.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("without a configured token", () => {
  it("never reaches the SDK", async () => {
    const {
      initAnalytics,
      identifyUser,
      resetAnalytics,
      track: send,
      setSuper,
    } = await loadWithToken(undefined);
    initAnalytics();
    identifyUser("0xabc");
    resetAnalytics();
    setSuper({ platform: "web" });
    send("withdraw_opened");
    expect(init).not.toHaveBeenCalled();
    expect(identify).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });
});

describe("with a configured token", () => {
  it("initializes once, with autocapture and DNT honoured", async () => {
    const { initAnalytics } = await loadWithToken("test_token");
    initAnalytics();
    initAnalytics();
    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith(
      "test_token",
      expect.objectContaining({ autocapture: true, ignore_dnt: false })
    );
  });

  it("identifies by the EVM wallet address", async () => {
    const { initAnalytics, identifyUser } = await loadWithToken("test_token");
    initAnalytics();
    identifyUser("0x1111111111111111111111111111111111111111", { $email: "a@b.com" });
    expect(identify).toHaveBeenCalledWith("0x1111111111111111111111111111111111111111");
    expect(peopleSet).toHaveBeenCalledWith({ $email: "a@b.com" });
  });

  it("ignores an identify with no address, so anonymous events stay mergeable", async () => {
    const { initAnalytics, identifyUser } = await loadWithToken("test_token");
    initAnalytics();
    identifyUser("");
    expect(identify).not.toHaveBeenCalled();
  });

  it("does nothing before initAnalytics has run", async () => {
    const { identifyUser, track: send } = await loadWithToken("test_token");
    identifyUser("0xabc");
    send("withdraw_opened");
    expect(identify).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  it("tracks an event with its properties", async () => {
    const { initAnalytics, track: send } = await loadWithToken("test_token");
    initAnalytics();
    send("fund_method_selected", { method: "bank" });
    expect(track).toHaveBeenCalledWith("fund_method_selected", { method: "bank" });
  });

  it("registers super properties", async () => {
    const { initAnalytics, setSuper } = await loadWithToken("test_token");
    initAnalytics();
    setSuper({ platform: "web", has_deposited: false });
    expect(register).toHaveBeenCalledWith({ platform: "web", has_deposited: false });
  });

  it("resets the local identity", async () => {
    const { initAnalytics, resetAnalytics } = await loadWithToken("test_token");
    initAnalytics();
    resetAnalytics();
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe("property compaction", () => {
  it("drops values that carry no information, but keeps false and zero", async () => {
    // A missing figure must be absent, not null or "N/A": those become values
    // in the reports and have to be filtered out of every query afterwards.
    // false and 0 are real answers and have to survive.
    const { __compactForTests: compact } = await loadWithToken("test_token");
    expect(
      compact({
        amount_usd: 0,
        has_tp: false,
        fee_usd: null,
        network: "",
        issuer: undefined,
        apy: Number.NaN,
        asset: "USDC",
      })
    ).toEqual({ amount_usd: 0, has_tp: false, asset: "USDC" });
  });

  it("strips empty properties off a tracked event", async () => {
    const { initAnalytics, track: send } = await loadWithToken("test_token");
    initAnalytics();
    send("withdraw_completed", {
      method: "bank",
      asset: "USDC",
      amount_usd: 25,
      network: undefined,
    });
    expect(track).toHaveBeenCalledWith("withdraw_completed", {
      method: "bank",
      asset: "USDC",
      amount_usd: 25,
    });
  });
});

describe("page names", () => {
  it("maps every nav section to its reported name", () => {
    expect(pageNameForSection("portfolio")).toBe("portfolio");
    // The app and the catalog use different words for these three, which is
    // the whole reason the mapping exists.
    expect(pageNameForSection("perps")).toBe("perpetuals");
    expect(pageNameForSection("meme")).toBe("memecoins");
    expect(pageNameForSection("casino")).toBe("arkade");
    expect(pageNameForSection("activity")).toBe("arktivity");
  });

  it("resolves a nested route to its section", () => {
    expect(pageNameForPath("/casino/checkers/play")).toBe("arkade");
    expect(pageNameForPath("/prediction/event/abc")).toBe("prediction");
    expect(pageNameForPath("/earn/sponsor/new")).toBe("earn");
  });

  it("reports nothing for a route that is not a nav section", () => {
    // Better a missing page_view than one naming a page the catalog has no
    // word for.
    expect(pageNameForPath("/auth")).toBeNull();
    expect(pageNameForPath("/interests")).toBeNull();
    expect(pageNameForPath("/")).toBeNull();
  });
});

describe("failure containment", () => {
  it("never lets an SDK failure escape into the caller", async () => {
    // Several of these calls sit inside mutation success handlers. A throw
    // there would take the navigation or the toast with it, so a broken SDK
    // has to stay contained.
    const {
      initAnalytics,
      track: send,
      setSuper,
      identifyUser,
    } = await loadWithToken("test_token");
    initAnalytics();
    track.mockImplementationOnce(() => {
      throw new Error("sdk exploded");
    });
    register.mockImplementationOnce(() => {
      throw new Error("sdk exploded");
    });
    identify.mockImplementationOnce(() => {
      throw new Error("sdk exploded");
    });

    expect(() => send("withdraw_opened")).not.toThrow();
    expect(() => setSuper({ platform: "web" })).not.toThrow();
    expect(() => identifyUser("0xabc")).not.toThrow();
  });
});
