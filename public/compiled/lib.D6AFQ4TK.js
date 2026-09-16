import {
  require_dist
} from "./lib.BWJ4DVGT.js";
import {
  json,
  url
} from "./lib.TT4QSUKQ.js";
import {
  __toESM
} from "./lib.KO2KTNGK.js";

// ../lib/src/view/complete.ts
function complete(opts) {
  const minLength = opts.minLength || 3, empty = opts.empty || (() => '<div class="complete-list__empty">No results.</div>'), cache = /* @__PURE__ */ new Map(), fetchResults = async (term) => {
    if (cache.has(term)) return new Promise((res) => setTimeout(() => res(cache.get(term)), 50));
    else if (term.length > 3 && Array.from({ length: term.length - 3 }, (_, i) => -i - 1).map((i) => term.slice(0, i)).some((sub) => cache.has(sub) && !cache.get(sub).length))
      return Promise.resolve([]);
    return opts.fetch(term).then((results) => {
      cache.set(term, results);
      return results;
    });
  }, selectedResult = () => {
    if (selectedIndex === null) return void 0;
    return renderedResults[selectedIndex];
  }, moveSelection = (offset) => {
    const nb = renderedResults.length;
    selectedIndex = (selectedIndex === null ? offset === 1 ? 0 : -1 : selectedIndex + offset) % nb;
    if (selectedIndex < 0) selectedIndex += nb;
    renderSelection();
    const result = selectedResult();
    if (result) opts.input.value = opts.populate(result);
  }, renderSelection = () => {
    $container.find(".complete-selected").removeClass("complete-selected");
    if (selectedIndex !== null)
      $container.find(".complete-result").eq(selectedIndex).addClass("complete-selected");
  };
  const $container = $('<div class="complete-list none"></div>').insertAfter(opts.input);
  let selectedIndex = null, renderedResults = [];
  opts.input.autocomplete = "off";
  const update = () => {
    const term = opts.input.value.trim();
    if (term.length >= minLength && (!opts.regex || term.match(opts.regex)))
      fetchResults(term).then(renderResults, console.log);
    else $container.addClass("none");
  };
  $(opts.input).on({
    input: update,
    focus: update,
    // must be delayed, otherwise the result click event doesn't fire
    blur() {
      setTimeout(() => $container.addClass("none"), 100);
      return true;
    },
    keydown(e) {
      if ($container.hasClass("none")) return void 0;
      if (e.code === "ArrowDown") {
        moveSelection(1);
        return false;
      }
      if (e.code === "ArrowUp") {
        moveSelection(-1);
        return false;
      }
      if (e.code === "Enter") {
        $container.addClass("none");
        const result = selectedResult() || (renderedResults[0] && opts.populate(renderedResults[0]) === opts.input.value ? renderedResults[0] : void 0);
        if (result) {
          if (opts.onSelect) opts.onSelect(result);
          return false;
        }
      }
      return void 0;
    }
  });
  const renderResults = (results) => {
    $container.empty();
    if (results[0]) {
      results.forEach(
        (result) => $(opts.render(result)).on("mousedown touchdown", () => {
          const newValue = opts.populate(result);
          opts.input.value = newValue;
          if (opts.onSelect) opts.onSelect(result);
          return true;
        }).appendTo($container)
      );
    } else $container.html(empty());
    renderedResults = results;
    selectedIndex = null;
    renderSelection();
    $container.removeClass("none");
  };
}

// ../lib/src/view/userComplete.ts
var import_debounce_promise = __toESM(require_dist(), 1);
function userComplete(opts) {
  const debouncedXhr = (0, import_debounce_promise.default)((t) => fetchUsers(t, opts), 150);
  complete({
    input: opts.input,
    fetch: (t) => debouncedXhr(t).then(checkDebouncedResultAgainstTerm(t)),
    render: (o) => renderUserEntry(o, opts.tag),
    populate: opts.populate || ((r) => r.name),
    onSelect: opts.onSelect,
    regex: /^[a-z][\w-]{2,29}$/i
  });
  if (opts.focus) setTimeout(() => opts.input.focus());
}
var fetchUsers = async (term, { friend, tour, swiss, team }) => {
  const result = await json(
    url("/api/player/autocomplete", {
      term,
      friend: friend ? 1 : 0,
      tour,
      swiss,
      team,
      object: 1
    })
  );
  return { term, ...result };
};
var checkDebouncedResultAgainstTerm = (term) => (got) => term === got.term ? Promise.resolve(got.result) : Promise.reject(new Error("Debounced " + term));
var renderUserEntry = (o, tag = "a") => {
  const patronClass = o.patronColor ? ` paco${o.patronColor}` : "";
  const hrefAttr = tag === "a" ? "href" : "data-href";
  const title = o.title ? `<span class="utitle"${o.title === "BOT" ? ' data-bot="data-bot"' : ""}>${o.title}</span>&nbsp;` : "";
  const flair = o.flair ? `<img class="uflair" src="${site.asset.flairSrc(o.flair)}" alt="" />` : "";
  return `<${tag} class="complete-result ulpt user-link${o.online ? " online" : ""}" ${hrefAttr}="/@/${o.name}"><icon class="line${o.patron ? " patron" : ""}${patronClass}"></icon>${title}${o.name}${flair}</${tag}>`;
};

export {
  complete,
  userComplete,
  fetchUsers,
  checkDebouncedResultAgainstTerm,
  renderUserEntry
};
//# sourceMappingURL=lib.D6AFQ4TK.js.map
