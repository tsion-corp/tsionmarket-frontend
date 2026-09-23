// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  closeMiniWindow,
  miniWindowSnapshot,
  openMiniWindow,
} from "@/features/casino/components/last-standing/mini-timer";

// Lets the promise inside openMiniWindow settle so its fallback has run.
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  closeMiniWindow();
});

describe("openMiniWindow", () => {
  it("raises the in-app overlay on the overlay tier", () => {
    openMiniWindow("overlay");
    expect(miniWindowSnapshot().overlayActive).toBe(true);
  });

  // The floating video needs offscreen surfaces the host mounts. If they are
  // not there the player still has to end up with something: leaving a live
  // round on the strength of "yes, keep it with me" and getting nothing is
  // the worst outcome of the three.
  it("falls back to the overlay when the video surfaces are missing", async () => {
    openMiniWindow("video");
    await settled();
    expect(miniWindowSnapshot().overlayActive).toBe(true);
  });

  // jsdom has no documentPictureInPicture, which is exactly the browser that
  // cannot serve this tier.
  it("falls back to the overlay when the browser has no document pop-out", async () => {
    openMiniWindow("document");
    await settled();
    expect(miniWindowSnapshot().overlayActive).toBe(true);
  });
});
