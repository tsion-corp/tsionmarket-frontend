// Deterministic comment-signing payloads — MUST match the backend's
// CommentService.commentMessage / likeMessage byte-for-byte, or the signature
// won't recover to the signer and the API rejects it. The wallet signs these
// strings (EIP-191 personal_sign) to prove authorship; the backend has no auth
// service and holds no key, so the signature IS the authorization.

export function commentMessage(input: {
  scope: "group" | "market";
  scopeId: string;
  body: string;
  timestamp: number;
}): string {
  return [
    "World Street — post comment",
    `scope: ${input.scope}:${input.scopeId}`,
    `body: ${input.body}`,
    `ts: ${input.timestamp}`,
  ].join("\n");
}

export function likeMessage(commentId: string, timestamp: number): string {
  return ["World Street — like comment", `id: ${commentId}`, `ts: ${timestamp}`].join("\n");
}
