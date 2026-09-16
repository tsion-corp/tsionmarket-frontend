import {
  alert,
  confirm,
  domDialog,
  prompt
} from "./lib.MYPIOGN5.js";
import {
  pubsub
} from "./lib.QPQZCXK2.js";

// ../lib/src/api.ts
var publicEvents = ["ply", "analysis.change", "chat.resize", "analysis.closeAll", "analysis.eval"];
var socketEvents = ["lag", "close"];
var socketInEvents = ["mlat", "fen", "notifications", "endData"];
var friendsEvents = ["playing", "stopped_playing", "onlines", "enters", "leaves"];
var api = {
  initializeDom: (root) => {
    pubsub.emit("content-loaded", root);
  },
  events: {
    on(name, cb) {
      if (!publicEvents.includes(name)) throw "This event is not part of the public API";
      pubsub.on(name, cb);
    },
    off(name, cb) {
      pubsub.off(name, cb);
    }
  },
  socket: {
    subscribeToMoveLatency: () => pubsub.emit("socket.send", "moveLat", true),
    events: {
      on(key, cb) {
        if (socketInEvents.includes(key))
          pubsub.on(`socket.in.${key}`, cb);
        else if (socketEvents.includes(key))
          pubsub.on(`socket.${key}`, cb);
        else throw "This event is not part of the public API";
      },
      off(key, cb) {
        const ev = socketInEvents.includes(key) ? `socket.in.${key}` : `socket.${key}`;
        pubsub.off(ev, cb);
      }
    }
  },
  onlineFriends: {
    request: () => pubsub.emit("socket.send", "following_onlines"),
    events: {
      on(key, cb) {
        if (!friendsEvents.includes(key)) throw "This event is not part of the public API";
        pubsub.on(`socket.in.following_${key}`, cb);
      },
      off(key, cb) {
        pubsub.off(`socket.in.following_${key}`, cb);
      }
    }
  },
  chat: {
    post: (text) => pubsub.emit("socket.send", "talk", text)
  },
  dialog: {
    alert,
    confirm,
    prompt,
    domDialog
  },
  // some functions will be exposed here
  // to be overriden by browser extensions
  overrides: {}
};

export {
  api
};
//# sourceMappingURL=lib.EN3TWOBW.js.map
