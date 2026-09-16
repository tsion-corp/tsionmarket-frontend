// ../lib/src/game/status.ts
var status = {
  created: 10,
  started: 20,
  aborted: 25,
  mate: 30,
  resign: 31,
  stalemate: 32,
  timeout: 33,
  draw: 34,
  outoftime: 35,
  cheat: 36,
  noStart: 37,
  unknownFinish: 38,
  insufficientMaterialClaim: 39,
  variantEnd: 60
};
var statusOf = (name) => ({ id: status[name], name });
var started = (data) => data.game.status.id >= status.started;
var finished = (data) => data.game.status.id >= status.mate;
var aborted = (data) => data.game.status.id === status.aborted;
var playing = (data) => started(data) && !finished(data) && !aborted(data);

// ../lib/src/game/index.ts
var playable = (data) => data.game.status.id < status.aborted && !imported(data);
var isPlayerPlaying = (data) => playable(data) && !data.player.spectator;
var isPlayerTurn = (data) => isPlayerPlaying(data) && data.game.player === data.player.color;
var mandatory = (data) => !!data.tournament || !!data.simul || !!data.swiss;
var playedTurns = (data) => data.game.turns - (data.game.startedAtTurn || 0);
var bothPlayersHavePlayed = (data) => playedTurns(data) > 1;
var abortable = (data) => {
  var _a;
  return playable(data) && !bothPlayersHavePlayed(data) && !mandatory(data) && !((_a = data.game.rules) == null ? void 0 : _a.includes("noAbort"));
};
var rematchable = (data) => {
  var _a;
  return !((_a = data.game.rules) == null ? void 0 : _a.includes("noRematch"));
};
var takebackable = (data) => playable(data) && data.takebackable && bothPlayersHavePlayed(data) && !data.player.proposingTakeback && !data.opponent.proposingTakeback;
var drawable = (data) => playable(data) && data.game.turns >= 2 && !data.player.offeringDraw && !hasAi(data) && drawableSwiss(data);
var drawableSwiss = (data) => !data.swiss || playedTurns(data) >= 60;
var resignable = (data) => playable(data) && !abortable(data);
var berserkableBy = (data) => !!data.tournament && data.tournament.berserkable && isPlayerPlaying(data) && !bothPlayersHavePlayed(data);
var moretimeable = (data) => isPlayerPlaying(data) && data.moretimeable && (!!data.clock || !!data.correspondence && data.correspondence[data.opponent.color] < data.correspondence.increment - 3600);
var imported = (data) => data.game.source === "import";
var replayable = (data) => imported(data) || finished(data) || aborted(data) && bothPlayersHavePlayed(data);
function getPlayer(data, color) {
  if (data.player.color === color) return data.player;
  if (data.opponent.color === color) return data.opponent;
  return null;
}
var hasAi = (data) => !!(data.player.ai || data.opponent.ai);
var userAnalysable = (data) => finished(data) || playable(data) && (!data.clock || !isPlayerPlaying(data));
var isCorrespondence = (data) => data.game.speed === "correspondence";
var setOnGame = (data, color, onGame) => {
  const player = getPlayer(data, color);
  onGame = onGame || !!player.ai;
  player.onGame = onGame;
  if (onGame) setGone(data, color, false);
};
var setGone = (data, color, gone) => {
  const player = getPlayer(data, color);
  player.isGone = !player.ai && gone;
  if (player.isGone === false && player.user) player.user.online = true;
};
var isSwitchable = (data) => isCorrespondence(data) || !hasAi(data) && !!data.simul;
var clockToSpeed = (initial, increment) => {
  const total = initial + increment * 40;
  return total < 30 ? "ultraBullet" : total < 180 ? "bullet" : total < 480 ? "blitz" : total < 1500 ? "rapid" : "classical";
};

export {
  status,
  statusOf,
  finished,
  aborted,
  playing,
  playable,
  isPlayerPlaying,
  isPlayerTurn,
  playedTurns,
  bothPlayersHavePlayed,
  abortable,
  rematchable,
  takebackable,
  drawable,
  drawableSwiss,
  resignable,
  berserkableBy,
  moretimeable,
  replayable,
  getPlayer,
  userAnalysable,
  setOnGame,
  setGone,
  isSwitchable,
  clockToSpeed
};
//# sourceMappingURL=lib.67VUYMDO.js.map
