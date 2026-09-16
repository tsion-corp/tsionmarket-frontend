// ../lib/src/menuHover.ts
function menuHover_default() {
  if ("ontouchstart" in window) return;
  const interval = 200;
  const sensitivity = 8;
  let cX, cY;
  const track = (ev) => {
    cX = ev.pageX;
    cY = ev.pageY;
  };
  let state = {};
  $("#topnav.hover").each(function() {
    const $el = $(this).removeClass("hover");
    const handler = () => $el.toggleClass("hover");
    const compare = () => {
      if (Math.sqrt((state.pX - cX) * (state.pX - cX) + (state.pY - cY) * (state.pY - cY)) < sensitivity) {
        $el.off(state.event, track);
        delete state.timeoutId;
        state.isActive = true;
        handler();
      } else {
        state.pX = cX;
        state.pY = cY;
        state.timeoutId = setTimeout(compare, interval);
      }
    };
    const handleHover = function(ev) {
      if (state.timeoutId) {
        clearTimeout(state.timeoutId);
        delete state.timeoutId;
      }
      const mousemove = state.event = "mousemove";
      if (ev.type === "mouseover") {
        if (state.isActive || ev.buttons) return;
        state.pX = ev.pageX;
        state.pY = ev.pageY;
        $el.off(mousemove, track).on(mousemove, track);
        state.timeoutId = setTimeout(compare, interval);
      } else {
        if (!state.isActive) return;
        $el.off(mousemove, track);
        state = {};
        handler();
      }
    };
    $el.on("mouseover", handleHover).on("mouseleave", handleHover);
  });
}

export {
  menuHover_default
};
/*!
 * hoverIntent v1.10.0 // 2019.02.25 // jQuery v1.7.0+
 * http://briancherne.github.io/jquery-hoverIntent/
 *
 * You may use hoverIntent under the terms of the MIT license. Basically that
 * means you are free to use hoverIntent as long as this header is left intact.
 * Copyright 2007-2019 Brian Cherne
 */
//# sourceMappingURL=lib.2OVDXZTI.js.map
