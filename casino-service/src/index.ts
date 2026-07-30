import Fastify from "fastify";
import cors from "@fastify/cors";
import { Casino } from "./domain/casino.js";
import { BadRequest, amount, parseWei } from "./domain/money.js";
import { TIME_CONTROLS, type TimeControl } from "./domain/chess.js";
import type { Selection } from "./domain/market.js";

// HTTP surface for the casino, speaking the contract in the frontend's
// docs/casino-backend.md: a { success, data | error } envelope, the caller
// identified by the x-user-id the frontend proxy attaches.

const casino = new Casino();
const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

await app.register(cors, { origin: true });

// Several actions (accept, resign, cancel) carry no body but are still sent
// as JSON by clients. Fastify rejects an empty JSON body by default, so treat
// it as an empty object rather than failing the request.
app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body: string, done) => {
  if (!body || body.trim() === "") return done(null, {});
  try {
    done(null, JSON.parse(body));
  } catch {
    done(new BadRequest("INVALID_JSON", "That request body isn't valid JSON."), undefined);
  }
});

function ok(data: unknown) {
  return { success: true, data };
}

// The frontend proxy verifies the Privy session and forwards the user id. A
// direct caller without one can still read public endpoints.
function callerId(req: { headers: Record<string, unknown> }): string {
  const id = req.headers["x-user-id"];
  if (typeof id !== "string" || !id) {
    throw new BadRequest("UNAUTHORIZED", "Sign in to play.", 401);
  }
  return id;
}

function timeControlOf(value: unknown): TimeControl {
  if (typeof value !== "string" || !TIME_CONTROLS.includes(value as TimeControl)) {
    throw new BadRequest("INVALID_TIME_CONTROL", "Unsupported time control.");
  }
  return value as TimeControl;
}

function selectionOf(value: unknown): Selection {
  if (value !== "white" && value !== "draw" && value !== "black") {
    throw new BadRequest("INVALID_SELECTION", "Bet on white, draw or black.");
  }
  return value;
}

const price = () => casino.unitPriceUsd;

app.setErrorHandler((error, _req, reply) => {
  if (error instanceof BadRequest) {
    return reply
      .status(error.status)
      .send({ success: false, error: { code: error.code, message: error.message } });
  }
  app.log.error(error);
  return reply
    .status(500)
    .send({ success: false, error: { code: "INTERNAL", message: "Something went wrong." } });
});

// ----- Hub -----

app.get("/hub/presence", async () => ok({ presence: casino.presence() }));

app.get("/hub/recent-wins", async () => ok({ wins: [] }));

// ----- Chess -----

app.get("/chess/challenges", async () =>
  ok({
    challenges: casino.openChallenges().map((c) => ({
      id: c.id,
      creator: c.creator,
      timeControl: c.timeControl,
      stake: amount(c.stakeWei, price()),
      createdAt: c.createdAt,
      inviteCode: c.inviteCode,
    })),
  })
);

app.get("/chess/matches", async () =>
  ok({ matches: casino.liveMatches().map((m) => m.toJson(price())) })
);

app.get<{ Params: { id: string } }>("/chess/matches/:id", async (req) =>
  ok(casino.match(req.params.id).toJson(price()))
);

app.get<{ Params: { code: string } }>("/chess/invites/:code", async (req) => {
  const c = casino.challengeByInvite(req.params.code);
  return ok({
    id: c.id,
    creator: c.creator,
    timeControl: c.timeControl,
    stake: amount(c.stakeWei, price()),
    createdAt: c.createdAt,
    inviteCode: c.inviteCode,
  });
});

app.post<{ Body: { stakeWei?: string; timeControl?: string; mode?: string } }>(
  "/chess/challenges",
  async (req) => {
    const userId = callerId(req);
    const stakeWei = parseWei(req.body?.stakeWei);
    const timeControl = timeControlOf(req.body?.timeControl);
    const mode = req.body?.mode === "auto" ? "auto" : "invite";
    const { challenge, ticket } = await casino.createChallenge(userId, stakeWei, timeControl, mode);
    return ok({
      challenge: {
        id: challenge.id,
        creator: challenge.creator,
        timeControl: challenge.timeControl,
        stake: amount(challenge.stakeWei, price()),
        createdAt: challenge.createdAt,
        inviteCode: challenge.inviteCode,
      },
      ticket,
    });
  }
);

