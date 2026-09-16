import {
  plugin
} from "./lib.EUZVEQQ4.js";
import {
  axisOpts,
  blackFill,
  chartYMax,
  chartYMin,
  colorSeries,
  fontColor,
  fontFamily,
  gridColor,
  maybeChart,
  orangeAccent,
  plyLine,
  selectPly,
  tooltipBgColor,
  whiteFill
} from "./lib.YC7KWOFF.js";
import {
  BarController,
  BarElement,
  Chart,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  index,
  plugin_tooltip
} from "./lib.Q3AEFXB3.js";
import {
  renderEval,
  winningChances_exports
} from "./lib.6Z4MCRO3.js";
import "./lib.MFOXABY3.js";
import "./lib.MYPIOGN5.js";
import {
  plyToTurn
} from "./lib.LRP46MC3.js";
import "./lib.HMFK7OOB.js";
import "./lib.AEOHBIQD.js";
import "./lib.RPQH5UYI.js";
import "./lib.XAEDCBGD.js";
import "./lib.X7H2PLEK.js";
import {
  COLORS
} from "./lib.53PYQRAK.js";
import "./lib.CAO7TYYH.js";
import "./lib.PNHYIP7B.js";
import "./lib.S3TIZ2HQ.js";
import "./lib.LWF5S4ZV.js";
import {
  pubsub
} from "./lib.QPQZCXK2.js";
import "./lib.5I4BSVKX.js";
import "./lib.TT4QSUKQ.js";
import "./lib.NFSQQWN5.js";
import {
  defined
} from "./lib.GMEH5BEF.js";
import "./lib.KO2KTNGK.js";

// ../chart/src/division.ts
function division_default(div) {
  const lines = [];
  if (div == null ? void 0 : div.middle) {
    if (div.middle > 1) lines.push({ div: i18n.site.opening, loc: 1 });
    lines.push({ div: i18n.site.middlegame, loc: div.middle });
  }
  if (div == null ? void 0 : div.end) {
    if (div.end > 1 && !(div == null ? void 0 : div.middle)) lines.push({ div: i18n.site.middlegame, loc: 0 });
    lines.push({ div: i18n.site.endgame, loc: div.end });
  }
  const annotationColor = "#707070";
  return lines.map((line) => ({
    type: "line",
    xAxisID: "x",
    yAxisID: "y",
    label: line.div,
    data: [
      { x: line.loc, y: chartYMin },
      { x: line.loc, y: chartYMax }
    ],
    pointHoverRadius: 0,
    borderWidth: 1,
    borderColor: annotationColor,
    pointRadius: 0,
    order: 1,
    datalabels: {
      offset: -5,
      align: 45,
      rotation: 90,
      formatter: (val) => val.y && val.y > 0 ? line.div : ""
    }
  }));
}

