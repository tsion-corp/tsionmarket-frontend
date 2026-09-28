import { concat, encodeFunctionData, getAddress, keccak256, stringToHex, zeroHash } from "viem";

export type KashRecipientInput =
  | { kind: "address"; address: string }
  | { kind: "name"; label: string; name: string }
  | { kind: "invalid"; reason: "empty" | "address" | "name" };

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ARK_SUFFIX = ".ark";

export const ARK_PUBLIC_RESOLVER_ADDRESS = "0xc1c9a06a86D0dcc1Cbd1F4500fb854EF2F102672";

const resolverAddressAbi = [
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
] as const;

export function parseKashRecipient(raw: string): KashRecipientInput {
  const value = raw.trim();
  if (!value) return { kind: "invalid", reason: "empty" };
  if (EVM_ADDRESS.test(value)) return { kind: "address", address: value };

  const lower = value.toLowerCase();
  if (lower.startsWith("0x") && !lower.endsWith(ARK_SUFFIX)) {
    return { kind: "invalid", reason: "address" };
  }

  const label = lower.endsWith(ARK_SUFFIX) ? value.slice(0, -ARK_SUFFIX.length) : value;
  if (
    label.length < 3 ||
    label.length > 255 ||
    /[\s.\/\\?#%]/.test(label) ||
    /[\x00-\x1f\x7f]/.test(label)
  ) {
    return { kind: "invalid", reason: "name" };
  }

  const normalizedLabel = label.toLowerCase();
  return {
    kind: "name",
    label: normalizedLabel,
    name: `${normalizedLabel}${ARK_SUFFIX}`,
  };
}

export function arkLabelNode(label: string): `0x${string}` {
  const parsed = parseKashRecipient(label);
  if (parsed.kind !== "name") throw new Error("Enter a valid Ark ID label.");
  const storeNode = keccak256(concat([zeroHash, stringToHex("ark")]));
  const labelHash = keccak256(stringToHex(parsed.label));
  return keccak256(concat([storeNode, labelHash]));
}

export function arkAddressRecordCalldata(label: string, wallet: string): `0x${string}` {
  if (!EVM_ADDRESS.test(wallet)) throw new Error("Enter a valid EVM wallet address.");
  return encodeFunctionData({
    abi: resolverAddressAbi,
    functionName: "setAddr",
    args: [arkLabelNode(label), getAddress(wallet)],
  });
}

// The DefaultReverseRegistrar `/reverse` reads (see apps/bns README). Setting a
// wallet's primary name is a call to it from the wallet itself.
export const ARK_DEFAULT_REVERSE_REGISTRAR = "0x3992f1D892bcDaE4762bE2A812BFB97e6c02F288";

const reverseRegistrarAbi = [
  {
    name: "setName",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
] as const;

// The reverse ("primary name") record — address -> name — is what lets the app
// recognise a wallet's OWN Ark ID; there is no "list my names" endpoint, so the
// verified reverse is the only signal. Registration does NOT set it (the
// register flag writes to a different registrar than `/reverse` reads), so this
// is the separate DefaultReverseRegistrar.setName call the owner signs.
export function arkSetPrimaryNameCalldata(name: string): `0x${string}` {
  const parsed = parseKashRecipient(name);
  const full = parsed.kind === "name" ? parsed.name : name;
  return encodeFunctionData({
    abi: reverseRegistrarAbi,
    functionName: "setName",
    args: [full],
  });
}
