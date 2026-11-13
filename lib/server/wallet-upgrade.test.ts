import { describe, expect, it } from "vitest";
import { upstreamProblem } from "./wallet-upgrade";

const dev = (base: string, allowProduction = false) =>
  upstreamProblem({ target: "development", base, allowProduction });

describe("upstreamProblem", () => {
  it("keeps development away from the production gateway", () => {
    expect(dev("https://api.tsionark.com/v1/user-management")).toMatch(/production gateway/i);
    expect(dev("https://staging.tsionark.com/v1/user-management")).toMatch(/production gateway/i);
    expect(dev("https://TSIONARK.COM/x")).toMatch(/production gateway/i);
  });

  it("allows development on a local or other service", () => {
    expect(dev("http://localhost:8094")).toBeNull();
    expect(dev("https://dev-user-management.example.com")).toBeNull();
  });

  it("is not fooled by a look-alike host", () => {
    expect(dev("https://tsionark.com.evil.example")).toBeNull(); // not our domain at all
    expect(dev("https://nottsionark.com")).toBeNull();
  });

  it("lets development use production only when explicitly allowed", () => {
    expect(dev("https://api.tsionark.com/v1/user-management", true)).toBeNull();
  });

  it("never restricts production", () => {
    expect(
      upstreamProblem({
        target: "production",
        base: "https://api.tsionark.com",
        allowProduction: false,
      })
    ).toBeNull();
  });

  it("rejects an address that is not a URL", () => {
    expect(dev("not a url")).toMatch(/not a valid URL/i);
  });
});
