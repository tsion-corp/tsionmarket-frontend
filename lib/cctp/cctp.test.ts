import { describe, expect, it } from "vitest";
import { decodeFunctionData, type Address, type Hex } from "viem";
import {
  CCTP_FORWARDER_ABI,
  ERC20_ABI,
  MESSAGE_TRANSMITTER_ABI,
  TOKEN_MESSENGER_ABI,
  TOKEN_MESSENGER_HOOK_ABI,
  addressToBytes32,
  encodeApprove,
  encodeArbitrumToBaseBurn,
  encodeBaseToArbitrumBurn,
  encodeBaseToHyperCoreBurn,
  encodeForwardHookData,
  encodeMintAndForward,
  encodeReceiveMessage,
} from "@/lib/cctp/cctp";
import {
  CCTP_DOMAIN,
  CCTP_FINALITY,
  CCTP_V2,
  HYPERCORE,
  HYPERCORE_DEX,
  USDC,
} from "@/lib/cctp/config";

const RECIPIENT = "0xE03a10eFc2980Cfb2C8153f80CB0e3992eB89a83" as Address;

describe("addressToBytes32", () => {
  it("left-pads a 20-byte address to 32 bytes, low 20 bytes are the address", () => {
    const padded = addressToBytes32(RECIPIENT);
    expect(padded).toHaveLength(66); // 0x + 64 hex
    expect(padded.toLowerCase()).toBe(
      "0x000000000000000000000000" + RECIPIENT.slice(2).toLowerCase()
    );
  });
});

describe("encodeApprove", () => {
  it("approves exactly the TokenMessenger for the given amount", () => {
    const { functionName, args } = decodeFunctionData({
      abi: ERC20_ABI,
      data: encodeApprove(6_000000n),
    });
    expect(functionName).toBe("approve");
    expect((args[0] as string).toLowerCase()).toBe(CCTP_V2.tokenMessenger.toLowerCase());
    expect(args[1]).toBe(6_000000n);
  });
});

describe("encodeBaseToArbitrumBurn", () => {
  it("burns to Arbitrum (domain 3), Base USDC, recipient as bytes32, Fast by default", () => {
    const { functionName, args } = decodeFunctionData({
      abi: TOKEN_MESSENGER_ABI,
      data: encodeBaseToArbitrumBurn(6_000000n, RECIPIENT, 500n),
    });
    expect(functionName).toBe("depositForBurn");
    expect(args[0]).toBe(6_000000n); // amount
    expect(args[1]).toBe(CCTP_DOMAIN.arbitrum); // destinationDomain = 3
    expect((args[2] as string).toLowerCase()).toBe(addressToBytes32(RECIPIENT).toLowerCase()); // mintRecipient
    expect((args[3] as string).toLowerCase()).toBe(USDC.base.toLowerCase()); // burnToken
    expect(args[4]).toBe(`0x${"0".repeat(64)}`); // destinationCaller = any
    expect(args[5]).toBe(500n); // maxFee
    expect(args[6]).toBe(CCTP_FINALITY.fast); // minFinalityThreshold = 1000
  });

  it("uses the Standard threshold when fast is false", () => {
    const { args } = decodeFunctionData({
      abi: TOKEN_MESSENGER_ABI,
      data: encodeBaseToArbitrumBurn(6_000000n, RECIPIENT, 0n, false),
    });
    expect(args[6]).toBe(CCTP_FINALITY.standard); // 2000
  });
});

