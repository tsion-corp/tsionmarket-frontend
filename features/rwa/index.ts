// What the rest of the app may use from the real assets slice. Nothing outside
// reaches past this file.

// The desk at /rwa, and the Real assets tab of the phone Market page. Two
// surfaces over one catalogue: the desk pairs the asset list with the order
// ticket, and the tab swaps one for the other in place.
export { RwaDeskView } from "./components/rwa-desk-view";
export { RwaSection } from "./components/rwa-section";
export { RwaSettlementTracker } from "./components/rwa-settlement-tracker";

// The standalone trade modal, opened from the app-wide modal host for a "Trade"
// pressed anywhere outside the desk.
export { RwaTradeModal } from "./components/rwa-trade-modal";

export { useRwaAssets, useListedRwaAssets } from "./hooks/use-rwa-assets";

export { rwaLogoUrl } from "./lib/api";
export type { RwaApiAsset, RwaChain } from "./lib/api";
