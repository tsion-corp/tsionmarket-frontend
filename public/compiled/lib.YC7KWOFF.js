import {
  Chart
} from "./lib.Q3AEFXB3.js";
import {
  currentTheme
} from "./lib.S3TIZ2HQ.js";

// ../chart/src/index.ts
var chartYMax = 1.05;
var chartYMin = -chartYMax;
var lightTheme = currentTheme() === "light";
var orangeAccent = "#d85000";
var whiteFill = lightTheme ? "rgb(255 255 255 / 0.7)" : "rgb(255 255 255 / 0.3)";
var blackFill = lightTheme ? "rgb(0 0 0 / 0.2)" : "rgb(0 0 0 / 1)";
var fontColor = lightTheme ? "#2F2F2F" : "hsl(0 0% 73%)";
var gridColor = lightTheme ? "#ccc" : "#404040";
var hoverBorderColor = lightTheme ? gridColor : "white";
var tooltipBgColor = lightTheme ? "rgb(255 255 255 / 0.85)" : "rgb(22 21 18 / 0.85)";
var zeroLineColor = lightTheme ? "#959595" : "#676664";
var axisOpts = (xmin, xmax) => ({
  x: {
    display: false,
    type: "linear",
    min: xmin,
    max: xmax,
    offset: false
  },
  y: {
    // Set equidistant max and min to center the graph at y=0.
    min: chartYMin,
    max: chartYMax,
    border: { display: false },
    ticks: { display: false },
    grid: {
      color: (ctx) => ctx.tick.value === 0 ? zeroLineColor : void 0
    }
  }
});
function fontFamily(size, weight) {
  return {
    family: "'Noto Sans', 'Lucida Grande', 'Lucida Sans Unicode', Verdana, Arial, Helvetica, sans-serif",
    size: size != null ? size : 12,
    weight
  };
}
function maybeChart(el) {
  const ctx = el.getContext("2d");
  if (ctx) return Chart.getChart(ctx);
  return void 0;
}
function plyLine(ply, mainline = true) {
  return {
    xAxisID: "x",
    type: "line",
    label: "ply",
    data: [
      { x: ply, y: chartYMin },
      { x: ply, y: chartYMax }
    ],
    borderColor: orangeAccent,
    pointRadius: 0,
    pointHoverRadius: 0,
    borderWidth: 1,
    animation: false,
    segment: !mainline ? { borderDash: [5] } : void 0,
    order: 0,
    datalabels: { display: false }
  };
}
function selectPly(ply, onMainline) {
  const index = this.data.datasets.findIndex((dataset) => dataset.label === "ply");
  this.data.datasets[index] = plyLine(ply, onMainline);
  this.update("none");
}
var colorSeries = [
  "#2b908f",
  "#90ee7e",
  "#f45b5b",
  "#7798BF",
  "#aaeeee",
  "#ff0066",
  "#eeaaee",
  "#55BF3B",
  "#DF5353",
  "#7798BF",
  "#aaeeee"
];

export {
  chartYMax,
  chartYMin,
  orangeAccent,
  whiteFill,
  blackFill,
  fontColor,
  gridColor,
  hoverBorderColor,
  tooltipBgColor,
  axisOpts,
  fontFamily,
  maybeChart,
  plyLine,
  selectPly,
  colorSeries
};
/*! Bundled license information:

chart.js/dist/helpers.js:
  (*!
   * Chart.js v4.5.1
   * https://www.chartjs.org
   * (c) 2025 Chart.js Contributors
   * Released under the MIT License
   *)
*/
//# sourceMappingURL=lib.YC7KWOFF.js.map
