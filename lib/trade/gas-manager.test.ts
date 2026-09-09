import { describe, expect, it } from "vitest";
import { parseGasAndPaymaster } from "./gas-manager";

const GOOD = {
  paymaster: "0x2222222222222222222222222222222222222222",
  paymasterData: "0x",
  callGasLimit: "0x5208",
  verificationGasLimit: "0x7530",
  preVerificationGas: "0xc350",
  maxFeePerGas: "0x3b9aca00",
  maxPriorityFeePerGas: "0x3b9aca0",
  paymasterVerificationGasLimit: "0x2710",
  paymasterPostOpGasLimit: "0x0",
};

describe("parseGasAndPaymaster", () => {
  it("turns the Gas Manager answer into the fields a user operation carries", () => {
    expect(parseGasAndPaymaster(GOOD)).toEqual({
      paymaster: GOOD.paymaster,
      paymasterData: "0x",
      callGasLimit: 21000n,
      verificationGasLimit: 30000n,
      preVerificationGas: 50000n,
      maxFeePerGas: 1_000_000_000n,
      maxPriorityFeePerGas: 62_500_000n,
      paymasterVerificationGasLimit: 10000n,
      paymasterPostOpGasLimit: 0n,
    });
  });

  it("refuses an answer that names no paymaster", () => {
    expect(() => parseGasAndPaymaster({ ...GOOD, paymaster: undefined })).toThrow(
      /paymaster address/
    );
  });

  it("refuses an answer with a gas field missing rather than sending zero", () => {
    expect(() => parseGasAndPaymaster({ ...GOOD, callGasLimit: undefined })).toThrow(
      /callGasLimit/
    );
  });

  it("refuses a v0.6 style paymasterAndData answer", () => {
    expect(() => parseGasAndPaymaster({ paymasterAndData: "0x1234" })).toThrow();
  });

  it("refuses anything that is not an object", () => {
    expect(() => parseGasAndPaymaster(null)).toThrow();
    expect(() => parseGasAndPaymaster("0x")).toThrow();
  });
});