// ../chart/src/acpl.ts
Chart.register(LineController, LinearScale, PointElement, LineElement, plugin_tooltip, index, plugin);
async function acpl_default(el, data, mainline) {
  const possibleChart = maybeChart(el);
  if (possibleChart) return possibleChart;
  const blurBackgroundColorWhite = "white";
  const blurBackgroundColorBlack = "black";
  const ply = plyLine(0);
  const divisionLines = division_default(data.game.division);
  const firstPly = mainline[0].ply;
  const isPartial = (d) => !d.analysis || !!d.analysis.partial;
  const makeDataset = (d, mainline2) => {
    const pointBackgroundColors = [];
    const adviceHoverColors2 = [];
    const moveLabels2 = [];
    const pointStyles = [];
    const pointSizes = [];
    const winChances = [];
    const blurs = [toBlurArray(d.player), toBlurArray(d.opponent)];
    if (d.player.color === "white") blurs.reverse();
    mainline2.slice(1).map((node) => {
      var _a, _b, _c, _d;
      const isWhite = (node.ply & 1) === 1;
      let cp = node.eval && 0;
      if ((_a = node.eval) == null ? void 0 : _a.mate) cp = node.eval.mate > 0 ? Infinity : -Infinity;
      else if ((_b = node.san) == null ? void 0 : _b.includes("#")) cp = isWhite ? Infinity : -Infinity;
      if (cp && d.game.variant.key === "antichess" && ((_c = node.san) == null ? void 0 : _c.includes("#"))) cp = -cp;
      else if ((_d = node.eval) == null ? void 0 : _d.cp) cp = node.eval.cp;
      const turn = plyToTurn(node.ply);
      const dots = isWhite ? "." : "...";
      const winchance = winningChances_exports.povChances("white", { cp });
      winChances.push({ x: node.ply, y: winchance });
      const { advice, color: glyphColor } = glyphProperties(node);
      const label = turn + dots + " " + node.san;
      let annotation = "";
      if (advice) annotation = ` [${i18n.site[advice]}]`;
      const isBlur = blurs[isWhite ? 1 : 0][Math.floor((node.ply - (d.game.startedAtTurn || 0) - 1) / 2)] === "1";
      if (isBlur) annotation = " [blur]";
      moveLabels2.push(label + annotation);
      pointStyles.push(isBlur ? "rect" : "circle");
      pointSizes.push(isBlur ? 5 : 0);
      pointBackgroundColors.push(
        isBlur ? isWhite ? blurBackgroundColorWhite : blurBackgroundColorBlack : orangeAccent
      );
      adviceHoverColors2.push(glyphColor != null ? glyphColor : orangeAccent);
    });
    return {
      acpl: {
        label: i18n.site.advantage,
        data: winChances,
        borderWidth: 1,
        fill: {
          target: "origin",
          below: blackFill,
          above: whiteFill
        },
        pointRadius: d.player.blurs || d.opponent.blurs ? pointSizes : 0,
        pointHoverRadius: 5,
        pointHitRadius: 100,
        borderColor: orangeAccent,
        pointBackgroundColor: pointBackgroundColors,
        pointStyle: pointStyles,
        hoverBackgroundColor: orangeAccent,
        order: 5,
        datalabels: { display: false }
      },
      moveLabels: moveLabels2,
      adviceHoverColors: adviceHoverColors2
    };
  };
  const dataset = makeDataset(data, mainline);
  const acpl = dataset.acpl;
  const moveLabels = dataset.moveLabels;
  let adviceHoverColors = dataset.adviceHoverColors;
  const config = {
    type: "line",
    data: {
      labels: moveLabels.map((_, index2) => index2),
      datasets: [acpl, ply, ...divisionLines]
    },
    options: {
      interaction: {
        mode: "nearest",
        axis: "x",
        intersect: false
      },
      scales: axisOpts(firstPly + 1, mainline.length + firstPly),
      animation: false,
      maintainAspectRatio: false,
      responsive: true,
      plugins: {
        tooltip: {
          borderColor: fontColor,
          borderWidth: 1,
          backgroundColor: tooltipBgColor,
          bodyColor: fontColor,
          titleColor: fontColor,
          titleFont: fontFamily(14, "bold"),
          bodyFont: fontFamily(13),
          caretPadding: 10,
          displayColors: false,
          filter: (item) => item.datasetIndex === 0,
          callbacks: {
            label: (item) => {
              var _a;
              const ev = (_a = mainline[item.dataIndex + 1]) == null ? void 0 : _a.eval;
              if (!ev) return "";
              return i18n.site.advantage + ": " + (defined(ev.mate) ? "#" + ev.mate : renderEval(ev.cp));
            },
            title: (items) => items[0] ? moveLabels[items[0].dataIndex] : ""
          }
        }
      },
      onClick(_event, elements, _chart) {
        const data2 = elements[elements.findIndex((element) => element.datasetIndex === 0)];
        if (data2) pubsub.emit("analysis.chart.click", data2.index);
      }
    }
  };
  const acplChart = new Chart(el, config);
  acplChart.selectPly = selectPly.bind(acplChart);
  acplChart.updateData = (d, mainline2) => {
    const dataset2 = makeDataset(d, mainline2);
    adviceHoverColors = dataset2.adviceHoverColors;
    const acpl2 = dataset2.acpl;
    acplChart.data.datasets[0].data = acpl2.data;
    if (!isPartial(data)) christmasTree(acplChart, mainline2, adviceHoverColors);
    acplChart.update("none");
  };
  pubsub.on("ply", acplChart.selectPly);
  pubsub.emit("ply.trigger");
  if (!isPartial(data)) christmasTree(acplChart, mainline, adviceHoverColors);
  return acplChart;
}
var glyphProperties = (node) => {
  var _a, _b, _c;
  if ((_a = node.glyphs) == null ? void 0 : _a.some((g) => g.id === 4)) return { advice: "blunder", color: "#db3031" };
  else if ((_b = node.glyphs) == null ? void 0 : _b.some((g) => g.id === 2)) return { advice: "mistake", color: "#e69d00" };
  else if ((_c = node.glyphs) == null ? void 0 : _c.some((g) => g.id === 6)) return { advice: "inaccuracy", color: "#4da3d5" };
  else return { advice: void 0, color: void 0 };
};
var toBlurArray = (player) => {
  var _a, _b, _c;
  return (_c = (_b = (_a = player.blurs) == null ? void 0 : _a.bits) == null ? void 0 : _b.split("")) != null ? _c : [];
};
function christmasTree(chart, mainline, hoverColors) {
  $("div.advice-summary").on("mouseenter", "div.symbol", function() {
    if (!chart.canvas.isConnected) return;
    const symbol = this.getAttribute("data-symbol");
    const playerColorBit = this.getAttribute("data-color") === "white" ? 1 : 0;
    const acplDataset = chart.data.datasets[0];
    if (symbol === "??" || symbol === "?!" || symbol === "?") {
      acplDataset.pointHoverBackgroundColor = hoverColors;
      acplDataset.pointBorderColor = hoverColors;
      const points = mainline.filter(
        (node) => {
          var _a;
          return ((_a = node.glyphs) == null ? void 0 : _a.some((glyph) => glyph.symbol === symbol)) && (node.ply & 1) === playerColorBit;
        }
      ).map((node) => ({ datasetIndex: 0, index: node.ply - mainline[0].ply - 1 }));
      chart.setActiveElements(points);
      chart.update("none");
    }
  }).on("mouseleave", "div.symbol", function() {
    if (!chart.canvas.isConnected) return;
    chart.setActiveElements([]);
    chart.data.datasets[0].pointHoverBackgroundColor = orangeAccent;
    chart.data.datasets[0].pointBorderColor = orangeAccent;
    chart.update("none");
  });
}

