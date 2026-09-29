import { decodeFunctionData, getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { arkAddressRecordCalldata, arkLabelNode, parseArkLabel, parseKashRecipient } from "./name";

describe("parseKashRecipient", () => {
  it("preserves a valid EVM address", () => {
    const address = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    expect(parseKashRecipient(address)).toEqual({ kind: "address", address });
  });

  it("attaches and normalizes the Ark suffix for a bare label", () => {
    expect(parseKashRecipient("Alice")).toEqual({
      kind: "name",
      label: "alice",
      name: "alice.ark",
    });
  });

  it("normalizes a fully qualified Ark name", () => {
    expect(parseKashRecipient("Alice.ARK")).toEqual({
      kind: "name",
      label: "alice",
      name: "alice.ark",
    });
  });

  it.each(["", "ab", "alice.eth", "alice.ark.extra", "bad/name", "0x1234"])(
    "rejects invalid recipient input %j",
    (value) => {
      expect(parseKashRecipient(value).kind).toBe("invalid");
    }
  );
});

describe("Ark name record encoding", () => {
  it("normalizes labels before computing the store-specific node", () => {
    expect(arkLabelNode("ALICE.ARK")).toBe(arkLabelNode("alice"));
  });

  it("encodes the wallet address into the resolver registration data", () => {
    const wallet = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const encoded = arkAddressRecordCalldata("alice", wallet);
    expect(
      decodeFunctionData({
        abi: [
          {
            name: "setAddr",
            type: "function",
            stateMutability: "nonpayable",
            inputs: [
              { name: "node", type: "bytes32" },
              { name: "addr", type: "address" },
            ],
            outputs: [],
          },
        ],
        data: encoded,
      })
    ).toMatchObject({ functionName: "setAddr", args: [arkLabelNode("alice"), getAddress(wallet)] });
  });
});

// The registrar takes letters and digits alike, in any order, so "2fast" and
// "0xazach" are names somebody can buy. The recipient parser turns a bare "0x"
// away because on the send form that is a pasted address; the Ark ID page
// parses a label, where it is not.
describe("Ark ID labels", () => {
  it.each(["alice", "alice1", "2fast", "0xazach", "ALICE9"])(
    "accepts the alphanumeric label %j",
    (value) => {
      expect(parseArkLabel(value)).toBe(value.toLowerCase());
    }
  );

  it.each(["", "ab", "a b", "a.b", "bad/name", "bad?name", "bad#name", "bad%name", "bad\\name"])(
    "refuses %j, which is the registrar's own rule",
    (value) => {
      expect(parseArkLabel(value)).toBeNull();
    }
  );

  it("takes digits in a recipient name too", () => {
    expect(parseKashRecipient("alice123")).toMatchObject({ kind: "name", label: "alice123" });
  });
});
