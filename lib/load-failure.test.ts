import { describe, expect, it } from "vitest";
import { classifyLoadFailure, offersRetry } from "@/lib/load-failure";

describe("classifyLoadFailure", () => {
  // The transport failing is not this panel's fault, and the connection bar is
  // already saying so — the panel must not repeat it in different words.
  it("recognises the transport failing, in every shape we produce", () => {
    for (const message of [
      "Can't reach the server right now",
      "Failed to fetch",
      "NetworkError when attempting to fetch resource",
      "Load failed",
      "fetch failed",
    ]) {
      expect(classifyLoadFailure(new Error(message), false)).toBe("offline");
    }
  });

  it("keeps 'not switched on' separate from 'went wrong'", () => {
    expect(classifyLoadFailure(new Error("anything"), true)).toBe("unconfigured");
    expect(classifyLoadFailure(new Error("bad gateway"), false)).toBe("other");
    expect(classifyLoadFailure(null, false)).toBe("other");
  });
});

describe("offersRetry", () => {
  // A button that cannot work teaches the reader that buttons do not work.
  it("stands down while the app is already retrying", () => {
    expect(offersRetry("other", true)).toBe(false);
    expect(offersRetry("offline", true)).toBe(false);
  });

  it("offers itself when a retry could actually achieve something", () => {
    expect(offersRetry("other", false)).toBe(true);
  });

  // Nothing the reader taps will switch a service on.
  it("never offers to retry something that is simply not deployed", () => {
    expect(offersRetry("unconfigured", false)).toBe(false);
  });
});
