// ../lib/src/game/router.ts
function game(data, color, embed) {
  const id = typeof data === "string" ? data : data.game.id;
  return (embed ? "/embed/" : "/") + id + (color ? "/" + color : "");
}
function cont(data, mode) {
  return game(data) + "/continue/" + mode;
}

export {
  game,
  cont
};
//# sourceMappingURL=lib.GIUNMRJU.js.map
