import { describe, expect, it } from "vitest";
import { decodeDecaneUserId } from "@/lib/decane-user-id";

function token(payload: object): string {
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `eyJhbGciOiJFUzI1NiJ9.${body}.sig`;
}

describe("decodeDecaneUserId", () => {
  it("reads the uid claim, not sub", () => {
    expect(decodeDecaneUserId(token({ sub: "hmac", uid: "user-1", project_id: "p" }))).toBe(
      "user-1"
    );
  });

  it("is null for a token without one, or that is not a JWT", () => {
    expect(decodeDecaneUserId(token({ sub: "hmac" }))).toBeNull();
    expect(decodeDecaneUserId(token({ uid: "" }))).toBeNull();
    expect(decodeDecaneUserId("not-a-token")).toBeNull();
    expect(decodeDecaneUserId("")).toBeNull();
  });
});
