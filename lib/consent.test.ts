// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

// The one transport, with the session tokens it would attach stubbed as warm.
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  apiFetch: (path: string, init: RequestInit) => fetchMock(path, init),
}));

import {
  DEFAULT_CONSENT,
  EMPTY_CONSENT,
  TERMS_VERSION,
  consentSnapshot,
  markConsentRecorded,
  readConsent,
  recordConsent,
  resetConsentStore,
  setConsent,
  subscribeConsent,
  updateConsent,
  writeConsent,
} from "@/lib/consent";

describe("consent storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetConsentStore();
  });

  // Both boxes start ticked (asked for on 2026-09-11). Nothing is stamped as
  // accepted until the person actually proceeds with the box ticked.
  it("offers both choices ticked until something is stored", () => {
    expect(readConsent()).toEqual(DEFAULT_CONSENT);
    expect(DEFAULT_CONSENT).toMatchObject({ terms: true, marketing: true, acceptedAt: null });
  });

  it("round trips the two choices and stamps the acceptance once", () => {
    const first = updateConsent(EMPTY_CONSENT, { terms: true, marketing: true }, new Date(1000));
    writeConsent(first);
    expect(readConsent()).toEqual({
      terms: true,
      marketing: true,
      acceptedAt: new Date(1000).toISOString(),
      termsVersion: TERMS_VERSION,
      recordedFor: null,
    });
    // Accepting again keeps the original time.
    const again = updateConsent(readConsent(), { terms: true, marketing: true }, new Date(9000));
    expect(again.acceptedAt).toBe(new Date(1000).toISOString());
  });

  it("forgets an acceptance of an older version of the terms", () => {
    window.localStorage.setItem(
      "wsws.consent.v1",
      JSON.stringify({ terms: true, termsVersion: "2026-01-01", acceptedAt: "x", marketing: true })
    );
    const read = readConsent();
    // Offered ticked again, as on a first visit, with no acceptance stamped.
    expect(read.terms).toBe(true);
    expect(read.acceptedAt).toBeNull();
    expect(read.termsVersion).toBeNull();
    // The marketing choice is theirs regardless of the terms version.
    expect(read.marketing).toBe(true);
  });

  it("asks to record the answers again when either changes", () => {
    const recorded = { ...EMPTY_CONSENT, terms: true, marketing: true, recordedFor: "did:x" };
    expect(updateConsent(recorded, { terms: true, marketing: true }).recordedFor).toBe("did:x");
    expect(updateConsent(recorded, { terms: true, marketing: false }).recordedFor).toBeNull();
    expect(updateConsent(recorded, { terms: false, marketing: true }).recordedFor).toBeNull();
  });

  it("survives a store that cannot be read", () => {
    window.localStorage.setItem("wsws.consent.v1", "not json");
    expect(readConsent()).toEqual(DEFAULT_CONSENT);
  });
});

describe("consent store", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetConsentStore();
  });

  it("tells subscribers about a choice and persists it", () => {
    const listener = vi.fn();
    subscribeConsent(listener);
    setConsent({ terms: true, marketing: false });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(consentSnapshot().terms).toBe(true);
    expect(readConsent().terms).toBe(true);
  });

  it("remembers which account the answers were recorded on", () => {
    setConsent({ terms: true, marketing: true });
    markConsentRecorded("did:privy:abc");
    resetConsentStore();
    expect(consentSnapshot().recordedFor).toBe("did:privy:abc");
  });
});

describe("recordConsent", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetConsentStore();
    fetchMock.mockReset();
  });

  it("sends nothing when the terms were unticked on this device", async () => {
    setConsent({ terms: false, marketing: true });
    expect(await recordConsent("did:privy:abc")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The boxes were left ticked and the person signed in: that is the
  // acceptance, and the sign in is when it happened.
  it("stamps the acceptance at sign in when the boxes were left as offered", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T10:00:00Z"));
    try {
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
      expect(await recordConsent("did:privy:abc")).toBe(true);
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toEqual({
        terms: true,
        termsVersion: TERMS_VERSION,
        acceptedAt: "2026-09-11T10:00:00.000Z",
        marketing: true,
      });
      expect(consentSnapshot().acceptedAt).toBe("2026-09-11T10:00:00.000Z");
      expect(readConsent().recordedFor).toBe("did:privy:abc");
    } finally {
      vi.useRealTimers();
    }
  });

  it("records the answers once per account", async () => {
    setConsent({ terms: true, marketing: true });
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    expect(await recordConsent("did:privy:abc")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/consent");
    expect(JSON.parse(String(init.body))).toMatchObject({
      terms: true,
      termsVersion: TERMS_VERSION,
      marketing: true,
    });
    // Already recorded for this account: nothing more to send.
    expect(await recordConsent("did:privy:abc")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // A different account on the same device is recorded too.
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    expect(await recordConsent("did:privy:other")).toBe(true);
  });

  it("leaves a failed record for the next sign in", async () => {
    setConsent({ terms: true, marketing: false });
    fetchMock.mockResolvedValue(new Response("{}", { status: 502 }));
    expect(await recordConsent("did:privy:abc")).toBe(false);
    expect(consentSnapshot().recordedFor).toBeNull();
  });
});
