---
date: 2026-09-23
feature: Mixpanel ingestion moves from the EU host to the US host
scope: chore
scenario-impact: none
---

# Analytics: ingestion moves to Mixpanel's US region

`/api/relay` now forwards to `https://api.mixpanel.com` instead of
`https://api-eu.mixpanel.com`. One constant,
`MIXPANEL_INGEST_HOST` in `lib/analytics/relay.ts`, which both the browser SDK
and the relay route read, so the two cannot disagree.

Nothing else about tracking changes: the same events, the same properties, the
same relay paths, the same token.

## Before this ships

**The Mixpanel project has to actually be in the US region.** Mixpanel rejects a
project's events at the wrong region's host, so if project 4051122 is still
EU-resident, every event will start failing the moment this deploys. Confirm the
project's residency in Mixpanel first. A project's region is set when it is
created and is not something the app can change.

If the project is being moved rather than replaced, note that Mixpanel does not
migrate existing data between regions: history stays in the old region.

## Data protection

This changes which country Ark's product analytics are stored in, from the EU to
the United States. That is a legal change, not just a configuration one:

- The privacy policy said "stored in Mixpanel's European Union data centre" and
  now says United States. Legal should confirm the wording and whether anything
  else in the policy depends on it.
- The policy's existing transfers section already discloses processing in the
  United States, so the disclosure itself is not new.
- If any NDPR or GDPR assessment, processor record or customer commitment named
  EU storage for analytics, it needs revisiting. This repo cannot tell whether
  one exists.

The relay still forwards only the project token and the visitor's public IP, and
still strips everything else, so what is sent is unchanged. Only its destination
moved.
