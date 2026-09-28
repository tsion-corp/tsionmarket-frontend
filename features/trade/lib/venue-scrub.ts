// llms.txt §0: the venue behind Leverage Trading is never named to a trader.
// The product is Ark, and the venue's margin account is simply the leverage
// trading balance. The backend de-brands its own errors; this runs on any
// message the desk is about to show, in case one reaches it from somewhere
// else.

const MARGIN_ACCOUNT = /\bhyper[\s-]?core\b/gi;
const VENUE = /\bhyper[\s-]?(?:liquid|evm)\b/gi;

export function scrubVenue(message: string): string {
  // Lowercase on purpose: the substitution lands mid-sentence, inside an
  // upstream message this code does not otherwise rewrite.
  return message.replace(MARGIN_ACCOUNT, "leverage trading").replace(VENUE, "Ark");
}
