import { describe, expect, it } from "vitest";
import { isVideoPost, postMediaList, railDotWidth, railIndexAt } from "@/lib/square/post-media";

describe("postMediaList", () => {
  it("prefers the media list, and folds a lone mediaUrl into one", () => {
    expect(postMediaList({ media: [{ url: "a.jpg", kind: "image" }], mediaUrl: "b.jpg" })).toEqual([
      { url: "a.jpg", kind: "image" },
    ]);
    expect(postMediaList({ mediaUrl: "b.jpg", mediaKind: null, thumbnailUrl: null })).toEqual([
      { url: "b.jpg", kind: "image", thumbnailUrl: null },
    ]);
    expect(postMediaList({ mediaUrl: null })).toEqual([]);
  });
});

describe("isVideoPost", () => {
  it("trusts the kind first, then the URL", () => {
    expect(isVideoPost({ mediaUrl: "x.jpg", mediaKind: "video" })).toBe(true);
    expect(isVideoPost({ mediaUrl: "x.mp4", mediaKind: null })).toBe(true);
    expect(isVideoPost({ mediaUrl: "x.jpg" })).toBe(false);
  });
});

describe("the rail's dots", () => {
  it("widens the current dot, then the next, at the compact numbers", () => {
    expect(railDotWidth(1, 1, "compact")).toBe(16.69);
    expect(railDotWidth(2, 1, "compact")).toBe(6.34);
    expect(railDotWidth(0, 1, "compact")).toBe(5.67);
  });

  it("reads the tile under the scroll, and the last at the end", () => {
    expect(railIndexAt(0, 500, 4, "compact")).toBe(0);
    expect(railIndexAt(140, 500, 4, "compact")).toBe(1);
    expect(railIndexAt(500, 500, 4, "compact")).toBe(3);
  });
});
