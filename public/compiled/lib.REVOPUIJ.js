import {
  __commonJS,
  __toESM
} from "./lib.KO2KTNGK.js";

// ../../../../../node_modules/.pnpm/tablesort@5.7.0/node_modules/tablesort/src/tablesort.js
var require_tablesort = __commonJS({
  "../../../../../node_modules/.pnpm/tablesort@5.7.0/node_modules/tablesort/src/tablesort.js"(exports, module) {
    (function() {
      function Tablesort(el, options) {
        if (!(this instanceof Tablesort)) return new Tablesort(el, options);
        if (!el || el.tagName !== "TABLE") {
          throw new Error("Element must be a table");
        }
        this.init(el, options || {});
      }
      var sortOptions = [];
      var createEvent = function(name) {
        var evt;
        if (!window.CustomEvent || typeof window.CustomEvent !== "function") {
          evt = document.createEvent("CustomEvent");
          evt.initCustomEvent(name, false, false, void 0);
        } else {
          evt = new CustomEvent(name);
        }
        return evt;
      };
      var getInnerText = function(el, options) {
        var sortAttribute = options.sortAttribute || "data-sort";
        if (el.hasAttribute(sortAttribute)) {
          return el.getAttribute(sortAttribute);
        }
        return el.textContent || el.innerText || "";
      };
      var caseInsensitiveSort = function(a, b) {
        a = a.trim().toLowerCase();
        b = b.trim().toLowerCase();
        if (a === b) return 0;
        if (a < b) return 1;
        return -1;
      };
      var getCellByKey = function(cells, key) {
        return [].slice.call(cells).find(function(cell) {
          return cell.getAttribute("data-sort-column-key") === key;
        });
      };
      var stabilize = function(sort, antiStabilize) {
        return function(a, b) {
          var unstableResult = sort(a.td, b.td);
          if (unstableResult === 0) {
            if (antiStabilize) return b.index - a.index;
            return a.index - b.index;
          }
          return unstableResult;
        };
      };
      Tablesort.extend = function(name, pattern, sort) {
        if (typeof pattern !== "function" || typeof sort !== "function") {
          throw new Error("Pattern and sort must be a function");
        }
        sortOptions.push({
          name,
          pattern,
          sort
        });
      };
      Tablesort.prototype = {
        init: function(el, options) {
          var that = this, firstRow, defaultSort, i, cell;
          that.table = el;
          that.thead = false;
          that.options = options;
          if (el.rows && el.rows.length > 0) {
            if (el.tHead && el.tHead.rows.length > 0) {
              for (i = 0; i < el.tHead.rows.length; i++) {
                if (el.tHead.rows[i].getAttribute("data-sort-method") === "thead") {
                  firstRow = el.tHead.rows[i];
                  break;
                }
              }
              if (!firstRow) {
                firstRow = el.tHead.rows[el.tHead.rows.length - 1];
              }
              that.thead = true;
            } else {
              firstRow = el.rows[0];
            }
          }
          if (!firstRow) return;
          var onClick = function() {
            if (that.current && that.current !== this) {
              that.current.removeAttribute("aria-sort");
            }
            that.current = this;
            that.sortTable(this);
          };
          for (i = 0; i < firstRow.cells.length; i++) {
            cell = firstRow.cells[i];
            cell.setAttribute("role", "columnheader");
            if (cell.getAttribute("data-sort-method") !== "none") {
              cell.tabIndex = 0;
              cell.addEventListener("click", onClick, false);
              cell.addEventListener("keydown", function(event) {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onClick.call(this);
                }
              });
              if (cell.getAttribute("data-sort-default") !== null) {
                defaultSort = cell;
              }
            }
          }
          if (defaultSort) {
            that.current = defaultSort;
            that.sortTable(defaultSort);
          }
        },
        sortTable: function(header, update) {
          var that = this, columnKey = header.getAttribute("data-sort-column-key"), column = header.cellIndex, sortFunction = caseInsensitiveSort, item = "", items = [], i = that.thead ? 0 : 1, sortMethod = header.getAttribute("data-sort-method"), sortReverse = header.hasAttribute("data-sort-reverse"), sortOrder = header.getAttribute("aria-sort");
          that.table.dispatchEvent(createEvent("beforeSort"));
          if (!update) {
            if (sortOrder === "ascending") {
              sortOrder = "descending";
            } else if (sortOrder === "descending") {
              sortOrder = "ascending";
            } else {
              sortOrder = !!that.options.descending != sortReverse ? "descending" : "ascending";
            }
            header.setAttribute("aria-sort", sortOrder);
          }
          if (that.table.rows.length < 2) return;
          if (!sortMethod) {
            var cell;
            while (items.length < 3 && i < that.table.tBodies[0].rows.length) {
              if (columnKey) {
                cell = getCellByKey(that.table.tBodies[0].rows[i].cells, columnKey);
              } else {
                cell = that.table.tBodies[0].rows[i].cells[column];
              }
              item = cell ? getInnerText(cell, that.options) : "";
              item = item.trim();
              if (item.length > 0) {
                items.push(item);
              }
              i++;
            }
            if (!items) return;
          }
          for (i = 0; i < sortOptions.length; i++) {
            item = sortOptions[i];
            if (sortMethod) {
              if (item.name === sortMethod) {
                sortFunction = item.sort;
                break;
              }
            } else if (items.every(item.pattern)) {
              sortFunction = item.sort;
              break;
            }
          }
          that.col = column;
          for (i = 0; i < that.table.tBodies.length; i++) {
            var newRows = [], noSorts = {}, j, totalRows = 0, noSortsSoFar = 0;
            if (that.table.tBodies[i].rows.length < 2) continue;
            for (j = 0; j < that.table.tBodies[i].rows.length; j++) {
              var cell;
              item = that.table.tBodies[i].rows[j];
              if (item.getAttribute("data-sort-method") === "none") {
                noSorts[totalRows] = item;
              } else {
                if (columnKey) {
                  cell = getCellByKey(item.cells, columnKey);
                } else {
                  cell = item.cells[that.col];
                }
                newRows.push({
                  tr: item,
                  td: cell ? getInnerText(cell, that.options) : "",
                  index: totalRows
                });
              }
              totalRows++;
            }
            if (sortOrder === "descending") {
              newRows.sort(stabilize(sortFunction, true));
            } else {
              newRows.sort(stabilize(sortFunction, false));
              newRows.reverse();
            }
            for (j = 0; j < totalRows; j++) {
              if (noSorts[j]) {
                item = noSorts[j];
                noSortsSoFar++;
              } else {
                item = newRows[j - noSortsSoFar].tr;
              }
              that.table.tBodies[i].appendChild(item);
            }
          }
          that.table.dispatchEvent(createEvent("afterSort"));
        },
        refresh: function() {
          if (this.current !== void 0) {
            this.sortTable(this.current, true);
          }
        }
      };
      if (typeof module !== "undefined" && module.exports) {
        module.exports = Tablesort;
      } else {
        window.Tablesort = Tablesort;
      }
    })();
  }
});

// ../lib/src/tablesort.ts
var import_tablesort = __toESM(require_tablesort(), 1);
function sortTable(el, options) {
  return (0, import_tablesort.default)(el, options);
}
function extendTablesortNumber() {
  import_tablesort.default.extend(
    "number",
    (item) => item.match(/^[-+]?(\d)*-?([,\.]){0,1}-?(\d)+([E,e][\-+][\d]+)?%?$/),
    (a, b) => validNum(b) - validNum(a)
  );
}
var validNum = (i) => {
  const num = parseFloat(i.replace(/[^\-?0-9.]/g, ""));
  return isNaN(num) ? 0 : num;
};

export {
  sortTable,
  extendTablesortNumber
};
//# sourceMappingURL=lib.REVOPUIJ.js.map
