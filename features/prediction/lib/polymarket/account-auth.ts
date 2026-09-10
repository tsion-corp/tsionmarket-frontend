"use client";

import type { SecureClient } from "./secure-client";

export const COMBO_QUOTE_PROVIDER_PATH = "/v1/builder/rfq/requests";

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const standard = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = standard.padEnd(Math.ceil(standard.length / 4) * 4, "=");
  const decoded = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(decoded.length));
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_");
}

export async function createPolymarketAccountHeaders(
  client: SecureClient,
  method: "GET" | "POST",
  path: string,
  body = "",
  timestamp = Math.floor(Date.now() / 1000)
): Promise<Record<string, string>> {
  const credentials = client.credentials;
  const message = `${timestamp}${method}${path}${body}`;
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    decodeBase64Url(credentials.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );

  return {
    "x-polymarket-account-address": client.account.signer,
    "x-polymarket-account-api-key": credentials.key,
    "x-polymarket-account-passphrase": credentials.passphrase,
    "x-polymarket-account-timestamp": String(timestamp),
    "x-polymarket-account-signature": encodeBase64Url(new Uint8Array(signature)),
  };
}
