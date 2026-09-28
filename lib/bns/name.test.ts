import { decodeFunctionData, getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { arkAddressRecordCalldata, arkLabelNode, parseKashRecipient } from "./name";

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
