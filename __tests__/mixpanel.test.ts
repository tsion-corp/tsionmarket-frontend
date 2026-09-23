// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { campaignTags, pageNameForPath, pageNameForSection } from "@/lib/analytics/page-name";

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
const getProperty = vi.fn<(name: string) => unknown>(() => undefined);

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
    get_property: getProperty,
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
  getProperty.mockReset();
  getProperty.mockReturnValue(undefined);
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

  it("sends events through our own origin, on neutral paths, not straight to Mixpanel", async () => {
    // Ad blockers drop requests to api-js.mixpanel.com, and filter lists match
    // words like "track" in paths on any host. app/api/relay forwards them to
    // the project's EU ingestion host.
    const { initAnalytics, analyticsReady } = await loadWithToken("test_token");
    initAnalytics();
    await analyticsReady();
    expect(init).toHaveBeenCalledWith(
      "test_token",
      expect.objectContaining({
        api_host: `${window.location.origin}/api/relay`,
        api_routes: expect.objectContaining({ track: "e", engage: "p", groups: "g" }),
      })
    );
  });

  it("labels every event with the environment it came from", async () => {
    // One project serves production, previews and local builds, so reports
    // that count real people filter on this.
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");
    const { initAnalytics, analyticsReady } = await loadWithToken("test_token");
    initAnalytics();
    await analyticsReady();
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ environment: "preview" }));
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

  it("lowercases the address, as the catalog specifies", async () => {
    // Mixpanel's distinct_id is case-sensitive, so this is not cosmetic: a
    // checksummed id and a lowercase one are two different people. Lowercasing
    // happens in identifyUser and nowhere else, so one convention holds across
    // every caller.
    const { initAnalytics, analyticsReady, identifyUser } = await loadWithToken("test_token");
    initAnalytics();
    await analyticsReady();
    identifyUser("0xAbC1111111111111111111111111111111111111");
    expect(identify).toHaveBeenCalledWith("0xabc1111111111111111111111111111111111111");
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
    // The Square page is a nav section of its own now, and reports as such.
    expect(pageNameForSection("square")).toBe("market_square");
  });

  it("names the landing pages, which is where campaign links point", () => {
    expect(pageNameForPath("/")).toBe("landing");
    expect(pageNameForPath("/welcome")).toBe("welcome");
    // Every page reports itself now, not only the nav sections.
    expect(pageNameForPath("/auth")).toBe("auth");
    expect(pageNameForPath("/dashboard")).toBe("portfolio");
  });

  it("names each Arkade game rather than lumping them together", () => {
    // "Which game" is the question asked of Arkade most often, and a single
    // arkade row cannot answer it.
    expect(pageNameForPath("/casino")).toBe("arkade");
    expect(pageNameForPath("/casino/chess/play")).toBe("arkade_chess");
    expect(pageNameForPath("/casino/arkjet")).toBe("arkade_arkjet");
    expect(pageNameForPath("/casino/last-standing/42")).toBe("arkade_last_man");
  });

  it("returns no name for a route nobody has mapped", () => {
    // Not a reason to drop the event: page_view still carries the raw path.
    expect(pageNameForPath("/some/unmapped/route")).toBeNull();
  });

  it("resolves the square page to its section", () => {
    expect(pageNameForPath("/square")).toBe("market_square");
  });

  it("resolves a nested route to its section", () => {
    expect(pageNameForPath("/casino/checkers/play")).toBe("arkade_checkers");
    // A market inside prediction is its own page; the index is not.
    expect(pageNameForPath("/prediction")).toBe("prediction");
    expect(pageNameForPath("/prediction/event/abc")).toBe("prediction_market");
    expect(pageNameForPath("/earn/sponsor/new")).toBe("earn");
    expect(pageNameForPath("/earn/listing/abc")).toBe("earn_listing");
  });

  it("reads the campaign tags off the url being viewed", () => {
    // The SDK only ever sees the URL the session booted on, so a campaign link
    // clicked part-way through a session would otherwise go unattributed.
    expect(campaignTags("?utm_source=x&utm_campaign=launch")).toEqual({
      utm_source: "x",
      utm_campaign: "launch",
    });
    // Absent tags are left out rather than sent as empty strings.
    expect(campaignTags("?utm_source=&foo=bar")).toEqual({});
    expect(campaignTags("")).toEqual({});
  });

  it("names the pages that are not nav sections too", () => {
    // page_view covers the whole app now, so the sign-in page and the landing
    // page are pages in their own right rather than gaps in the data.
    expect(pageNameForPath("/auth")).toBe("auth");
    expect(pageNameForPath("/interests")).toBe("interests");
    expect(pageNameForPath("/")).toBe("landing");
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
      amount_source: "fill",
    });

    expect(peopleIncrement).toHaveBeenCalledWith({ trade_count: 1, total_volume_usd: 25 });
    expect(peopleUnion).toHaveBeenCalledWith({ verticals_used: ["spot"] });
  });

  it("records the first deposit once, and the running total every time", async () => {
    const { initAnalytics, analyticsReady, track: send } = await loadWithToken("test-token");
    initAnalytics();
    await analyticsReady();

    send("bank_transfer_completed", {
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

  it("takes the first deposit's rail off the event name", async () => {
    // The rails have separate names again, so the name is the only thing that
    // knows which one it was. A hardcoded default would put every user's
    // first deposit on the wrong rail.
    const { initAnalytics, analyticsReady, track: send } = await loadWithToken("test-token");
    initAnalytics();
    await analyticsReady();

    send("deposit_completed", {
      network: "base-mainnet",
      asset: "USDC",
      amount_usd: 25,
    });

    expect(peopleSetOnce).toHaveBeenCalledWith(
      expect.objectContaining({ first_deposit_method: "crypto" })
    );
  });

  it("counts one Naira deposit once", async () => {
    // The rails have a name each again. A Naira deposit once fired both, and
    // the same money was added to the lifetime total twice; the two are now
    // disjoint, so only one of them can ever fire for a given arrival.
    const { initAnalytics, analyticsReady, track: send } = await loadWithToken("test-token");
    initAnalytics();
    await analyticsReady();

    send("bank_transfer_completed", {
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

    send("page_view", { page: "portfolio", path: "/portfolio" });

    expect(peopleIncrement).not.toHaveBeenCalled();
    expect(peopleUnion).not.toHaveBeenCalled();
  });

  it("does not spend a request on a zero amount", async () => {
    const { initAnalytics, analyticsReady, track: send } = await loadWithToken("test-token");
    initAnalytics();
    await analyticsReady();

    // A free trade still counts as a trade, but zero volume moves nothing.
    send("trade_completed", {
      vertical: "spot",
      asset: "ETH",
      side: "buy",
      amount_usd: 0,
      amount_source: "fill",
    });

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
      (send as unknown as Loose)("bank_transfer_completed", {
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

describe("a previous session's identity", () => {
  it("is cleared when the device still holds an identified user", async () => {
    getProperty.mockImplementation((name: string) => (name === "$user_id" ? "0xAbC" : undefined));
    const { initAnalytics, analyticsReady, resetStaleIdentity } = await loadWithToken("t");
    initAnalytics();
    await analyticsReady();
    resetStaleIdentity();
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("leaves an anonymous device alone, so one visitor's trail is not split", async () => {
    const { initAnalytics, analyticsReady, resetStaleIdentity } = await loadWithToken("t");
    initAnalytics();
    await analyticsReady();
    resetStaleIdentity();
    expect(reset).not.toHaveBeenCalled();
  });
});
