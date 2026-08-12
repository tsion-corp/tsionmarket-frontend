// Calldata for sending KSH to another wallet. KSH is a plain ERC-20 on Base,
// so a send is a standard transfer() call from the holder's own wallet; the
// engine is not involved. Pure so the encoding is exactly testable.

import { encodeFunctionData } from "viem";
import { kashToWei } from "@/features/portfolio/lib/kash-permit";

const TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function isEvmAddress(raw: string): boolean {
  return EVM_ADDRESS.test(raw.trim());
}

export function kashTransferData(to: string, kashAmount: string): `0x${string}` {
  if (!isEvmAddress(to)) throw new Error(`not an EVM address: ${to}`);
  return encodeFunctionData({
    abi: TRANSFER_ABI,
    functionName: "transfer",
    args: [to.trim() as `0x${string}`, kashToWei(kashAmount)],
  });
}
