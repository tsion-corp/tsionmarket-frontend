// EIP-2612 permit for Kash conversions. Burning a holder's KSH on-chain needs
// their allowance; instead of a gas-costing approve transaction, the holder
// signs this typed message for free and the engine submits it with the burn.
//
// The signature must cover EXACTLY the converted amount in wei, the controller
// as spender, and the token's live nonce, or the engine's permit() call
// reverts. Everything here is pure so it can be tested exactly.

export interface KashChainInfo {
  chainId: number;
  tokenAddress: string;
  controllerAddress: string;
}

export interface KashPermitSignature {
  deadline: number;
  v: number;
  r: string;
  s: string;
}

// How long a signature stays valid. Long enough for a slow confirmation, short
// enough that a leaked signature goes stale the same hour.
const PERMIT_TTL_SECONDS = 30 * 60;

// A Kash amount is a decimal string with at most 6 dp; the token has 18
// decimals. String arithmetic keeps the conversion exact where float math
// would corrupt amounts above 2^53 wei.
export function kashToWei(amount: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(amount.trim());
  if (!match) throw new Error(`not a Kash amount: ${amount}`);
  const whole = match[1];
  const fraction = (match[2] ?? "").padEnd(18, "0");
  return BigInt(whole) * 10n ** 18n + BigInt(fraction);
}

export function permitDeadline(nowMs: number): number {
  return Math.floor(nowMs / 1000) + PERMIT_TTL_SECONDS;
}

// The EIP-712 payload for eth_signTypedData_v4. Domain name/version are the
// token contract's own ("Kash", "1" — OpenZeppelin ERC20Permit defaults).
export function buildKashPermitTypedData(input: {
  chain: KashChainInfo;
  owner: string;
  kashAmount: string;
  nonce: bigint;
  deadline: number;
}) {
  return {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Permit" as const,
    domain: {
      name: "Kash",
      version: "1",
      chainId: input.chain.chainId,
      verifyingContract: input.chain.tokenAddress,
    },
    message: {
      owner: input.owner,
      spender: input.chain.controllerAddress,
      value: kashToWei(input.kashAmount).toString(),
      nonce: input.nonce.toString(),
      deadline: input.deadline,
    },
  };
}

// A 65-byte signature split into the r/s/v the permit call takes.
export function splitPermitSignature(signature: string, deadline: number): KashPermitSignature {
  const hex = signature.startsWith("0x") ? signature.slice(2) : signature;
  if (hex.length !== 130) throw new Error("expected a 65-byte signature");
  const v = parseInt(hex.slice(128, 130), 16);
  return {
    deadline,
    // Some wallets return the recovery bit as 0/1 instead of 27/28.
    v: v < 27 ? v + 27 : v,
    r: `0x${hex.slice(0, 64)}`,
    s: `0x${hex.slice(64, 128)}`,
  };
}
