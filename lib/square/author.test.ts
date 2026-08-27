import { describe, expect, it } from "vitest";
import { authorName } from "@/lib/square/author";

describe("authorName", () => {
  it("prefers the display name", () => {
    expect(authorName({ displayName: "Adejoke Adeosun", username: "adeey" }, "Someone")).toBe(
      "Adejoke Adeosun"
    );
  });

  it("falls back to the handle before giving up", () => {
    expect(authorName({ displayName: "", username: "adeey" }, "Someone")).toBe("@adeey");
    expect(authorName({ displayName: null, username: "adeey" }, "Someone")).toBe("@adeey");
  });

  // Two unnamed people must not read as the same person down the page.
  it("distinguishes unnamed authors by a stable id tail", () => {
    const a = authorName({ id: "did:privy:aaaa1111" }, "Someone");
    const b = authorName({ id: "did:privy:bbbb2222" }, "Someone");
    expect(a).not.toBe(b);
    expect(a).toBe("Someone 1111");
  });

  it("treats whitespace as absent rather than as a name", () => {
    expect(authorName({ displayName: "   ", username: "  " }, "Someone")).toBe("Someone");
  });

  it("gives up only when there is genuinely nothing", () => {
    expect(authorName(null, "Someone")).toBe("Someone");
    expect(authorName(undefined, "Someone")).toBe("Someone");
    expect(authorName({}, "Someone")).toBe("Someone");
  });
});
