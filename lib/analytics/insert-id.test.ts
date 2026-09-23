import { describe, expect, it } from "vitest";
import { insertIdFor } from "@/lib/analytics/insert-id";

// Mixpanel drops an event whose $insert_id (with its name, distinct_id and
// time) it has already seen. Deriving the id from the record the event is
// about is what lets two devices report one deposit and count it once.

describe("insertIdFor", () => {
  it("is the same for the same event about the same record", () => {
    expect(insertIdFor("deposit_completed", "0xabc:log:1")).toBe(
      insertIdFor("deposit_completed", "0xabc:log:1")
    );
  });

  it("differs by record and by event", () => {
    const id = insertIdFor("deposit_completed", "0xabc:log:1");
    expect(insertIdFor("deposit_completed", "0xabc:log:2")).not.toBe(id);
    expect(insertIdFor("withdraw_completed", "0xabc:log:1")).not.toBe(id);
  });

  it("fits Mixpanel's limit of 36 characters, from a source of any length", () => {
    const id = insertIdFor("deposit_completed", `0x${"f".repeat(64)}:log:12`);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });
});
