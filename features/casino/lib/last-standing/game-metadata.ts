// Ported from apps/world-street-vault/src/domain/game-metadata.ts.
//
// The vault rebuilds metadataMessage to verify the signature, so this file has
// to agree with it character for character. Change it only to follow a change
// there, and run the test beside it: it pins the exact bytes.
//
// We do not offer an image. The `image:` line stays in the message anyway,
// empty, because the service builds the same six lines either way.

export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 280;

export interface GameMetadataInput {
  title: string;
  description?: string;
}

// Control characters and the bidirectional overrides. The bidi ones are the
// point: U+202E and friends reorder how text RENDERS, so a title can be made
// to display as something other than what it says, which is a spoofing tool in
// a list of other people's games.
//
// Tab, newline and carriage return are deliberately absent: the whitespace
// collapse below turns them into the single space a reader expects, and
// removing them outright would join words.
const CONTROL_CHARS =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g;

export function sanitizeText(raw: string): string {
  return raw.replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim();
}

export type MetadataProblem = "title_required" | "title_too_long" | "description_too_long";

export function metadataProblem(input: GameMetadataInput): MetadataProblem | null {
  const title = sanitizeText(input.title ?? "");
  if (title.length === 0) return "title_required";
  if (title.length > TITLE_MAX) return "title_too_long";

  const description = sanitizeText(input.description ?? "");
  if (description.length > DESCRIPTION_MAX) return "description_too_long";

  return null;
}

export function normalizeMetadata(input: GameMetadataInput): GameMetadataInput {
  const description = sanitizeText(input.description ?? "");
  return {
    title: sanitizeText(input.title),
    ...(description.length > 0 ? { description } : {}),
  };
}

// The exact message the player signs. Built from the NORMALISED values, so
// what is signed is what is stored.
//
// The dash on the first line is an em dash (U+2014), copied from the service.
// The repo forbids em dashes in prose; this is signed data.
export function metadataMessage(
  txHash: string,
  metadata: GameMetadataInput,
  timestamp: number
): string {
  const normalized = normalizeMetadata(metadata);
  return [
    "World Street — name your King of Night game",
    `tx: ${txHash.toLowerCase()}`,
    `title: ${normalized.title}`,
    `description: ${normalized.description ?? ""}`,
    "image: ",
    `ts: ${timestamp}`,
  ].join("\n");
}
