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
  // The square's feed, rendered inline on the Ark dashboard so the social
  // surface is met while scrolling rather than only by leaving for another
  // deployment. Public upstream — a signed-out player sees the same posts.
  /^feed$/u,
  // The topic vocabulary behind the feed's tab strip. Public upstream, and
  // fetched rather than hard-coded so a topic the square adds shows up here
  // instead of drifting out of sync with a compiled-in list.
  /^topics$/u,
  // A post's comment thread, read in place on the dashboard.
  /^posts\/[^/]+\/comments$/u,
  // The reader's own square identity and inbox, for the compose sheet's
  // header. Both are scoped to the caller by the service itself — there is no
  // id in either path, so neither can be pointed at somebody else.
  /^me\/notifications$/u,
  /^me\/unread$/u,
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
  // Engagement on a post, from the dashboard feed. Each of these is scoped to
  // ONE post the reader is looking at, and none of them can reach another
  // user's account: like, repost, comment, and recording that it was seen.
  //
  // Ark forwards the player's session, so every path here acts AS them — which
  // is why the list stops where it does. Following, blocking, reporting,
  // deleting and everything under /me or /admin stay in the square, where the
  // person can see the full context of what they are doing.
  /^posts\/[^/]+\/like$/u,
  /^posts\/[^/]+\/repost$/u,
  /^posts\/[^/]+\/comments$/u,
  /^posts\/[^/]+\/views$/u,
  // Following an author from the feed. This one DOES reach another account,
  // unlike the rest of this list — it is here because following is the whole
  // point of a social surface and a feed you cannot build is a feed you never
  // come back to. It is still the only such path: blocking, reporting and
  // deleting stay in the square, where the full context of the decision is.
  /^profiles\/[^/]+\/follow$/u,
  // Attaching a picture or a clip to a post. The service caps size and
  // sniffs the CONTENT TYPE rather than the filename, so what Ark relays here
  // is judged upstream before a byte is stored.
  /^uploads$/u,
];

// Undoing a like or a repost is a DELETE upstream, so the relay has to speak
// it — for those two paths and nothing else.
const DELETE_PATHS = [
  /^posts\/[^/]+\/like$/u,
  /^posts\/[^/]+\/repost$/u,
  /^profiles\/[^/]+\/follow$/u,
];

function allowed(patterns: RegExp[], joined: string): boolean {
  return patterns.some((pattern) => pattern.test(joined));
}

/**
 * Reads that need NO session, because the square serves them to anyone.
 *
 * Ark's proxy demands a verified session on every path by default, which is
 * right for a relay that forwards the caller's identity — but it silently made
 * the dashboard's whole square section a 401 for signed-out readers, and for
 * signed-in ones during the moment before Privy warms up. The feed upstream is
 * `optionalAuth`: it answers anybody, and enriches the answer when a token
 * comes with it.
 *
 * So these three are exempt from OUR session check only. The caller's token is
 * still forwarded whenever there is one, so `likedByMe` and the rest keep
 * resolving — a signed-out reader simply sees the same posts without the
 * viewer state. Everything else, including anything under /me, still requires
 * a session here before a single byte is forwarded.
 */
const PUBLIC_GET_PATHS = [/^feed$/u, /^topics$/u, /^posts\/[^/]+\/comments$/u];

export type ProxyMethod = "GET" | "POST" | "DELETE";

const BY_METHOD: Record<ProxyMethod, RegExp[]> = {
  GET: GET_PATHS,
  POST: POST_PATHS,
  DELETE: DELETE_PATHS,
};

export const marketSquareProxyPaths = {
  get: GET_PATHS,
  /** Whether a GET may be relayed without a verified session. */
  isPublicGet: (joined: string): boolean => allowed(PUBLIC_GET_PATHS, joined),
  post: POST_PATHS,
  delete: DELETE_PATHS,
  allows: (method: ProxyMethod, joined: string): boolean => allowed(BY_METHOD[method], joined),
};
