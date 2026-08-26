import { describe, expect, it } from "vitest";
import { marketSquareSchemaFor, streamSchema } from "./market-square";

const baseStream = {
  id: "s-1",
  ownerId: "u-1",
  title: "Chess: Ada vs Bo",
  category: "gaming",
  status: "live",
  visibility: "public",
};

describe("streamSchema deepLink", () => {
  it("accepts a stream from a deployment that does not send a deep link", () => {
    const parsed = streamSchema.parse(baseStream);
    expect(parsed.deepLink).toBeUndefined();
  });

  it("keeps a deep link the flow understands", () => {
    const parsed = streamSchema.parse({
      ...baseStream,
      deepLink: { kind: "game", ref: "m-1" },
    });
    expect(parsed.deepLink).toEqual({ kind: "game", ref: "m-1" });
  });

  it("accepts an explicit null", () => {
    expect(streamSchema.parse({ ...baseStream, deepLink: null }).deepLink).toBeNull();
  });

  it("falls back to external for a kind added upstream later", () => {
    const parsed = streamSchema.parse({
      ...baseStream,
      deepLink: { kind: "tournament", ref: "t-9" },
    });
    expect(parsed.deepLink).toEqual({ kind: "external", ref: "t-9" });
  });

  it("does not reject the whole stream over a malformed deep link", () => {
    const parsed = streamSchema.parse({ ...baseStream, deepLink: { ref: 7 } });
    expect(parsed.deepLink).toBeNull();
    expect(parsed.id).toBe("s-1");
  });
});

describe("marketSquareSchemaFor", () => {
  it("models every path the proxy allows and nothing else", () => {
    expect(marketSquareSchemaFor("me")).not.toBeNull();
    expect(marketSquareSchemaFor("me/creator-application")).not.toBeNull();
    expect(marketSquareSchemaFor("streams")).not.toBeNull();
    expect(marketSquareSchemaFor("streams/s-1")).not.toBeNull();
    expect(marketSquareSchemaFor("streams/s-1/go-live")).not.toBeNull();
    expect(marketSquareSchemaFor("streams/s-1/end")).not.toBeNull();
    expect(marketSquareSchemaFor("streams/s-1/chat")).toBeNull();
    expect(marketSquareSchemaFor("streams/s-1/speaker-requests")).not.toBeNull();
    expect(marketSquareSchemaFor("streams/s-1/speaker-requests/me")).not.toBeNull();
    expect(marketSquareSchemaFor("streams/s-1/speaker-requests/r-1/approve")).not.toBeNull();
    expect(marketSquareSchemaFor("streams/s-1/speaker-token")).not.toBeNull();
  });

  it("judges a read and a write of the same path by their own shapes", () => {
    // GET /streams is the discovery list; POST /streams answers with one
    // stream. Judging the list against the single schema would reject every
    // discovery response.
    const list = { items: [], nextCursor: null };
    expect(marketSquareSchemaFor("streams", "GET")?.safeParse(list).success).toBe(true);
    expect(marketSquareSchemaFor("streams", "POST")?.safeParse(list).success).toBe(false);

    const queue = { items: [] };
    const request = { id: "r-1", streamId: "s-1", userId: "u-2", status: "pending" };
    expect(
      marketSquareSchemaFor("streams/s-1/speaker-requests", "GET")?.safeParse(queue).success
    ).toBe(true);
    expect(
      marketSquareSchemaFor("streams/s-1/speaker-requests", "POST")?.safeParse(request).success
    ).toBe(true);
  });
});