// The last leg of a withdrawal: the venue settles to the user's own Arbitrum
// wallet, and this burns that USDC home to Base for the same address.
describe("encodeArbitrumToBaseBurn", () => {
  it("burns Arbitrum USDC to Base (domain 6), to the same recipient, Fast by default", () => {
    const { functionName, args } = decodeFunctionData({
      abi: TOKEN_MESSENGER_ABI,
      data: encodeArbitrumToBaseBurn(2_500000n, RECIPIENT, 300n),
    });
    expect(functionName).toBe("depositForBurn");
    expect(args[0]).toBe(2_500000n);
    expect(args[1]).toBe(CCTP_DOMAIN.base);
    expect((args[2] as string).toLowerCase()).toBe(addressToBytes32(RECIPIENT).toLowerCase());
    expect((args[3] as string).toLowerCase()).toBe(USDC.arbitrum.toLowerCase());
    expect(args[4]).toBe(`0x${"0".repeat(64)}`);
    expect(args[5]).toBe(300n);
    expect(args[6]).toBe(CCTP_FINALITY.fast);
  });
});

describe("encodeReceiveMessage", () => {
  it("passes the message and attestation through to receiveMessage", () => {
    const message = "0xdeadbeef" as Hex;
    const attestation = "0xc0ffee" as Hex;
    const { functionName, args } = decodeFunctionData({
      abi: MESSAGE_TRANSMITTER_ABI,
      data: encodeReceiveMessage(message, attestation),
    });
    expect(functionName).toBe("receiveMessage");
    expect(args[0]).toBe(message);
    expect(args[1]).toBe(attestation);
  });
});

describe("encodeForwardHookData", () => {
  it("encodes the cctp-forward magic, recipient, and perps dex", () => {
    const hook = encodeForwardHookData(RECIPIENT, HYPERCORE_DEX.perps).toLowerCase();
    // 24 (magic) + 4 (version) + 4 (dataLength) + 20 (address) + 4 (dex) = 56 bytes
    expect(hook).toHaveLength(2 + 56 * 2);
    expect(hook.startsWith("0x636374702d666f7277617264")).toBe(true); // "cctp-forward"
    expect(hook.endsWith("00000018" + RECIPIENT.slice(2).toLowerCase() + "00000000")).toBe(true);
  });

  it("uses 0xffffffff as the dex for spot", () => {
    expect(
      encodeForwardHookData(RECIPIENT, HYPERCORE_DEX.spot).toLowerCase().endsWith("ffffffff")
    ).toBe(true);
  });
});

describe("encodeBaseToHyperCoreBurn", () => {
  it("burns to HyperEVM (19) with the forwarder as BOTH mintRecipient and destinationCaller, carrying the hook", () => {
    const { functionName, args } = decodeFunctionData({
      abi: TOKEN_MESSENGER_HOOK_ABI,
      data: encodeBaseToHyperCoreBurn(5_000000n, RECIPIENT, 100_000n),
    });
    expect(functionName).toBe("depositForBurnWithHook");
    expect(args[0]).toBe(5_000000n); // amount
    expect(args[1]).toBe(CCTP_DOMAIN.hyperevm); // 19
    const forwarder32 = addressToBytes32(HYPERCORE.cctpForwarder).toLowerCase();
    expect((args[2] as string).toLowerCase()).toBe(forwarder32); // mintRecipient = forwarder
    expect((args[3] as string).toLowerCase()).toBe(USDC.base.toLowerCase()); // burnToken
    expect((args[4] as string).toLowerCase()).toBe(forwarder32); // destinationCaller = forwarder
    expect(args[5]).toBe(100_000n); // maxFee
    expect(args[6]).toBe(CCTP_FINALITY.fast); // 1000
    expect((args[7] as string).toLowerCase().startsWith("0x636374702d666f7277617264")).toBe(true); // hookData magic
  });
});

describe("encodeMintAndForward", () => {
  it("calls the forwarder's mintAndForward with the message and attestation (self-relay)", () => {
    const { functionName, args } = decodeFunctionData({
      abi: CCTP_FORWARDER_ABI,
      data: encodeMintAndForward("0xdead", "0xbeef"),
    });
    expect(functionName).toBe("mintAndForward");
    expect(args[0]).toBe("0xdead");
    expect(args[1]).toBe("0xbeef");
  });
});
