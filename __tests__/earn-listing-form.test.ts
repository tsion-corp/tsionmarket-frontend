import { describe, expect, it } from "vitest";
import {
  buildListingPayload,
  emptyListingForm,
  slugify,
  validateListingForm,
  type ListingFormState,
} from "@/lib/earn/listing-form";
import {
  formatReward,
  parseRewardInput,
  rewardFrom,
  rewardToApi,
  sumRewards,
} from "@/lib/earn/reward";

// This is the money and the dates. A listing that publishes with a reward split
// that does not add up pays somebody the wrong amount, and the service rejects a
// commitment date under a day after the deadline, so both are pinned here.

function form(over: Partial<ListingFormState> = {}): ListingFormState {
  return {
    ...emptyListingForm(),
    title: "Test Listing",
    slug: "test-listing",
    description: "Build something useful",
    pocSocials: "https://t.me/testowner",
    deadline: "2026-12-31T23:59",
    commitmentDate: "2027-01-02T23:59",
    token: "USDC",
    rewardAmount: "1000",
    rewards: [{ position: 1, amount: "1000" }],
    skills: [{ skill: "Frontend", subskills: [] }],
    ...over,
  };
}

describe("commitment date rule", () => {
  it("accepts a commitment date exactly one day after the deadline", () => {
    const errors = validateListingForm(
      form({ deadline: "2026-12-31T23:59", commitmentDate: "2027-01-01T23:59" }),
      { forPublish: true }
    );
    expect(errors.commitmentDate).toBeUndefined();
  });

  it("rejects a commitment date one minute under a day", () => {
    const errors = validateListingForm(
      form({ deadline: "2026-12-31T23:59", commitmentDate: "2027-01-01T23:58" }),
      { forPublish: true }
    );
    expect(errors.commitmentDate).toMatch(/at least a day/i);
  });

  it("rejects a commitment date before the deadline", () => {
    const errors = validateListingForm(
      form({ deadline: "2026-12-31T23:59", commitmentDate: "2026-12-30T23:59" }),
      { forPublish: true }
    );
    expect(errors.commitmentDate).toMatch(/at least a day/i);
  });

  it("asks for the dates when they are missing", () => {
    const errors = validateListingForm(form({ deadline: "", commitmentDate: "" }), {
      forPublish: true,
    });
    expect(errors.deadline).toBeDefined();
    expect(errors.commitmentDate).toBeDefined();
  });

  it("does not enforce the date rule on a half-finished draft", () => {
    const errors = validateListingForm(form({ deadline: "", commitmentDate: "" }), {
      forPublish: false,
    });
    expect(errors.deadline).toBeUndefined();
  });
});

describe("reward split", () => {
  it("accepts a split that adds up to the total", () => {
    const errors = validateListingForm(
      form({
        rewardAmount: "1000",
        rewards: [
          { position: 1, amount: "700" },
          { position: 2, amount: "300" },
        ],
      }),
      { forPublish: true }
    );
    expect(errors.rewards).toBeUndefined();
  });

  it("rejects a split that does not add up", () => {
    const errors = validateListingForm(
      form({
        rewardAmount: "1000",
        rewards: [
          { position: 1, amount: "700" },
          { position: 2, amount: "200" },
        ],
      }),
      { forPublish: true }
    );
    expect(errors.rewards).toMatch(/add up/i);
  });

  it("adds up a three-way split of an awkward amount without drift", () => {
    // 1000.10 split three ways is exactly the case that loses a cent when the
    // arithmetic is done in floating point.
    const errors = validateListingForm(
      form({
        rewardAmount: "1000.10",
        rewards: [
          { position: 1, amount: "333.37" },
          { position: 2, amount: "333.37" },
          { position: 3, amount: "333.36" },
        ],
      }),
      { forPublish: true }
    );
    expect(errors.rewards).toBeUndefined();
  });

  it("rejects an amount that is not a clean decimal", () => {
    const errors = validateListingForm(form({ rewardAmount: "1,000" }), { forPublish: false });
    expect(errors.rewardAmount).toBeDefined();
  });

  it("rejects a reward of zero", () => {
    const errors = validateListingForm(form({ rewardAmount: "0" }), { forPublish: false });
    expect(errors.rewardAmount).toMatch(/more than zero/i);
  });

  it("rejects more decimal places than the token has", () => {
    const errors = validateListingForm(form({ rewardAmount: "1.1234567" }), { forPublish: false });
    expect(errors.rewardAmount).toMatch(/decimal places/i);
  });
});

