import {
  ChatCtrl
} from "./lib.LARLSDYI.js";
import {
  renderChat
} from "./lib.OY6DQ2TE.js";
import {
  attributesModule,
  classModule,
  init
} from "./lib.LWF5S4ZV.js";

// ../lib/src/chat/standalone.ts
function standaloneChat(data) {
  const opts = { el: document.querySelector(".mchat"), ...data };
  const patch = init([classModule, attributesModule]);
  const ctrl = new ChatCtrl(opts, redraw);
  const blueprint = renderChat(ctrl);
  opts.el.innerHTML = "";
  let vnode = patch(opts.el, blueprint);
  function redraw() {
    vnode = patch(vnode, renderChat(ctrl));
  }
  return ctrl;
}

export {
  standaloneChat
};
//# sourceMappingURL=lib.KOFCUIJ3.js.map
