// Reads the project tokens out of a batch mixpanel-browser posts, so the relay
// (app/api/relay) can refuse anything that is not for our project.
//
// The SDK posts form-encoded `data`, holding the batch as base64 JSON (its
// default `api_payload_format`) or as plain JSON. A track event carries its
// token at `properties.token`; a profile or group update at `$token`.

type Json = Record<string, unknown>;

function decode(data: string): unknown {
  const trimmed = data.trim();
  const json =
    trimmed.startsWith("[") || trimmed.startsWith("{")
      ? trimmed
      : Buffer.from(trimmed, "base64").toString("utf8");
  return JSON.parse(json);
}

function tokenOf(item: unknown): string | null {
  if (typeof item !== "object" || item === null) return null;
  const record = item as Json;
  if (typeof record.$token === "string") return record.$token;
  const properties = record.properties;
  if (typeof properties === "object" && properties !== null) {
    const token = (properties as Json).token;
    if (typeof token === "string") return token;
  }
  return null;
}

/**
 * Every token in the batch, one per item, or null when the body is not an SDK
 * payload at all. An item with no token yields an empty string, so the caller's
 * "every token is ours" check fails on it rather than skipping it.
 */
export function batchTokens(body: string): string[] | null {
  const data = new URLSearchParams(body).get("data");
  if (!data) return null;
  let payload: unknown;
  try {
    payload = decode(data);
  } catch {
    // Not base64 JSON or JSON: not something the SDK sent.
    return null;
  }
  const items = Array.isArray(payload) ? payload : [payload];
  if (items.length === 0) return null;
  return items.map((item) => tokenOf(item) ?? "");
}
