import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pageNameForPath, pageNameForSection } from "@/lib/analytics/page-name";

// A hand-rolled mock, not vi.fn() defaults, so every assertion below reads
// straight off calls the module actually made.
const init = vi.fn();
const identify = vi.fn();
const peopleSet = vi.fn();
const peopleSetOnce = vi.fn();
const peopleIncrement = vi.fn();
const peopleUnion = vi.fn();
const reset = vi.fn();
const track = vi.fn();
const register = vi.fn();
const hasOptedOut = vi.fn(() => false);

vi.mock("mixpanel-browser", () => ({
  default: {
    init,
    identify,
    people: {
      set: peopleSet,
      set_once: peopleSetOnce,
      increment: peopleIncrement,
      union: peopleUnion,
    },
    reset,
    track,
    register,
    has_opted_out_tracking: hasOptedOut,
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
  peopleSetOnce.mockClear();
  peopleIncrement.mockClear();
  peopleUnion.mockClear();
  reset.mockClear();
  track.mockClear();
  register.mockClear();
  hasOptedOut.mockClear();
  hasOptedOut.mockReturnValue(false);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("without a configured token", () => {
  it("never reaches the SDK", async () => {
    const {
      initAnalytics,
      analyticsReady,
      identifyUser,
      resetAnalytics,
      track: send,
      setSuper,
    } = await loadWithToken(undefined);
    initAnalytics();
    await analyticsReady();
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
  it("initializes once, with DNT honoured", async () => {
    const { initAnalytics, analyticsReady } = await loadWithToken("test_token");
    initAnalytics();
    await analyticsReady();
    initAnalytics();
    await analyticsReady();
    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith("test_token", expect.objectContaining({ ignore_dnt: false }));
  });

  it("keeps autocapture off, so only the named catalog is reported", async () => {
    const { initAnalytics, analyticsReady } = await loadWithToken("test_token");
    initAnalytics();
    await analyticsReady();
    expect(init).toHaveBeenCalledWith(
      "test_token",
      expect.objectContaining({ autocapture: false })
    );
  });

  it("says so when the browser is opted out, rather than going quietly silent", async () => {
    // Do Not Track disables the SDK and Mixpanel persists that, so the browser
    // stays silent on later visits. Without this line that is indistinguishable
    // from a broken integration.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    hasOptedOut.mockReturnValue(true);
    const { initAnalytics, analyticsReady } = await loadWithToken("test_token");
    initAnalytics();
    await analyticsReady();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("opted out of tracking"));
    warn.mockRestore();
  });

  it("keeps an event fired before the SDK finished loading", async () => {
    // The SDK is fetched on demand now, and boot order puts a page_view on the
    // line after initAnalytics(). Without the queue that event is dropped on
    // every single session, silently.
    const { initAnalytics, analyticsReady, track: send } = await loadWithToken("test_token");
    initAnalytics();
    send("withdraw_opened");
    expect(track).not.toHaveBeenCalled();

    await analyticsReady();
    expect(track).toHaveBeenCalledWith("withdraw_opened", undefined);
  });

  it("boots even if the SDK has no opt-out method to ask", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    hasOptedOut.mockImplementation(() => {
      throw new Error("not available");
    });
    const { initAnalytics, analyticsReady, track: send } = await loadWithToken("test_token");
    expect(() => initAnalytics()).not.toThrow();
    await analyticsReady();
    send("withdraw_opened");
    expect(track).toHaveBeenCalledWith("withdraw_opened", undefined);
    warn.mockRestore();
  });

  it("identifies by the EVM wallet address", async () => {
    const { initAnalytics, analyticsReady, identifyUser } = await loadWithToken("test_token");
    initAnalytics();
    await analyticsReady();
    identifyUser("0x1111111111111111111111111111111111111111", { $email: "a@b.com" });
    expect(identify).toHaveBeenCalledWith("0x1111111111111111111111111111111111111111");
    expect(peopleSet).toHaveBeenCalledWith({ $email: "a@b.com" });
  });

  it("ignores an identify with no address, so anonymous events stay mergeable", async () => {
    const { initAnalytics, analyticsReady, identifyUser } = await loadWithToken("test_token");
    initAnalytics();
    await analyticsReady();
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
    const { initAnalytics, analyticsReady, track: send } = await loadWithToken("test_token");
    initAnalytics();
    await analyticsReady();
    send("fund_method_selected", { method: "bank" });
    expect(track).toHaveBeenCalledWith("fund_method_selected", { method: "bank" });
  });

  it("registers super properties", async () => {
    const { initAnalytics, analyticsReady, setSuper } = await loadWithToken("test_token");
    initAnalytics();
    await analyticsReady();
    setSuper({ platform: "web", has_deposited: false });
    expect(register).toHaveBeenCalledWith({ platform: "web", has_deposited: false });
  });

  it("resets the local identity", async () => {
    const { initAnalytics, analyticsReady, resetAnalytics } = await loadWithToken("test_token");
    initAnalytics();
    await analyticsReady();
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
    const { initAnalytics, analyticsReady, track: send } = await loadWithToken("test_token");
    initAnalytics();
    await analyticsReady();
    send("withdraw_completed", {
      method: "bank",
      asset: "USDC",
      amount_usd: 25,
      amount_ngn: 33712.5,
      fx_rate: 1348.5,
      bank: "Rubies MFB",
      fee_ngn: undefined,
    });
    expect(track).toHaveBeenCalledWith("withdraw_completed", {
      method: "bank",
      asset: "USDC",
      amount_usd: 25,
      amount_ngn: 33712.5,
      fx_rate: 1348.5,
      bank: "Rubies MFB",
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
      analyticsReady,
      track: send,
      setSuper,
      identifyUser,
    } = await loadWithToken("test_token");
    initAnalytics();
    await analyticsReady();
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

describe("profile totals derived from events", () => {
  it("counts a completed trade and adds its volume and vertical", async () => {
    const { initAnalytics, analyticsReady, track: send } = await loadWithToken("test-token");
    initAnalytics();
    await analyticsReady();

    send("trade_completed", {
      vertical: "spot",
      asset: "ETH",
      side: "buy",
      amount_usd: 25,
    });

    expect(peopleIncrement).toHaveBeenCalledWith({ trade_count: 1, total_volume_usd: 25 });
    expect(peopleUnion).toHaveBeenCalledWith({ verticals_used: ["spot"] });
  });

  it("records the first deposit once, and the running total every time", async () => {
    const { initAnalytics, analyticsReady, track: send } = await loadWithToken("test-token");
    initAnalytics();
    await analyticsReady();

    send("deposit_completed", {
      method: "bank",
      amount_ngn: 40000,
      amount_usd: 25,
      fx_rate: 1600,
      provider: "GTB",
    });

    expect(peopleIncrement).toHaveBeenCalledWith({ total_deposit_usd: 25 });
    expect(peopleSet).toHaveBeenCalledWith({ has_deposited: true });
    // set_once, so a later deposit cannot overwrite which one was first.
    expect(peopleSetOnce).toHaveBeenCalledWith(
      expect.objectContaining({ first_deposit_method: "bank" })
    );
  });

  it("takes the first deposit's rail off the event, not off its name", async () => {
    // Both rails send the same event now. The method property is the only
    // thing that knows which one it was, so a hardcoded default here would
    // put every user's first deposit on the wrong rail.
    const { initAnalytics, analyticsReady, track: send } = await loadWithToken("test-token");
    initAnalytics();
    await analyticsReady();

    send("deposit_completed", {
      method: "crypto",
      source_network: "base-mainnet",
      amount_usd: 25,
    });

    expect(peopleSetOnce).toHaveBeenCalledWith(
      expect.objectContaining({ first_deposit_method: "crypto" })
    );
  });

  it("counts one Naira deposit once", async () => {
    // The bank rail used to have an event of its own, and a Naira deposit
    // fired both it and deposit_completed: the same money added to the
    // lifetime total twice.
    const { initAnalytics, analyticsReady, track: send } = await loadWithToken("test-token");
    initAnalytics();
    await analyticsReady();

    send("deposit_completed", {
      method: "bank",
      amount_ngn: 5000,
      amount_usd: 3.448275,
      fx_rate: 1450,
      provider: "Rubies MFB",
    });

    const totals = peopleIncrement.mock.calls.filter(
      ([props]) => (props as Record<string, unknown>).total_deposit_usd != null
    );
    expect(totals).toHaveLength(1);
  });

  it("leaves the profile alone for an event that implies no total", async () => {
    const { initAnalytics, analyticsReady, track: send } = await loadWithToken("test-token");
    initAnalytics();
    await analyticsReady();

    send("page_view", { page: "portfolio" });

    expect(peopleIncrement).not.toHaveBeenCalled();
    expect(peopleUnion).not.toHaveBeenCalled();
  });

  it("does not spend a request on a zero amount", async () => {
    const { initAnalytics, analyticsReady, track: send } = await loadWithToken("test-token");
    initAnalytics();
    await analyticsReady();

    // A free trade still counts as a trade, but zero volume moves nothing.
    send("trade_completed", { vertical: "spot", asset: "ETH", side: "buy", amount_usd: 0 });

    expect(peopleIncrement).toHaveBeenCalledWith({ trade_count: 1 });
  });
});

describe("withdrawal recipients", () => {
  it("carries the destination address on a crypto withdrawal", async () => {
    const { initAnalytics, analyticsReady, track: send } = await loadWithToken("test-token");
    initAnalytics();
    await analyticsReady();

    send("withdraw_completed", {
      method: "wallet",
      asset: "USDC",
      amount_usd: 50,
      network: "base",
      recipient_address: "0x1111111111111111111111111111111111111111",
    });

    expect(track).toHaveBeenCalledWith(
      "withdraw_completed",
      expect.objectContaining({
        recipient_address: "0x1111111111111111111111111111111111111111",
      })
    );
  });

  it("sends no recipient on a bank withdrawal", async () => {
    const { initAnalytics, analyticsReady, track: send } = await loadWithToken("test-token");
    initAnalytics();
    await analyticsReady();

    // A bank recipient is an account number, which must never be sent. The
    // property is simply absent rather than blanked, so this asserts the key
    // is missing entirely.
    send("withdraw_completed", {
      method: "bank",
      asset: "USDC",
      amount_usd: 50,
      amount_ngn: 67425,
      fx_rate: 1348.5,
      bank: "Rubies MFB",
    });

    const [, props] = track.mock.calls.at(-1) as [string, Record<string, unknown>];
    expect(props).not.toHaveProperty("recipient_address");
  });
});

describe("catalog enforcement", () => {
  // TypeScript blocks a malformed payload at every real call site, so the only
  // way to reach the runtime check is to go around the overloads, which is what
  // a value asserted from an API response effectively does.
  type Loose = (name: string, props: Record<string, unknown>) => void;

  it("fails outside production, rather than sending a quoted number", async () => {
    const { initAnalytics, analyticsReady, track: send } = await loadWithToken("test-token");
    initAnalytics();
    await analyticsReady();

    expect(() =>
      (send as unknown as Loose)("deposit_completed", {
        method: "bank",
        amount_usd: 3.448275,
        amount_ngn: "5000",
        fx_rate: 1450,
        provider: "Rubies MFB",
      })
    ).toThrow(/unquoted number/);
    expect(track).not.toHaveBeenCalled();
  });

  it("fails on a property the catalog does not declare", async () => {
    const { initAnalytics, analyticsReady, track: send } = await loadWithToken("test-token");
    initAnalytics();
    await analyticsReady();

    expect(() => (send as unknown as Loose)("withdraw_opened", { amount_usd: 25 })).toThrow(
      /unknown property/
    );
  });

  it("reports instead of throwing in production", async () => {
    // A user's deposit must not break because a property was misspelled. The
    // violation is still said out loud, because one that reached real traffic
    // is worth finding.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "production");
    const { initAnalytics, analyticsReady, track: send } = await loadWithToken("test-token");
    initAnalytics();
    await analyticsReady();

    expect(() => (send as unknown as Loose)("withdraw_opened", { amount_usd: 25 })).not.toThrow();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("unknown property"));
    expect(track).toHaveBeenCalled();
    error.mockRestore();
  });
});
