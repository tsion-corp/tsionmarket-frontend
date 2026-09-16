import "server-only";

import crypto from "node:crypto";

export interface PolymarketBuilderCredentials {
  key: string;
  passphrase: string;
  secret: string;
}

interface BuilderRequest {
  method: string;
  path: string;
  body?: string;
}

export function polymarketBuilderCredentials(): PolymarketBuilderCredentials | null {
  const key = process.env.POLYMARKET_BUILDER_API_KEY;
  const secret = process.env.POLYMARKET_BUILDER_SECRET;
  const passphrase = process.env.POLYMARKET_BUILDER_PASSPHRASE;
  return key && secret && passphrase ? { key, passphrase, secret } : null;
}

export function polymarketBuilderHeaders(
  credentials: PolymarketBuilderCredentials,
  request: BuilderRequest,
  timestamp = Math.floor(Date.now() / 1_000)
): Record<string, string> {
  const message = `${timestamp}${request.method.toUpperCase()}${request.path}${request.body ?? ""}`;
  const signature = crypto
    .createHmac("sha256", Buffer.from(credentials.secret, "base64"))
    .update(message)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return {
    POLY_BUILDER_API_KEY: credentials.key,
    POLY_BUILDER_PASSPHRASE: credentials.passphrase,
    POLY_BUILDER_SIGNATURE: signature,
    POLY_BUILDER_TIMESTAMP: `${timestamp}`,
  };
}
