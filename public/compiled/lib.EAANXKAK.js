// ../lib/src/i18n.ts
var displayLocale = document.documentElement.lang.startsWith("ar-") ? "ar-ly" : document.documentElement.lang;
var commonDateFormatter = new Intl.DateTimeFormat(displayLocale, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "numeric"
});
var commonDateFormat = commonDateFormatter.format;
var timeago = (date) => formatAgo((Date.now() - toDate(date).getTime()) / 1e3);
var IS_NUMBER = /^\d+$/;
var toDate = (input) => {
  if (input instanceof Date) return input;
  else if (typeof input === "string") return new Date(IS_NUMBER.test(input) ? Number(input) : input);
  return new Date(input);
};
var use24h = () => !commonDateFormatter.resolvedOptions().hour12;
var formatAgo = (seconds) => {
  const absSeconds = Math.abs(seconds);
  const strIndex = seconds < 0 ? 1 : 0;
  const unit = agoUnits.find((unit2) => absSeconds >= unit2[2] * unit2[3] && unit2[strIndex]);
  const fmt = i18n.timeago[unit[strIndex]];
  return typeof fmt === "string" ? fmt : fmt(Math.floor(absSeconds / unit[2]));
};
var agoUnits = [
  ["nbYearsAgo", "inNbYears", 60 * 60 * 24 * 365, 1],
  ["nbMonthsAgo", "inNbMonths", 60 * 60 * 24 * 365 / 12, 1],
  ["nbWeeksAgo", "inNbWeeks", 60 * 60 * 24 * 7, 1],
  ["nbDaysAgo", "inNbDays", 60 * 60 * 24, 2],
  ["nbHoursAgo", "inNbHours", 60 * 60, 1],
  ["nbMinutesAgo", "inNbMinutes", 60, 1],
  [void 0, "inNbSeconds", 1, 9],
  ["rightNow", "justNow", 1, 0]
];
var numberFormatter = false;
var getNumberFormatter = () => {
  if (numberFormatter === false)
    numberFormatter = window.Intl && Intl.NumberFormat ? new Intl.NumberFormat(displayLocale) : null;
  return numberFormatter;
};
var numberFormat = (n) => {
  const nf = getNumberFormatter();
  return nf ? nf.format(n) : String(n);
};
var currencyFormat = (n, currency, options) => {
  const nf = getNumberFormatter();
  if (!nf) return currency + " " + n;
  return new Intl.NumberFormat(displayLocale, { style: "currency", currency, ...options }).format(n);
};
var currencyDigitsCache = /* @__PURE__ */ new Map();
var getCurrencyDigits = (currency) => {
  var _a;
  const cached = currencyDigitsCache.get(currency);
  if (cached !== void 0) return cached;
  try {
    const nf = new Intl.NumberFormat(displayLocale, {
      style: "currency",
      currency
    });
    const digits = (_a = nf.resolvedOptions().maximumFractionDigits) != null ? _a : 2;
    currencyDigitsCache.set(currency, digits);
    return digits;
  } catch (e) {
    return 2;
  }
};
var roundToCurrency = (n, currency) => {
  const digits = getCurrencyDigits(currency);
  const factor = Math.pow(10, digits);
  return Math.round((n + Number.EPSILON) * factor) / factor;
};
var percentFormat = (n, precision) => getNumberFormatter() ? new Intl.NumberFormat(displayLocale, { style: "percent", minimumFractionDigits: precision }).format(n) : n.toFixed(precision) + "%";
var numberSpread = (el, nbSteps, duration, previous) => {
  let displayed;
  const display = (prev, cur, it) => {
    const val = numberFormat(Math.round((prev * (nbSteps - 1 - it) + cur * (it + 1)) / nbSteps));
    if (val !== displayed) {
      el.textContent = val;
      displayed = val;
    }
  };
  let timeouts = [];
  return (nb, overrideNbSteps) => {
    if (!el || !nb && nb !== 0) return;
    if (overrideNbSteps) nbSteps = Math.abs(overrideNbSteps);
    timeouts.forEach(clearTimeout);
    timeouts = [];
    const prev = previous === 0 ? 0 : previous || nb;
    previous = nb;
    const interv = Math.abs(duration / nbSteps);
    for (let i = 0; i < nbSteps; i++)
      timeouts.push(setTimeout(display.bind(null, prev, nb, i), Math.round(i * interv)));
  };
};

export {
  displayLocale,
  commonDateFormat,
  timeago,
  toDate,
  use24h,
  formatAgo,
  numberFormat,
  currencyFormat,
  roundToCurrency,
  percentFormat,
  numberSpread
};
//# sourceMappingURL=lib.EAANXKAK.js.map
