// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

// The arena wants sound the moment a player arrives, but a browser will not
// run audio outside a user gesture. Someone who followed a shared link is on a
// cold document with no gesture to spend, so the ask is deferred.
//
// startMusic is deliberately NOT mocked: it is called from inside this module,
// which a module mock cannot intercept, so mocking it proves nothing. A fake
// AudioContext stands in instead, and every assertion is about whether sound
// is actually running rather than whether a function was called.

type State = "suspended" | "running";

function fakeAudio(opts: { allow: boolean }) {
  const node = () => ({
    gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, value: 1 },
    connect() {},
    disconnect() {},
    start() {},
    stop() {},
    frequency: { setValueAtTime() {} },
    type: "",
    buffer: null as unknown,
  });
  class FakeContext {
    state: State = "suspended";
    currentTime = 0;
    destination = {};
    resume() {
      // A browser REJECTS this until it is willing to allow audio.
      if (!opts.allow) return Promise.reject(new Error("not allowed"));
      this.state = "running";
      return Promise.resolve();
    }
    createGain() {
      return node();
    }
    createOscillator() {
      return node();
    }
    createBufferSource() {
      return node();
    }
    createBuffer() {
      return { getChannelData: () => new Float32Array(1) };
    }
  }
  vi.stubGlobal("AudioContext", FakeContext);
}

// Lets the resume promise settle without draining the audio scheduler's own
// interval, which never runs out.
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

async function load() {
  vi.resetModules();
  return import("@/features/casino/lib/last-standing/music");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("armMusicOnGesture", () => {
  it("waits rather than starting straight away", async () => {
    fakeAudio({ allow: true });
    const m = await load();
    m.armMusicOnGesture();
    expect(m.isMusicAudible()).toBe(false);
    expect(m.isMusicArmed()).toBe(true);
  });

  it("starts once the browser allows it", async () => {
    fakeAudio({ allow: true });
    const m = await load();
    m.armMusicOnGesture();
    window.dispatchEvent(new Event("pointerdown"));
    await flush();
    expect(m.isMusicAudible()).toBe(true);
    expect(m.isMusicArmed()).toBe(false);
  });

  /**
   * The reported bug. A mouse crossing the page fires pointermove, which does
   * NOT grant user activation, so the attempt it triggers leaves the context
   * suspended. Stopping at the first event meant nothing ever asked again and
   * the arena stayed silent through every later move, scroll and even a wager.
   */
  it("keeps listening when an event fires but the browser still refuses", async () => {
    fakeAudio({ allow: false });
    const m = await load();
    m.armMusicOnGesture();
    window.dispatchEvent(new Event("pointermove"));
    await flush();
    expect(m.isMusicAudible()).toBe(false);
    // Still armed, so the next interaction gets another go.
    expect(m.isMusicArmed()).toBe(true);
  });

  it("still starts on a later real gesture after a refused one", async () => {
    const allow = { allow: false };
    fakeAudio(allow);
    const m = await load();
    m.armMusicOnGesture();
    window.dispatchEvent(new Event("pointermove"));
    await flush();
    expect(m.isMusicAudible()).toBe(false);

    allow.allow = true;
    window.dispatchEvent(new Event("pointerdown"));
    await flush();
    expect(m.isMusicAudible()).toBe(true);
  });

  it.each(["pointerdown", "pointerup", "click", "keydown", "touchend"])(
    "starts on %s",
    async (type) => {
      fakeAudio({ allow: true });
      const m = await load();
      m.armMusicOnGesture();
      window.dispatchEvent(new Event(type));
      await flush();
      expect(m.isMusicAudible()).toBe(true);
    }
  );

  // Leaving the arena must not leave a listener that starts a game's music on
  // an unrelated page.
  it("disarms on request", async () => {
    fakeAudio({ allow: true });
    const m = await load();
    const disarm = m.armMusicOnGesture();
    disarm();
    expect(m.isMusicArmed()).toBe(false);
    window.dispatchEvent(new Event("pointerdown"));
    await flush();
    expect(m.isMusicAudible()).toBe(false);
  });

  it("does not stack listeners when armed twice", async () => {
    fakeAudio({ allow: true });
    const m = await load();
    expect(m.armMusicOnGesture()).toBe(m.armMusicOnGesture());
  });
});
