import { describe, expect, it } from "vitest";
import { computePage } from "@/hooks/use-paged";

describe("computePage", () => {
  it("reports the first page of a multi-page list", () => {
    expect(computePage(24, 0, 10)).toEqual({
      page: 0,
      pageCount: 3,
      start: 0,
      from: 1,
      to: 10,
    });
  });

  it("bounds the last page to the true item count", () => {
    expect(computePage(24, 2, 10)).toEqual({
      page: 2,
      pageCount: 3,
      start: 20,
      from: 21,
      to: 24,
    });
  });

  it("clamps a page past the end back into range", () => {
    // A live feed shrank from 24 to 8 while parked on page 3.
    expect(computePage(8, 3, 10)).toEqual({
      page: 0,
      pageCount: 1,
      start: 0,
      from: 1,
      to: 8,
    });
  });

  it("clamps negative pages to zero", () => {
    expect(computePage(8, -2, 10).page).toBe(0);
  });

  it("reports an empty list as a single empty page", () => {
    expect(computePage(0, 0, 10)).toEqual({
      page: 0,
      pageCount: 1,
      start: 0,
      from: 0,
      to: 0,
    });
  });

  it("treats an exact multiple as a whole final page", () => {
    expect(computePage(20, 1, 10)).toMatchObject({ pageCount: 2, from: 11, to: 20 });
  });
});
