import { describe, it, expect } from "vitest";
import {
  currentRound,
  championsPlan,
  defaultPlayerName,
  hasOngoingPairing,
  isSeated,
  organizerWalletMatches,
  pairingSeats,
  playerNameError,
  roundsError,
  seatedName,
  toSwissDetail,
  toSwissSummary,
  tournamentNameError,
  type SwissDetailWire,
  type SwissPairingWire,
  type SwissStandingWire,
  type SwissSummaryWire,
} from "@/features/casino/lib/api/swiss";

// Fixtures mirror responses observed on the live service, byes included, so a
// contract drift breaks here before it breaks a tournament page.

const WALLET = "0x00112233445566778899aabbccddeeff00112233";

const summaryWire = (over: Partial<SwissSummaryWire> = {}): SwissSummaryWire => ({
  id: "4dd9f506-194f-4e39-9b39-adee3e86e26f",
  name: "Friday Swiss",
  organizer: "0xTESTorg",
  status: "started",
  round: 1,
  nbRounds: 3,
  participantCount: 2,
  ongoingCount: 1,
  timeControl: { initialSeconds: 300, incrementSeconds: 3 },
  entryFeeUsdc: "0",
  winner: null,
  createdAt: "2026-07-31T04:25:31.603001Z",
  startedAt: "2026-07-31T04:25:35.519382Z",
  finishedAt: null,
  ...over,
});

const standing = (over: Partial<SwissStandingWire> = {}): SwissStandingWire => ({
  rank: 1,
  name: "alice",
  points: 2,
  tieBreak: 3,
  wins: 1,
  draws: 0,
  losses: 1,
  byes: 1,
  absent: false,
  ...over,
});

const pairing = (over: Partial<SwissPairingWire> = {}): SwissPairingWire => ({
  round: 1,
  board: 1,
  white: "bob",
  black: "alice",
  matchId: "65a183af-8223-4f93-8167-d035d91d5507",
  status: "ongoing",
  result: null,
  isForfeit: false,
  ...over,
});

const detailWire = (over: Partial<SwissDetailWire> = {}): SwissDetailWire => ({
  ...summaryWire(),
  standings: [standing(), standing({ rank: 2, name: "bob" })],
  rounds: [{ round: 1, pairings: [pairing()] }],
  ...over,
});

describe("player name validation", () => {
  it("accepts one plain word up to 30 characters", () => {
    expect(playerNameError("alice")).toBeNull();
    expect(playerNameError("0x001122-2233")).toBeNull();
    expect(playerNameError("a".repeat(30))).toBeNull();
  });

  it("rejects empty and overlong names", () => {
    expect(playerNameError("")).toBe("empty");
    expect(playerNameError("a".repeat(31))).toBe("tooLong");
    expect(playerNameError(WALLET)).toBe("tooLong");
  });

  it("rejects spaces and non-ascii, which the pairing engine cannot digest", () => {
    expect(playerNameError("two words")).toBe("invalid");
    // The live service answers 500 on rounds/next when a name carries "…".
    expect(playerNameError("0x0011…2233")).toBe("invalid");
    expect(playerNameError("café")).toBe("invalid");
  });
});

describe("tournament name validation", () => {
  it("holds the 2 to 60 character window after trimming", () => {
    expect(tournamentNameError("Friday night blitz")).toBeNull();
    expect(tournamentNameError("ab")).toBeNull();
    expect(tournamentNameError(" a ")).toBe("tooShort");
    expect(tournamentNameError("a".repeat(61))).toBe("tooLong");
  });
});

describe("rounds validation", () => {
  it("accepts 1 through 32 whole rounds and nothing else", () => {
    expect(roundsError(1)).toBe(false);
    expect(roundsError(32)).toBe(false);
    expect(roundsError(0)).toBe(true);
    expect(roundsError(33)).toBe(true);
    expect(roundsError(2.5)).toBe(true);
    expect(roundsError(NaN)).toBe(true);
  });
});

describe("Champions tournament planning", () => {
  it.each([
    [4, 3, 2, 1, 2, 1],
    [8, 5, 4, 2, 4, 2],
    [16, 5, 8, 4, 8, 4],
    [36, 8, 16, 8, 16, 12],
    [10_000, 8, 4096, 2048, 4096, 3856],
  ])(
    "plans %i players",
    (players, leagueRounds, bracketSize, directQualifiers, playoffPlayers, eliminatedPlayers) => {
      expect(championsPlan(players)).toEqual({
        leagueRounds,
        bracketSize,
        directQualifiers,
        playoffPlayers,
        eliminatedPlayers,
      });
    }
  );

  it("rejects capacities outside 4 to 10,000", () => {
    expect(championsPlan(3)).toBeNull();
    expect(championsPlan(10_001)).toBeNull();
  });
});

describe("default player name", () => {
  it("shortens a full address to an ascii name that fits the 30-char cap", () => {
    const name = defaultPlayerName(WALLET);
    expect(name).toBe("0x001122-2233");
    expect(playerNameError(name)).toBeNull();
  });

  it("passes a short handle through and maps no wallet to empty", () => {
    expect(defaultPlayerName("0xshort")).toBe("0xshort");
    expect(defaultPlayerName(null)).toBe("");
  });
});

describe("organizer matching", () => {
  it("recognises the derived short name and a raw address, case-insensitively", () => {
    expect(organizerWalletMatches("0x001122-2233", WALLET)).toBe(true);
    expect(organizerWalletMatches(WALLET.toUpperCase(), WALLET)).toBe(true);
    expect(organizerWalletMatches("someoneElse", WALLET)).toBe(false);
    expect(organizerWalletMatches("0x001122-2233", null)).toBe(false);
  });
});

