// ../lib/src/wikiBooks.ts
var wikiBooksUrl = "https://en.wikibooks.org";
var apiArgs = "redirects&origin=*&action=query&prop=extracts&formatversion=2&format=json&stable=1";
var removeH1 = (html) => html.replace(/<h1.+<\/h1>/g, "");
var removeEmptyParagraph = (html) => html.replace(/<p>(<br \/>|\s)*<\/p>/g, "");
var removeTheoryTableSection = (html) => html.replace(/<h2 data-mw-anchor="Theory_table">Theory table<\/h2>.*?(?=<h[1-6]|$)/gs, "");
var removeAllBlacksMovesSection = (html) => html.replace(
  /<h2 data-mw-anchor="All_possible_Black's_moves" data-mw-fallback-anchor="All_possible_Black\.27s_moves">All possible Black's moves<\/h2>.*?(?=<h[1-6]|$)/gs,
  ""
);
var removeAllPossibleRepliesSection = (html) => html.replace(/<h3 data-mw-anchor="All_possible_replies">All possible replies<\/h3>.*?(?=<h[1-6]|$)/gs, "");
var removeExternalLinksSection = (html) => html.replace(/<h2 data-mw-anchor="External_links">External links<\/h2>.*?(?=<h[1-6]|$)/gs, "");
var removeContributing = (html) => html.replace("When contributing to this Wikibook, please follow the Conventions for organization.", "");
var readMore = (title) => `<p><a target="_blank" href="${wikiBooksUrl}/wiki/${title}">Read more on WikiBooks</a></p>`;
var transformWikiHtml = (html, title) => removeH1(
  removeEmptyParagraph(
    removeTheoryTableSection(
      removeAllBlacksMovesSection(
        removeAllPossibleRepliesSection(removeExternalLinksSection(removeContributing(html)))
      )
    )
  )
) + readMore(title);

export {
  wikiBooksUrl,
  apiArgs,
  transformWikiHtml
};
//# sourceMappingURL=lib.TRB3Z2N6.js.map
