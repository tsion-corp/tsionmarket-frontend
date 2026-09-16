/**
 * Guards proxy routes against path traversal, null-byte injection,
 * and malicious path manipulation attacks.
 */
export function isSafeProxyPath(path: string): boolean {
  if (!path || typeof path !== "string") return false;

  // Reject leading slash (proxy paths must be relative sub-paths)
  if (path.startsWith("/")) return false;

  // Reject null bytes and encoded null bytes
  if (path.includes("\0") || path.includes("%00")) return false;

  // Reject backslashes and encoded backslashes
  if (path.includes("\\") || /%5c/i.test(path)) return false;

  // Normalize URI decoding to catch double-encoded or obfuscated traversal
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // Malformed URI encoding is unsafe
    return false;
  }

  // Re-check for leading slash or backslash after decoding
  if (decoded.startsWith("/") || decoded.includes("\\")) return false;

  // Check for traversal segments
  const segments = decoded.split("/");
  for (const segment of segments) {
    const trimmed = segment.trim();
    if (trimmed === ".." || trimmed === ".") {
      return false;
    }
  }

  return true;
}
