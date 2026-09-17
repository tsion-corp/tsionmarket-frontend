import { redirect } from "next/navigation";

// Prediction is not offered on production: the gateway's `prediction` service,
// which the sportsbook and combo routes behind this page call, answers 502 on
// api.tsionark.com. `prediction-market` is a different service and is live;
// this page does not use it.
//
// The route is kept as a redirect rather than deleted so a shared link or a
// bookmark lands somewhere real instead of on a page whose every request
// fails. Restoring the section is restoring this file from git and taking
// "prediction" out of HIDDEN_NAV_SECTIONS in lib/sections.ts.
export default function PredictionMarketPage() {
  redirect("/dashboard");
}