// ../chart/src/movetime.ts
Chart.register(LineController, LinearScale, PointElement, LineElement, plugin_tooltip, BarElement, BarController);
async function movetime_default(el, data, hunter) {
  const possibleChart = maybeChart(el);
  if (possibleChart) return possibleChart;
  const moveCentis = data.game.moveCentis;
  if (!moveCentis) return void 0;
  const moveSeries = {
    white: [],
    black: []
  };
  const totalSeries = {
    white: [],
    black: []
  };
  const labels = [];
  const blueLineColor = "#3893e8";
  const pointStyles = { white: [], black: [] };
  const pointRadius = { white: [], black: [] };
  const tree = data.treeParts;
  const firstPly = tree[0].ply;
  for (let i = 0; i <= firstPly; i++) labels.push({ title: "", label: [""] });
  const showTotal = !hunter;
  const logC = Math.pow(Math.log(3), 2);
  const blurs = [toBlurArray2(data.player), toBlurArray2(data.opponent)];
  if (data.player.color === "white") blurs.reverse();
  moveCentis.forEach((centis, x) => {
    const node = tree[x + 1];
    if (!tree[x]) return;
    const ply = node ? node.ply : tree[x].ply + 1;
    const san = node ? node.san : "-";
    const turn = ply + 1 >> 1;
    const color = ply & 1;
    const colorName = color ? "white" : "black";
    const y = Math.pow(Math.log(5e-3 * Math.min(centis, 12e4) + 3), 2) - logC;
    let title = turn + (color ? ". " : "... ") + san;
    const movePoint = {
      x: node ? node.ply : tree[x].ply + 1,
      y: color ? y : -y
    };
    if (blurs[color].shift() === "1") {
      pointStyles[colorName].push("rect");
      pointRadius[colorName].push(4.5);
      title += " [blur]";
    } else {
      pointStyles[colorName].push("circle");
      pointRadius[colorName].push(0);
    }
    const seconds = (centis / 100).toFixed(centis >= 200 ? 1 : 2);
    const label = [i18n.site.nbSeconds(Number(seconds))];
    moveSeries[colorName].push(movePoint);
    let clock = node ? node.clock : void 0;
    if (clock === void 0) {
      if (data.game.status.name === "outoftime") clock = 0;
      else if (data.clock) {
        const prevClock = tree[x - 1].clock;
        if (prevClock) clock = prevClock + data.clock.increment - centis;
      }
    }
    if (clock) {
      label.push(`${i18n.site.clock}: ${formatClock(clock)}`);
      totalSeries[colorName].push({
        x: node ? node.ply : tree[x].ply + 1,
        y: color ? clock : -clock
      });
    }
    labels.push({ title, label });
  });
  const colorSeriesMax = (series) => Math.max(...COLORS.flatMap((color) => series[color].map((point) => Math.abs(point.y))));
  const totalSeriesMax = colorSeriesMax(totalSeries);
  const moveSeriesMax = colorSeriesMax(moveSeries);
  const lineBuilder = (series, moveSeries2) => COLORS.map((color) => ({
    type: "line",
    data: series[color].map((point) => ({
      x: point.x,
      y: point.y / (moveSeries2 ? moveSeriesMax : totalSeriesMax)
    })),
    backgroundColor: color,
    borderColor: moveSeries2 && showTotal ? color === "white" ? "#838383" : "#3d3d3d" : blueLineColor,
    borderWidth: moveSeries2 && showTotal ? 1 : 1.5,
    pointHitRadius: moveSeries2 && showTotal ? 0 : 200,
    pointHoverBorderColor: moveSeries2 && !showTotal ? orangeAccent : blueLineColor,
    pointRadius: moveSeries2 && !showTotal ? pointRadius[color] : 0,
    pointHoverRadius: 5,
    pointStyle: moveSeries2 && !showTotal ? pointStyles[color] : void 0,
    fill: {
      target: "origin",
      above: moveSeries2 ? whiteFill : "rgb(153 153 153 / 0.3)",
      below: moveSeries2 ? blackFill : "rgb(0 0 0 / 0.3)"
    },
    order: moveSeries2 ? 2 : 1,
    datalabels: { display: false }
  }));
  const moveSeriesSet = showTotal ? COLORS.map((color) => ({
    type: "bar",
    data: moveSeries[color].map((point) => ({ x: point.x, y: point.y / moveSeriesMax })),
    backgroundColor: color,
    grouped: false,
    categoryPercentage: 2,
    barPercentage: 1,
    order: 2,
    borderColor: color === "white" ? "#838383" : "#616161",
    borderWidth: 1,
    datalabels: { display: false }
  })) : lineBuilder(moveSeries, true);
  const divisionLines = division_default(data.game.division);
  const datasets = [...moveSeriesSet];
  if (showTotal) datasets.push(...lineBuilder(totalSeries, false));
  datasets.push(plyLine(firstPly), ...divisionLines);
  const config = {
    type: "line",
    data: {
      labels,
      datasets
    },
    options: {
      maintainAspectRatio: false,
      responsive: true,
      animation: false,
      scales: axisOpts(
        firstPly + 1,
        // Omit game-ending action to sync acpl and movetime charts
        labels.length - (labels[labels.length - 1].title.includes("-") ? 1 : 0)
      ),
      plugins: {
        tooltip: {
          borderColor: fontColor,
          borderWidth: 1,
          backgroundColor: tooltipBgColor,
          caretPadding: 15,
          bodyColor: fontColor,
          titleColor: fontColor,
          titleFont: fontFamily(14, "bold"),
          bodyFont: fontFamily(13),
          displayColors: false,
          callbacks: {
            title: (items) => {
              if (!items[0].parsed.x) return void 0;
              const index2 = items[0].dataset.label === "bar" ? items[0].parsed.x * 2 : items[0].parsed.x;
              return index2 ? labels[index2].title : "";
            },
            label: (item) => {
              if (!item.parsed.x) return void 0;
              const index2 = item.dataset.label === "bar" ? item.parsed.x * 2 : item.parsed.x;
              return item.parsed.x ? labels[index2].label : "";
            }
          }
        }
      },
      onClick(_event, elements, _chart) {
        let blackOffset = elements[0].datasetIndex & 1;
        if ((firstPly & 1) !== 0) blackOffset = blackOffset ^ 1;
        pubsub.emit("analysis.chart.click", elements[0].index * 2 + blackOffset);
      }
    }
  };
  if (moveCentis) addGameDuration(el, moveCentis);
  const movetimeChart = new Chart(el, config);
  movetimeChart.selectPly = selectPly.bind(movetimeChart);
  pubsub.on("ply", movetimeChart.selectPly);
  pubsub.emit("ply.trigger");
  return movetimeChart;
}
var addGameDuration = (el, moveCentis) => {
  const chart = $(el);
  let label = chart.next(".game-duration");
  if (!label.length) label = $('<div class="game-duration">').insertAfter(chart);
  const duration = moveCentis.reduce((s, v) => s + v, 0);
  label.text(i18n.site.duration + " " + formatClock(duration));
};
var toBlurArray2 = (player) => {
  var _a;
  return ((_a = player.blurs) == null ? void 0 : _a.bits) ? player.blurs.bits.split("") : [];
};
var formatClock = (centis) => {
  let result = "";
  if (centis >= 60 * 60 * 100) result += Math.floor(centis / 60 / 6e3) + ":";
  result += Math.floor(centis % (60 * 6e3) / 6e3).toString().padStart(2, "0") + ":";
  const secs = centis % 6e3 / 100;
  if (centis < 6e3) result += secs.toFixed(2).padStart(5, "0");
  else result += Math.floor(secs).toString().padStart(2, "0");
  return result;
};

// ../chart/src/chart.game.ts
function initModule() {
  return {
    acpl: acpl_default,
    movetime: movetime_default
  };
}
export {
  colorSeries,
  fontFamily,
  gridColor,
  initModule,
  maybeChart,
  tooltipBgColor
};
//# sourceMappingURL=chart.game.GQXPTJCY.js.map
