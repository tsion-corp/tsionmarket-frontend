import { redirect } from "next/navigation";

// One game, and the link players shared. Hidden on production for the reason in
// ../page.tsx: an opened game's pot cannot be settled automatically today, so
// the app must not open one, including from a link somebody already has.
export default function LastStandingGamePage() {
  redirect("/casino");
}
