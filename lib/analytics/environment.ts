// Which deployment an event or report came from.
//
// Vercel sets NEXT_PUBLIC_VERCEL_ENV to production, preview or development;
// a local run falls back to the node environment. Mixpanel and Watchtower both
// read it from here, so the two tools never disagree about where something
// happened.
//
// There is one Mixpanel project for every environment, so this is what keeps
// preview and local traffic out of reports on real users: they filter on
// `environment = production`.
export const ANALYTICS_ENVIRONMENT =
  process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? "development";
