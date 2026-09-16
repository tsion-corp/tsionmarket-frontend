// Which leg of a trade ticket is being entered.
//
// It lives here, below every component that reads it, because more than one
// control needs the same union and two declarations of it drift. The side
// switch chooses it, the amount field is denominated by it, the summary words
// its rows from it and the action button sends it, so a second copy would be a
// second answer to one question.
export type TradeSide = "buy" | "sell";
