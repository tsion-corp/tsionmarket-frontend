import { describe, expect, it } from "vitest";
import { comboErrorMessage } from "./combo-error";

describe("Combo errors", () => {
  it("does not expose the Builder Gateway URL when Combo access is not enabled", () => {
    const message = comboErrorMessage(
      new Error(
        "builder code not found (https://combos-rfq-gateway-builder.polymarket.com/v1/builder/rfq/requests)"
      ),
      "Couldn't get a Combo quote. Try again."
    );

    expect(message).toBe(
      "Combo trading is awaiting activation for this app. No order was submitted."
    );
    expect(message).not.toContain("polymarket.com");
  });

  it("uses the normal friendly error mapping for other failures", () => {
    expect(comboErrorMessage(new Error("Failed to fetch"), "Fallback")).toBe(
      "Connection problem. Check your internet and try again."
    );
  });
});
