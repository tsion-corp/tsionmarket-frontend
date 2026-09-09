import { numberToHex, type SignedAuthorization } from "viem";

// One round trip to Alchemy's Gas Manager fills everything a sponsored user
// operation needs: gas limits, fees and the paymaster fields. The generic
// viem path spends six calls on the same answer (a block read and a
// priority-fee read on the node, then the bundler's fee floor, a paymaster
// stub, a gas estimate and the final paymaster data). The proxy attaches the
// policy; the browser never names one.

export type BundlerRequest = (args: { method: string; params?: unknown[] }) => Promise<unknown>;

export interface SponsoredUserOperationFields {
  paymaster: `0x${string}`;
  paymasterData: `0x${string}`;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymasterVerificationGasLimit: bigint;
  paymasterPostOpGasLimit: bigint;
}

const HEX = /^0x[0-9a-fA-F]*$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function hexField(answer: Record<string, unknown>, name: string): bigint {
  const value = answer[name];
  if (typeof value !== "string" || !HEX.test(value) || value === "0x") {
    throw new Error(`Gas Manager answered without a usable ${name}.`);
  }
  return BigInt(value);
}

function bytesField(answer: Record<string, unknown>, name: string): `0x${string}` {
  const value = answer[name];
  if (typeof value !== "string" || !HEX.test(value)) {
    throw new Error(`Gas Manager answered without a usable ${name}.`);
  }
  return value as `0x${string}`;
}

export function parseGasAndPaymaster(answer: unknown): SponsoredUserOperationFields {
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) {
    throw new Error("Gas Manager answered with no sponsorship data.");
  }
  const fields = answer as Record<string, unknown>;
  const paymaster = fields.paymaster;
  if (typeof paymaster !== "string" || !ADDRESS.test(paymaster)) {
    throw new Error("Gas Manager answered without a paymaster address.");
  }
  return {
    paymaster: paymaster as `0x${string}`,
    paymasterData: bytesField(fields, "paymasterData"),
    callGasLimit: hexField(fields, "callGasLimit"),
    verificationGasLimit: hexField(fields, "verificationGasLimit"),
    preVerificationGas: hexField(fields, "preVerificationGas"),
    maxFeePerGas: hexField(fields, "maxFeePerGas"),
    maxPriorityFeePerGas: hexField(fields, "maxPriorityFeePerGas"),
    paymasterVerificationGasLimit: hexField(fields, "paymasterVerificationGasLimit"),
    paymasterPostOpGasLimit: hexField(fields, "paymasterPostOpGasLimit"),
  };
}

function rpcAuthorization(authorization: SignedAuthorization<number>) {
  return {
    address: authorization.address,
    chainId: numberToHex(authorization.chainId),
    nonce: numberToHex(authorization.nonce),
    r: numberToHex(BigInt(authorization.r), { size: 32 }),
    s: numberToHex(BigInt(authorization.s), { size: 32 }),
    yParity: numberToHex(authorization.yParity ?? 0, { size: 1 }),
  };
}

export async function requestGasAndPaymaster({
  request,
  entryPoint,
  sender,
  nonce,
  callData,
  dummySignature,
  authorization,
}: {
  request: BundlerRequest;
  entryPoint: `0x${string}`;
  sender: `0x${string}`;
  nonce: bigint;
  callData: `0x${string}`;
  dummySignature: `0x${string}`;
  authorization?: SignedAuthorization<number>;
}): Promise<SponsoredUserOperationFields> {
  const answer = await request({
    method: "alchemy_requestGasAndPaymasterAndData",
    params: [
      {
        entryPoint,
        dummySignature,
        userOperation: {
          sender,
          nonce: numberToHex(nonce),
          callData,
          ...(authorization ? { eip7702Auth: rpcAuthorization(authorization) } : {}),
        },
      },
    ],
  });
  return parseGasAndPaymaster(answer);
}
