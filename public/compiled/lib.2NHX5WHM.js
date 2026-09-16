import {
  get,
  set
} from "./lib.CAO7TYYH.js";
import {
  pubsub
} from "./lib.QPQZCXK2.js";
import {
  licon
} from "./lib.5I4BSVKX.js";

// ../lib/src/view/watchers.ts
var watchersData;
var name = (u) => u.includes(" ") ? u.split(" ")[1] : u;
function watchers(element, withUserList = true) {
  if (element.dataset.watched) return;
  element.dataset.watched = "1";
  const $innerElement = $('<div class="chat__members__inner">').appendTo(element);
  const $numberEl = $(
    `<div class="chat__members__number" data-icon="${licon.User}" title="Spectators"></div>`
  ).appendTo($innerElement);
  const $listEl = $("<div>").appendTo($innerElement);
  const listEl = $listEl[0];
  pubsub.on("socket.in.crowd", (data) => setWatchers(data.watchers || data));
  const setWatchers = (data) => {
    var _a, _b;
    watchersData = data;
    if (!(data == null ? void 0 : data.nb)) {
      element.classList.add("none");
      return;
    }
    $numberEl.text(withUserList ? String(data.nb) : i18n.broadcast.nbViewers(data.nb));
    if (data.users && withUserList) {
      const currUsers = data.users.map((u) => u || "").join(";");
      const currAnons = (_a = data.anons) != null ? _a : 0;
      if (get(listEl, "prevUsers") !== currUsers || ((_b = get(listEl, "prevAnons")) != null ? _b : 0) !== currAnons) {
        set(listEl, "prevUsers", currUsers);
        set(listEl, "prevAnons", currAnons);
        const tags = data.users.map(
          (u) => u ? `<a class="user-link ulpt" href="/@/${name(u)}">${u}</a>` : i18n.site.anonymous
        );
        if (currAnons) tags.push(i18n.site.nbAnonymous(currAnons));
        $listEl.html(tags.join(", "));
      }
    } else $listEl.html("");
    element.classList.remove("none");
  };
  if (watchersData) setWatchers(watchersData);
}

export {
  watchers
};
//# sourceMappingURL=lib.2NHX5WHM.js.map
