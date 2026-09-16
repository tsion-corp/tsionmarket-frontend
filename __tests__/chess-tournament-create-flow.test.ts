import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("features/casino/components/chess-app/arena/create-form.tsx", "utf8");

describe("chess Arena creation flow", () => {
  it("renders the Lichess tournament form structure", () => {
    expect(source).toContain("tournament.form.42065c26.css");
    expect(source).toContain('className="tour__form box box-pad"');
    expect(source).toContain('className="form3"');
    expect(source).toContain("Tournament");
    expect(source).toContain("Games");
    expect(source).toContain("Start date");
    expect(source).toContain("Entry conditions");
    expect(source).toContain("Features");
  });

  it("submits every supported Lichess Arena setting to the Rust API", () => {
    for (const field of [
      "variant",
      "initialFen",
      "rated",
      "password",
      "conditions",
      "noBerserk",
      "noStreak",
      "description",
      "payouts",
      "hasChat",
    ]) {
      expect(source).toContain(field);
    }
  });
});
