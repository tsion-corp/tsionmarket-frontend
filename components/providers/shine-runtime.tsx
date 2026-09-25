"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useShine } from "@/hooks/use-shine";
import { configureShine } from "@/lib/shine";

// The one thing that switches Shine on.
//
// lib/shine has no account, no preference and no catalogue of its own: it is
// reached from seven features through `reportShine`, which is a plain function
// call on a confirmed trade and cannot be a hook. Until something installs a
// runtime, every one of those calls traces SHINE_NOT_CONFIGURED and nothing is
// posted. This is that something, and it is mounted once for the whole session
// rather than per service page, because a memecoin swap can confirm while the
// user is reading their portfolio.
//
// WHY `mayPost` AND NOT `isOn`
//
// They answer different questions and only one of them is a decision. `isOn`
// is what the switch DRAWS, and it shows ON while the account's record is
// still loading, because a control that says OFF for a moment tells someone
// they are private at the exact moment the app may be about to post for them.
// `mayPost` is false until the record is actually in hand.
//
// Wiring `isOn` here would take that display default and publish on it: a
// person who turned Shine off for perps would have their next close posted
// during the seconds before their own preference arrived, publicly and with
// no way to retract it. See hooks/use-shine.ts, where the split is written
// down. `isEnabled` may return null for "not known yet" and reportShine
// treats anything but `true` as off, so `mayPost` fits it exactly.

/**
 * Installs the Shine runtime for the signed-in session. Renders nothing.
 *
 * Mounted inside DecaneKit, the query client and the next-intl provider,
 * because it needs the account, the account's preferences and the author's
 * catalogue.
 *
 * `paused` holds every post back whatever the preferences say. The session
 * providers pass the account-upgrade state here (features/migrate's
 * ShineRuntimeUnderMigration), which this file may not read itself: a post
 * made under a Decane id whose old Square profile is not linked yet would
 * make the Square's empty placeholder profile somebody's account and split
 * the person for good. This layer knows nothing of that; it only pauses.
 */
export function ShineRuntimeProvider({ paused = false }: { paused?: boolean }) {
  const { userId: accountDid } = useAuthSession();
  const { mayPost } = useShine();
  // Namespaced at `shine.post`: the composer names keys below it and nothing
  // else, so this hands over the thirteen sentences and none of the UI copy.
  const t = useTranslations("shine.post");

  useEffect(() => {
    // Re-installed whenever the account, the preferences or the catalogue
    // change. `t` is memoised on the locale and the messages behind it, so
    // switching language re-runs this and the next post is written in the new
    // one; `configureShine` keeps the queue when the DID has not changed, so
    // re-running does not starve a post that is mid-flight.
    configureShine({
      accountDid,
      isEnabled: (service) => !paused && mayPost(service),
      translate: (key, values) => t(key, values),
    });
  }, [accountDid, mayPost, paused, t]);

  // Teardown belongs to unmount alone, not to every re-install above.
  // `configureShine(null)` drops the queue, and doing that on an ordinary
  // preference change would throw away posts nobody decided to throw away.
  useEffect(() => () => configureShine(null), []);

  return null;
}
