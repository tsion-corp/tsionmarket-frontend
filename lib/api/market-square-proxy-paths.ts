/**
 * Which Market Square paths Ark's proxy will relay.
 *
 * Extracted from the route so it can be tested: a path missing here fails as a
 * 404 that looks like the square is down, which is exactly how "Post to Market
 * Square" shipped broken — the write was refused by Ark before it ever left.
 */

// Reads. `me` tells us whether the player carries the creator role that
// POST /streams demands; the stream read is how the panel reflects a status
// the service changed underneath us, such as the orphan reaper ending a
// stream after the host disconnected.
// `streams` is the discovery read: given a deep-link ref it answers with every
// live stream pointing at that activity, which is how a second player finds
// the broadcast their opponent already started. `speaker-requests` is the
// host's pending queue, and `speaker-requests/me` is the guest's own request,
// which carries the publishing credentials once it is approved.
const GET_PATHS = [
  /^me$/u,
  /^me\/creator-application$/u,
  /^streams$/u,
  /^streams\/[^/]+$/u,
  /^streams\/[^/]+\/speaker-requests$/u,
  /^streams\/[^/]+\/speaker-requests\/me$/u,
];

// Writes. Creating, going live and ending are the whole broadcast lifecycle.
// The creator application is the honest exit for a player who is not a
// creator yet: they can apply from where they hit the wall.
const POST_PATHS = [
  /^me\/creator-application$/u,
  // Sharing an Ark activity into the square, and posting to it from here.
  // Ark composes the card because the square cannot describe a trade or a
  // game result itself, so the write has to come from this side.
  /^posts$/u,
  /^streams$/u,
  /^streams\/[^/]+\/go-live$/u,
  /^streams\/[^/]+\/end$/u,
  // Co-publishing: the guest asks, the host approves or declines, the guest
  // fetches a publisher token, and either side can step the guest down again.
  /^streams\/[^/]+\/speaker-requests$/u,
  /^streams\/[^/]+\/speaker-requests\/[^/]+\/(approve|decline|remove|leave)$/u,
  /^streams\/[^/]+\/speaker-token$/u,
];

function allowed(patterns: RegExp[], joined: string): boolean {
  return patterns.some((pattern) => pattern.test(joined));
}

export const marketSquareProxyPaths = {
  get: GET_PATHS,
  post: POST_PATHS,
  allows: (method: "GET" | "POST", joined: string): boolean =>
    allowed(method === "GET" ? GET_PATHS : POST_PATHS, joined),
};
