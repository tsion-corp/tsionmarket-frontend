import {
  h
} from "./lib.LWF5S4ZV.js";

// ../lib/src/view/userLink.ts
var userLink = (u) => h("a", userLinkData(u), [userLine(u), ...fullName(u), u.rating && ` ${userRating(u)} `]);
var userLinkData = (u) => ({
  // can't be inlined because of thunks
  class: { "user-link": true, ulpt: u.name !== "ghost", online: !!u.online },
  attrs: { href: `/@/${u.name}`, ...u.attrs }
});
var userFlair = (u) => u.flair ? h("img.uflair", { attrs: { src: site.asset.flairSrc(u.flair) } }) : void 0;
var userLine = (u) => u.line !== false ? h("icon.line", {
  class: {
    patron: !!u.patronColor,
    moderator: !!u.moderator,
    ...u.patronColor ? { [`paco${u.patronColor}`]: true } : {}
  },
  attrs: u.patronColor ? { title: "Lichess Patron" } : {}
}) : void 0;
var userTitle = ({ title }) => title ? h("span.utitle", title === "BOT" ? { attrs: { "data-bot": true } } : {}, [title, "\xA0"]) : void 0;
var fullName = (u) => [userTitle(u), u.name, userFlair(u)];
var userRating = (u) => {
  if (u.rating) {
    const rating = `${u.rating}${u.provisional ? "?" : ""}`;
    return u.brackets !== false ? `(${rating})` : rating;
  }
  return void 0;
};
var ratingDiff = ({ ratingDiff: ratingDiff2 }) => ratingDiff2 === 0 ? h("span", "\xB10") : ratingDiff2 && ratingDiff2 > 0 ? h("good", "+" + ratingDiff2) : ratingDiff2 && ratingDiff2 < 0 ? h("bad", "\u2212" + -ratingDiff2) : void 0;

export {
  userLink,
  userLinkData,
  userFlair,
  userLine,
  userTitle,
  fullName,
  userRating,
  ratingDiff
};
//# sourceMappingURL=lib.BMKV23O2.js.map
