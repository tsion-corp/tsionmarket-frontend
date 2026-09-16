import {
  ShowResizeHandle
} from "./lib.CHCAIC5O.js";
import {
  pubsub
} from "./lib.QPQZCXK2.js";
import {
  text
} from "./lib.TT4QSUKQ.js";
import {
  debounce
} from "./lib.NFSQQWN5.js";

// ../lib/src/chessgroundResize.ts
var dispatchChessgroundResize = () => document.body.dispatchEvent(new Event("chessground.resize"));
function resizeHandle(els, pref, ply, visible) {
  if (pref === ShowResizeHandle.Never) return;
  const el = document.createElement("cg-resize");
  els.container.appendChild(el);
  const startResize = (start) => {
    start.preventDefault();
    const mousemoveEvent = start.type === "touchstart" ? "touchmove" : "mousemove", mouseupEvent = start.type === "touchstart" ? "touchend" : "mouseup", startPos = eventPosition(start), initialZoom = parseInt(window.getComputedStyle(document.body).getPropertyValue("---zoom"));
    let zoom = initialZoom;
    const saveZoom = debounce(() => text(`/pref/zoom?v=${zoom}`, { method: "post" }), 700);
    const resize = (move) => {
      const pos = eventPosition(move), delta = pos[0] - startPos[0] + pos[1] - startPos[1];
      zoom = Math.round(Math.min(100, Math.max(0, initialZoom + delta / 10)));
      document.body.style.setProperty("---zoom", zoom.toString());
      window.dispatchEvent(new Event("resize"));
      saveZoom();
    };
    document.body.classList.add("resizing");
    document.addEventListener(mousemoveEvent, resize);
    document.addEventListener(
      mouseupEvent,
      () => {
        document.removeEventListener(mousemoveEvent, resize);
        document.body.classList.remove("resizing");
      },
      { once: true }
    );
  };
  el.addEventListener("touchstart", startResize, { passive: false });
  el.addEventListener("mousedown", startResize, { passive: false });
  if (pref === ShowResizeHandle.OnlyAtStart) {
    const toggle = (ply2) => el.classList.toggle("none", visible ? !visible(ply2) : ply2 >= 2);
    toggle(ply);
    pubsub.on("ply", toggle);
  }
}
function eventPosition(e) {
  var _a;
  if (e.clientX || e.clientX === 0) return [e.clientX, e.clientY];
  if ((_a = e.targetTouches) == null ? void 0 : _a[0]) return [e.targetTouches[0].clientX, e.targetTouches[0].clientY];
  return void 0;
}

export {
  dispatchChessgroundResize,
  resizeHandle
};
//# sourceMappingURL=lib.SPSB7AAJ.js.map
