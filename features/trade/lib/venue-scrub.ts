// llms.txt §0: the venue behind perps is never named to a trader. The product
// is Ark, and the venue's margin account is simply the perps balance. The
// backend de-brands its own errors; this runs on any message the perps UI is
// about to show, in case one reaches it from somewhere else.

const MARGIN_ACCOUNT = /\bhyper[\s-]?core\b/gi;
const VENUE = /\bhyper[\s-]?(?:liquid|evm)\b/gi;

export function scrubVenue(message: string): string {
  return message.replace(MARGIN_ACCOUNT, "perps").replace(VENUE, "Ark");
}
