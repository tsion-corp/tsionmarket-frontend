export const COMBO_EVENT_PAGE_SIZE = 12;

// Polymarket keeps sports-team metadata for five minutes and disables focus
// and reconnect refetches. Filters use the same metadata policy here.
export const COMBO_FILTER_STALE_TIME = 5 * 60 * 1000;
export const COMBO_FILTER_GC_TIME = 5 * 60 * 1000;
export const COMBO_TEAM_STALE_TIME = 5 * 60 * 1000;
export const COMBO_TEAM_GC_TIME = 5 * 60 * 1000;

// Odds are executable data. Keep them fresh while avoiding a request for every
// render or tab change; event detail also polls on this interval while open.
export const COMBO_EVENT_STALE_TIME = 15 * 1000;
export const COMBO_EVENT_GC_TIME = 5 * 60 * 1000;