app.post<{ Params: { id: string } }>("/chess/challenges/:id/accept", async (req) => {
  const match = await casino.acceptChallenge(req.params.id, callerId(req));
  return ok(match.toJson(price()));
});

app.post<{ Params: { id: string } }>("/chess/challenges/:id/cancel", async (req) => {
  await casino.cancelChallenge(req.params.id, callerId(req));
  return ok({});
});

app.get<{ Params: { id: string } }>("/chess/matchmaking/:id", async (req) => {
  const t = casino.ticket(req.params.id);
  return ok({
    id: t.id,
    state: t.state,
    matchId: t.matchId,
    acceptSecondsRemaining: null,
    opponent: null,
  });
});

app.post<{ Params: { id: string } }>("/chess/matchmaking/:id/cancel", async (req) => {
  await casino.cancelTicket(req.params.id, callerId(req));
  return ok({});
});

app.post<{ Params: { id: string }; Body: { move?: string } }>(
  "/chess/matches/:id/moves",
  async (req) => {
    const uci = req.body?.move;
    if (typeof uci !== "string" || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
      throw new BadRequest("ILLEGAL_MOVE", "That move isn't in a form we understand.");
    }
    const match = await casino.move(req.params.id, callerId(req), uci);
    return ok(match.toJson(price()));
  }
);

app.post<{ Params: { id: string } }>("/chess/matches/:id/offer-draw", async (req) => {
  const match = await casino.offerDraw(req.params.id, callerId(req));
  return ok(match.toJson(price()));
});

app.post<{ Params: { id: string } }>("/chess/matches/:id/resign", async (req) => {
  const match = await casino.resign(req.params.id, callerId(req));
  return ok(match.toJson(price()));
});

// ----- Spectator betting -----

app.get<{ Params: { id: string } }>("/betting/markets/:id/odds", async (req) => {
  const match = casino.match(req.params.id);
  return ok(casino.market(req.params.id).odds(match));
});

app.get<{ Params: { id: string } }>("/betting/markets/:id/odds/history", async (req) =>
  ok({ points: casino.market(req.params.id).history })
);

app.get<{ Querystring: { matchId?: string } }>("/betting/bets", async (req) => {
  const userId = callerId(req);
  const matchId = req.query?.matchId;
  if (!matchId) return ok({ bets: [] });
  const mk = casino.market(matchId);
  return ok({
    bets: mk.bets.filter((b) => b.userId === userId).map((b) => mk.betJson(b, price())),
  });
});

app.post<{
  Body: { matchId?: string; selection?: string; stakeWei?: string; expectedOdds?: number };
}>("/betting/bets", async (req) => {
  const userId = callerId(req);
  const matchId = req.body?.matchId;
  if (!matchId) throw new BadRequest("NOT_FOUND", "Which match?", 404);
  const bet = await casino.placeBet(
    matchId,
    userId,
    selectionOf(req.body?.selection),
    parseWei(req.body?.stakeWei),
    Number(req.body?.expectedOdds)
  );
  return ok(casino.market(matchId).betJson(bet, price()));
});

// ----- Draw (not implemented yet) -----
//
// The draw needs a scheduler and a published, auditable randomness source.
// Until that exists the endpoint says so plainly, which the frontend already
// renders as "not available yet" rather than showing invented numbers.

app.get("/draw/rounds/current", async () => {
  throw new BadRequest("NOT_CONFIGURED", "The draw isn't running yet.", 503);
});
app.get("/draw/results", async () => ok({ results: [] }));
app.get("/draw/entries", async () => ok({ entries: [] }));

// ----- Development helpers -----
//
// The service holds a balance per user. In production that balance is the
// player's on-chain funds, mirrored by the escrow contract. This endpoint
// exists so the flow can be exercised end to end before that lands, and is
// only registered outside production.

if (process.env.NODE_ENV !== "production") {
  app.post<{ Body: { userId?: string; wei?: string } }>("/dev/credit", async (req) => {
    const userId = req.body?.userId;
    if (!userId) throw new BadRequest("INVALID", "userId required");
    await casino.ledger.credit(userId, parseWei(req.body?.wei), "dev-credit");
    return ok({ balance: (await casino.ledger.balanceOf(userId)).toString() });
  });

  app.get<{ Params: { id: string } }>("/dev/balance/:id", async (req) =>
    ok({ balance: (await casino.ledger.balanceOf(req.params.id)).toString() })
  );
}

const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: "0.0.0.0" });
app.log.info(`casino-service listening on ${port}`);
