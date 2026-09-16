import { describe, it, expect } from "vitest";
import { isSafeProxyPath } from "./proxy-path";

describe("isSafeProxyPath", () => {
  it("allows safe relative endpoint paths", () => {
    expect(isSafeProxyPath("tokens")).toBe(true);
    expect(isSafeProxyPath("tokens/0x123/price")).toBe(true);
    expect(isSafeProxyPath("v1/markets/ETH-USD")).toBe(true);
    expect(isSafeProxyPath("categories/yield-history")).toBe(true);
  });

  it("rejects path traversal attempts", () => {
    expect(isSafeProxyPath("..")).toBe(false);
    expect(isSafeProxyPath("../etc/passwd")).toBe(false);
    expect(isSafeProxyPath("tokens/../../admin")).toBe(false);
    expect(isSafeProxyPath("tokens/%2e%2e/admin")).toBe(false);
    expect(isSafeProxyPath("tokens/%2E%2E/admin")).toBe(false);
    expect(isSafeProxyPath("tokens/..")).toBe(false);
    expect(isSafeProxyPath(".")).toBe(false);
    expect(isSafeProxyPath("./admin")).toBe(false);
  });

  it("rejects backslash manipulation", () => {
    expect(isSafeProxyPath("tokens\\admin")).toBe(false);
    expect(isSafeProxyPath("tokens/%5cadmin")).toBe(false);
    expect(isSafeProxyPath("..\\admin")).toBe(false);
  });

  it("rejects null byte injection", () => {
    expect(isSafeProxyPath("tokens\0admin")).toBe(false);
    expect(isSafeProxyPath("tokens%00admin")).toBe(false);
  });

  it("rejects malformed URI encodings", () => {
    expect(isSafeProxyPath("tokens/%E0%A4%A")).toBe(false);
  });

  it("rejects empty or non-string inputs", () => {
    expect(isSafeProxyPath("")).toBe(false);
    expect(isSafeProxyPath(null as unknown as string)).toBe(false);
    expect(isSafeProxyPath(undefined as unknown as string)).toBe(false);
  });
});