describe("required fields", () => {
  it("lets a draft through with only a title and a slug", () => {
    const errors = validateListingForm(
      { ...emptyListingForm(), title: "Half done", slug: "half-done" },
      { forPublish: false }
    );
    expect(errors).toEqual({});
  });

  it("holds a publish until the description, contact and skills are set", () => {
    const errors = validateListingForm(
      { ...emptyListingForm(), title: "Half done", slug: "half-done" },
      { forPublish: true }
    );
    expect(errors.description).toBeDefined();
    expect(errors.pocSocials).toBeDefined();
    expect(errors.skills).toBeDefined();
  });

  it("rejects a malformed slug", () => {
    expect(
      validateListingForm(form({ slug: "Test Listing" }), { forPublish: false }).slug
    ).toBeDefined();
    expect(
      validateListingForm(form({ slug: "test--listing" }), { forPublish: false }).slug
    ).toBeDefined();
    expect(
      validateListingForm(form({ slug: "test-listing-2" }), { forPublish: false }).slug
    ).toBeUndefined();
  });
});

describe("payload", () => {
  it("builds the body the service documents", () => {
    const payload = buildListingPayload(
      form({
        rewardAmount: "1000",
        rewards: [
          { position: 1, amount: "700" },
          { position: 2, amount: "300" },
        ],
      })
    );

    expect(payload.rewardAmount).toBe(1000);
    expect(payload.rewards).toEqual({ "1": 700, "2": 300 });
    expect(payload.skills).toEqual([{ skills: "Frontend", subskills: [] }]);
    expect(payload.deadline).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(payload.id).toBeUndefined();
  });

  it("carries the id only when updating an existing draft", () => {
    expect(buildListingPayload(form(), "listing_1").id).toBe("listing_1");
  });

  it("leaves an unfilled position out of the split", () => {
    const payload = buildListingPayload(
      form({
        rewardAmount: "1000",
        rewards: [
          { position: 1, amount: "1000" },
          { position: 2, amount: "" },
        ],
      })
    );
    expect(payload.rewards).toEqual({ "1": 1000 });
  });

  it("throws rather than sending a malformed reward", () => {
    expect(() => buildListingPayload(form({ rewardAmount: "abc" }))).toThrow();
  });
});

describe("reward amounts", () => {
  it("parses a decimal into exact minor units", () => {
    expect(parseRewardInput("1000.10", "USDC")).toBe(1_000_100_000n);
    expect(parseRewardInput("1", "ETH")).toBe(10n ** 18n);
  });

  it("round-trips a decimal through minor units and back", () => {
    const reward = rewardFrom(parseRewardInput("1000.10", "USDC"), "USDC");
    expect(rewardToApi(reward)).toBe(1000.1);
  });

  it("sums positions exactly", () => {
    const tiers = ["333.37", "333.37", "333.36"].map((amount, index) => ({
      position: index + 1,
      amount: rewardFrom(parseRewardInput(amount, "USDC"), "USDC"),
    }));
    expect(sumRewards(tiers)).toBe(parseRewardInput("1000.10", "USDC"));
  });

  it("formats whole amounts without a decimal tail", () => {
    expect(formatReward(rewardFrom(parseRewardInput("1000", "USDC"), "USDC"))).toBe("1,000 USDC");
    expect(formatReward(rewardFrom(parseRewardInput("1000.50", "USDC"), "USDC"))).toBe(
      "1,000.5 USDC"
    );
  });
});

describe("slugify", () => {
  it("turns a title into a usable slug", () => {
    expect(slugify("Build a Trading Dashboard!")).toBe("build-a-trading-dashboard");
  });

  it("does not leave leading or trailing hyphens", () => {
    expect(slugify("  ...Hello...  ")).toBe("hello");
  });
});
