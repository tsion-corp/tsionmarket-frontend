// A deterministic Mixpanel $insert_id for an event about a known record.
//
// Mixpanel treats two events with the same $insert_id, name, distinct_id and
// time as one. The SDK gives every event a random id, so a deposit noticed on a
// phone and again on a laptop counted twice. Deriving the id from the record
// (a transfer's id, an order id) makes both reports the same event.
//
// Mixpanel caps $insert_id at 36 characters, so the source is hashed: two
// 64-bit FNV-1a hashes with different offsets, as 32 hex characters. This is a
// dedupe key, not a security boundary; collisions only need to be rare.

const FNV_PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;

function fnv1a64(input: string, offset: bigint): string {
  let hash = offset;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

export function insertIdFor(event: string, sourceId: string): string {
  const key = `${event}:${sourceId}`;
  return fnv1a64(key, 0xcbf29ce484222325n) + fnv1a64(key, 0x84222325cbf29ce4n);
}
