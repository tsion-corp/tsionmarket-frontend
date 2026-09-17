import { isAddress } from "viem";
import { isEvmAddress } from "@/features/portfolio/lib/kash-transfer";
import registry from "@/features/portfolio/lib/ark-names.json";

// A resolved Ark name: the canonical ".ark" name and the EVM address it points
// to. The address is the actual send target. The name travels alongside it only
// so the UI can keep showing who the address belongs to.
export interface ArkNameResolution {
  name: string;
  address: string;
}

const SUFFIX = ".ark";
// One label of letters, digits, or hyphens. Keeps "dave" or "dave.ark", and
// rejects blank input or a dotted path.
const LABEL = /^[a-z0-9-]+$/;

// Normalize the registry to lowercase full names once, at module load.
const NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(registry as Record<string, string>).map(([name, address]) => [
    name.toLowerCase(),
    address,
  ])
);

// Turn raw input into a canonical ".ark" name, or null when it cannot be one
// (blank, an EVM address, or an invalid label). "dave" and "DAVE.ark" both
// become "dave.ark".
export function toArkName(input: string): string | null {
  const raw = input.trim();
  if (raw === "" || isEvmAddress(raw)) return null;
  const lower = raw.toLowerCase();
  const label = lower.endsWith(SUFFIX) ? lower.slice(0, -SUFFIX.length) : lower;
  if (!LABEL.test(label)) return null;
  return `${label}${SUFFIX}`;
}

// Resolve an Ark name to its recipient. Async on purpose: the source is a local
// JSON file today, but this function is the single seam that will point at the
// platform database later, with no caller change. Returns null for a name the
// registry does not know.
export async function resolveArkName(input: string): Promise<ArkNameResolution | null> {
  const name = toArkName(input);
  if (name === null) return null;
  const address = NAMES[name];
  // Strict here, unlike the input check: the same validation viem applies when
  // the transfer is encoded. An entry viem would refuse reads as an unknown
  // name, which the modal already handles, rather than failing at the send.
  if (address === undefined || !isAddress(address, { strict: true })) return null;
  return { name, address };
}
