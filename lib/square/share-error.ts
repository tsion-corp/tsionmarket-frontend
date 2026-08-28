import { errorCode, errorStatus } from "@/lib/api/envelope";

/**
 * Turn a failed share into something the person can act on.
 *
 * "Could not share to Market Square. Nothing was posted." was the answer to
 * every failure — a wrong session, an undeployed route, a rejected body and a
 * dead upstream all produced the same sentence. That is the worst possible
 * message for the one flow that crosses a deployment boundary, because the
 * cause is always on the other side of it and the reader has nothing to go on.
 *
 * Each branch names WHAT went wrong and WHO can fix it. The upstream message
 * is surfaced verbatim when there is one, because the service knows more about
 * its own refusal than this function ever will.
 */
export function shareErrorMessage(error: unknown): string {
  const status = errorStatus(error);
  const code = errorCode(error);

  if (status === 401) {
    // The commonest real cause: Ark's session is fine, but Market Square is a
    // separate deployment and the reader has never signed into it.
    return "Market Square did not accept your session. Open Market Square, sign in there once, then try again.";
  }
  if (status === 403) {
    return "Your account is not allowed to post to Market Square. Nothing was posted.";
  }
  if (status === 404 || code === "NOT_CONFIGURED") {
    return "This build of Market Square cannot accept shares yet. Nothing was posted.";
  }
  if (status === 429) {
    return "You are posting too quickly. Wait a moment and try again.";
  }
  if (status === 400 || status === 422) {
    // Say what the service said. A validation refusal names the field, and
    // hiding it is how an empty deep-link ref survived unnoticed.
    const detail = error instanceof Error && error.message ? ` ${error.message}` : "";
    return `Market Square refused the post.${detail} Nothing was posted.`;
  }
  if (
    status === 502 ||
    status === 503 ||
    code === "SERVICE_UNAVAILABLE" ||
    code === "UPSTREAM_ERROR"
  ) {
    return "Market Square is unreachable right now. Nothing was posted — try again shortly.";
  }
  // An unknown failure still carries its message rather than being flattened.
  const detail = error instanceof Error && error.message ? ` ${error.message}` : "";
  return `Could not share to Market Square.${detail} Nothing was posted.`;
}
