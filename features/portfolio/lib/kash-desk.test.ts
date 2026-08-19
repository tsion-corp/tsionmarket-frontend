import { describe, expect, it } from "vitest";
import { withDomainType, type KashDeskTypedData } from "./kash-desk";

const payload: KashDeskTypedData = {
  domain: { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: "0x1" },
  types: {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  },
  primaryType: "Permit",
  message: { owner: "0x1", spender: "0x2", value: "1", nonce: "0", deadline: 1 },
};

describe("withDomainType", () => {
  it("adds the EIP712Domain struct in canonical field order", () => {
    const signed = withDomainType(payload);
    expect(signed.types.EIP712Domain?.map((f) => f.name)).toEqual([
      "name",
      "version",
      "chainId",
      "verifyingContract",
    ]);
    // The Permit struct and everything else pass through untouched.
    expect(signed.types.Permit).toBe(payload.types.Permit);
    expect(signed.message).toBe(payload.message);
    expect(signed.domain).toBe(payload.domain);
  });

  it("leaves a payload that already carries the domain type alone", () => {
    const already = withDomainType(payload);
    expect(withDomainType(already)).toBe(already);
  });
});
