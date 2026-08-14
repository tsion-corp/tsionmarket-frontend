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
  it("initializes once, with DNT honoured", async () => {
    const { initAnalytics } = await loadWithToken("test_token");
    initAnalytics();
    initAnalytics();
    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith("test_token", expect.objectContaining({ ignore_dnt: false }));
  });

  it("autocaptures activity but never the text inside an element", async () => {
    // capture_text_content is the one that would copy an account number or a
    // document number out of the DOM, so it stays off while the rest is on.
    const { initAnalytics } = await loadWithToken("test_token");
    initAnalytics();
    expect(init).toHaveBeenCalledWith(
      "test_token",
      expect.objectContaining({
        autocapture: expect.objectContaining({
          click: true,
          submit: true,
          capture_text_content: false,
          // Path only: a query string has nothing worth recording and can
          // carry values we would rather not keep.
          pageview: "url-with-path",
        }),
      })
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

describe("profile totals derived from events", () => {
  it("counts a completed trade and adds its volume and vertical", async () => {
    const { initAnalytics, track: send } = await loadWithToken("test-token");
    initAnalytics();

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
    const { initAnalytics, track: send } = await loadWithToken("test-token");
    initAnalytics();

    send("bank_transfer_completed", { amount_ngn: 40000, amount_usd: 25, bank: "GTB" });

    expect(peopleIncrement).toHaveBeenCalledWith({ total_deposit_usd: 25 });
    expect(peopleSet).toHaveBeenCalledWith({ has_deposited: true });
    // set_once, so a later deposit cannot overwrite which one was first.
    expect(peopleSetOnce).toHaveBeenCalledWith(
      expect.objectContaining({ first_deposit_method: "bank" })
    );
  });

  it("leaves the profile alone for an event that implies no total", async () => {
    const { initAnalytics, track: send } = await loadWithToken("test-token");
    initAnalytics();

    send("page_view", { page: "portfolio" });

    expect(peopleIncrement).not.toHaveBeenCalled();
    expect(peopleUnion).not.toHaveBeenCalled();
  });

  it("does not spend a request on a zero amount", async () => {
    const { initAnalytics, track: send } = await loadWithToken("test-token");
    initAnalytics();

    // A free trade still counts as a trade, but zero volume moves nothing.
    send("trade_completed", { vertical: "spot", asset: "ETH", side: "buy", amount_usd: 0 });

    expect(peopleIncrement).toHaveBeenCalledWith({ trade_count: 1 });
  });
});

describe("withdrawal recipients", () => {
  it("carries the destination address on a crypto withdrawal", async () => {
    const { initAnalytics, track: send } = await loadWithToken("test-token");
    initAnalytics();

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
    const { initAnalytics, track: send } = await loadWithToken("test-token");
    initAnalytics();

    // A bank recipient is an account number, which must never be sent. The
    // property is simply absent rather than blanked, so this asserts the key
    // is missing entirely.
    send("withdraw_completed", { method: "bank", asset: "USDC", amount_usd: 50 });

    const [, props] = track.mock.calls.at(-1) as [string, Record<string, unknown>];
    expect(props).not.toHaveProperty("recipient_address");
  });
});