describe("summary mapping", () => {
  it("maps each service status to its UI state", () => {
    expect(toSwissSummary(summaryWire({ status: "created" })).state).toBe("open");
    expect(toSwissSummary(summaryWire({ status: "started" })).state).toBe("running");
    expect(toSwissSummary(summaryWire({ status: "finished" })).state).toBe("finished");
  });

  it("renders the time control as the familiar label", () => {
    expect(toSwissSummary(summaryWire()).timeControl).toBe("5+3");
  });

  it("carries the winner of a finished event", () => {
    const done = toSwissSummary(summaryWire({ status: "finished", winner: "alice" }));
    expect(done.winner).toBe("alice");
  });

  it("keeps older free-tournament responses compatible", () => {
    const summary = summaryWire();
    delete summary.entryFeeUsdc;

    expect(toSwissSummary(summary)).toMatchObject({
      entryFeeUsdc: "0",
      maxPlayers: 4000,
      prizePolicy: "standard",
      prizePoolBps: 10_000,
      platformShareBps: 0,
      minimumPlayers: 2,
    });
  });

  it("maps the fixed high-stakes tournament terms", () => {
    expect(
      toSwissSummary(
        summaryWire({
          entryFeeUsdc: "2",
          maxPlayers: 100,
          prizePolicy: "high_stakes",
          prizePoolBps: 5_000,
          platformShareBps: 5_000,
          minimumPlayers: 4,
        })
      )
    ).toMatchObject({
      entryFeeUsdc: "2",
      maxPlayers: 100,
      prizePolicy: "highStakes",
      prizePoolBps: 5_000,
      platformShareBps: 5_000,
      minimumPlayers: 4,
    });
  });
});

describe("detail mapping", () => {
  it("keeps standings and pairings, including a bye with no board", () => {
    const bye = pairing({ board: 2, black: null, matchId: null, status: "bye", result: "1F-0F" });
    const detail = toSwissDetail(
      detailWire({ rounds: [{ round: 1, pairings: [pairing(), bye] }] })
    );
    expect(detail.standings.map((s) => s.name)).toEqual(["alice", "bob"]);
    const mapped = detail.rounds[0].pairings[1];
    expect(mapped.status).toBe("bye");
    expect(mapped.black).toBeNull();
    expect(mapped.matchId).toBeNull();
  });

  it("finds the round in play", () => {
    const detail = toSwissDetail(
      detailWire({
        round: 2,
        rounds: [
          { round: 1, pairings: [pairing({ status: "white", result: "1-0" })] },
          { round: 2, pairings: [pairing({ round: 2 })] },
        ],
      })
    );
    expect(currentRound(detail)?.round).toBe(2);
  });

  it("has no current round before the first is paired", () => {
    const detail = toSwissDetail(detailWire({ status: "created", round: 0, rounds: [] }));
    expect(currentRound(detail)).toBeNull();
  });

  it("adds the viewer's board when it is outside the current pairing page", () => {
    const own = pairing({ board: 2500, white: "alice", black: "charlie" });
    const detail = toSwissDetail(
      detailWire({
        format: "champions",
        pairingsTotal: 5000,
        pairingsHasMore: true,
        myPairing: own,
        rounds: [{ round: 1, pairings: [pairing({ board: 1 })] }],
      })
    );
    expect(currentRound(detail)?.pairings.map((game) => game.board)).toEqual([1, 2500]);
  });
});

describe("seats", () => {
  it("lists both players of a game and only the resting player of a bye", () => {
    expect(pairingSeats(toSwissDetail(detailWire()).rounds[0].pairings[0])).toEqual([
      "bob",
      "alice",
    ]);
    const bye = toSwissDetail(
      detailWire({
        rounds: [{ round: 1, pairings: [pairing({ black: null, matchId: null, status: "bye" })] }],
      })
    ).rounds[0].pairings[0];
    expect(pairingSeats(bye)).toEqual(["bob"]);
  });

  it("knows who is seated at a board", () => {
    const p = toSwissDetail(detailWire()).rounds[0].pairings[0];
    expect(isSeated(p, "alice")).toBe(true);
    expect(isSeated(p, "carol")).toBe(false);
    expect(isSeated(p, null)).toBe(false);
  });

  it("resolves your seat from the remembered name, then the derived default", () => {
    const withDefault = toSwissDetail(
      detailWire({
        standings: [standing({ name: defaultPlayerName(WALLET) })],
      })
    );
    expect(seatedName(withDefault, null, WALLET)).toBe("0x001122-2233");

    const detail = toSwissDetail(detailWire());
    expect(seatedName(detail, "alice", WALLET)).toBe("alice");
    // A remembered name that is no longer in the standings is a stale memory,
    // not a seat.
    expect(seatedName(detail, "withdrawn", WALLET)).toBeNull();
  });

  it("sees an ongoing board for a seated player only", () => {
    const detail = toSwissDetail(detailWire());
    expect(hasOngoingPairing(detail, "alice")).toBe(true);
    expect(hasOngoingPairing(detail, "carol")).toBe(false);
    const settled = toSwissDetail(
      detailWire({
        rounds: [{ round: 1, pairings: [pairing({ status: "white", result: "1-0" })] }],
      })
    );
    expect(hasOngoingPairing(settled, "alice")).toBe(false);
  });
});
