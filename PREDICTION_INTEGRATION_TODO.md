# Prediction Market v1.2.0 — Frontend Integration Guide

The on-chain contract was **upgraded to v1.2.0** on Base mainnet. The **proxy
address is unchanged** — no env change needed:

```
NEXT_PUBLIC_PREDICTION_CONTRACT_ADDRESS=0x09F05Bdfb3cFA9125f253b8E3d7814cC5Beca3D0
```

New on-chain capabilities to wire up:

1. **`createEvent`** — make a multi-outcome event in one tx for ONE $1 fee (was $1/child).
2. **Neg-risk groups** — `registerNegRiskGroup` + `resolveNegRiskGroup` enforce
   exactly-one-winner resolution on-chain.
3. **Challenge window** — creator resolutions aren't claimable for 24h; the UI must
   reflect that.

Everything below references real files in this repo. Do them in order.

---

## STEP 0 — Add the new functions to the ABI ⟶ `lib/prediction/abi.ts`

`PREDICTION_ABI` only lists the functions the app calls. Add these fragments
(mirror the existing `createMarket` style):

```ts
{
  type: "function",
  name: "createEvent",
  stateMutability: "nonpayable",
  inputs: [
    { name: "marketIds", type: "uint256[]" },
    { name: "closeTime", type: "uint64" },
    { name: "seedsUsdc", type: "uint256[]" },
  ],
  outputs: [],
},
{
  type: "function",
  name: "registerNegRiskGroup",
  stateMutability: "nonpayable",
  inputs: [
    { name: "groupId", type: "uint256" },
    { name: "memberIds", type: "uint256[]" },
  ],
  outputs: [],
},
{
  type: "function",
  name: "resolveNegRiskGroup",
  stateMutability: "nonpayable",
  inputs: [
    { name: "groupId", type: "uint256" },
    { name: "winnerMarketId", type: "uint256" },
  ],
  outputs: [],
},
{
  type: "function",
  name: "negRiskGroupInfo",
  stateMutability: "view",
  inputs: [{ name: "groupId", type: "uint256" }],
  outputs: [
    { name: "creator", type: "address" },
    { name: "resolved", type: "bool" },
    { name: "members", type: "uint256[]" },
  ],
},
{
  type: "function",
  name: "groupOfMarket",
  stateMutability: "view",
  inputs: [{ name: "", type: "uint256" }],
  outputs: [{ name: "", type: "uint256" }],
},
```

> The full generated ABI (source of truth) is
> `apps/prediction-market/src/chain/prediction-market-abi.json` in the monorepo —
> copy the exact fragments from there if you prefer.

Also note: the on-chain `Market` struct gained a trailing field **`redeemableAt`
(uint64)** — the timestamp after which a creator-resolved market becomes claimable
(0 = claimable now). If you read `markets(id)` directly, it's the new last field.

---

## STEP 1 — Multi-market create in ONE tx + ONE fee ⟶ `hooks/use-create-event.ts`

**Today:** the `create()` loop calls `actions.createMarket()` once per outcome →
each charges a separate $1 fee, N signatures, and the "orphaned markets on partial
failure" problem. **Change it to a single `createEvent` batch.**

### 1a. Add a `createEvent` action ⟶ `hooks/use-prediction-actions.ts`

Follow the existing `createMarket` pattern (uses `approveIfNeeded` + `runBatch`,
the gasless sponsored path). Approve the SUM of all seeds + one $1 fee:

```ts
// alongside createMarket in usePredictionActions()
const createEvent = useCallback(
  async ({
    marketIds,
    closeTime,
    seedsUsdc,
  }: {
    marketIds: bigint[];
    closeTime: number;
    seedsUsdc: bigint[];
  }): Promise<boolean> => {
    if (!wallet) {
      toast.error(t("noWalletConnected"));
      return false;
    }
    const toastId = toast.loading(t("creatingMarket"));
    try {
      setPhase("reading");
      // total spend = Σ seeds + ONE creation fee (createEvent charges once)
      const totalSeed = seedsUsdc.reduce((a, b) => a + b, 0n);
      const spend = totalSeed + CREATION_FEE_USDC;
      await ensureUsdcBalance(spend);
      const calls = await approveIfNeeded(spend);
      calls.push({
        to: predictionContractAddress(),
        data: encodeFunctionData({
          abi: PREDICTION_ABI,
          functionName: "createEvent",
          args: [marketIds, BigInt(closeTime), seedsUsdc],
        }),
      });
      toast.loading(t("confirmingOnChain"), { id: toastId });
      await runBatch(calls);
      toast.success(t("marketCreated"), { id: toastId });
      return true;
    } catch (error) {
      if (error instanceof InsufficientUsdcError) {
        toast.error(t("insufficientUsdc", { required: error.required, balance: error.balance }), {
          id: toastId,
        });
        return false;
      }
      console.error("[prediction] createEvent failed", error);
      toast.error(friendlyError(error, t("createMarketFailed")), { id: toastId });
      return false;
    } finally {
      setPhase("idle");
    }
  },
  [wallet, ensureUsdcBalance, approveIfNeeded, runBatch, t]
);
// return it from the hook
```

### 1b. Rewrite `use-create-event.ts` `create()` to call it once

Replace the per-outcome `createMarket` loop with:

```ts
const marketIds = input.outcomes.map(() => randomMarketId()); // 128-bit ids
const seeds = input.outcomes.map(() => input.seedUsdc);

setPhase("creating");
const ok = await actions.createEvent({ marketIds, closeTime: input.closeTime, seedsUsdc: seeds });
if (!ok) {
  setPhase("idle");
  return null;
}
```

Then attach per-outcome metadata (question `"<title> — <label>"`, etc.) via
`attachMetadata` as before, and continue to `createGroup` + `addGroupMember`
(off-chain), PLUS the NEW on-chain group registration in Step 2.

### 1c. Update the copy

The event create panel currently implies a fee per outcome. Change the note to
**"Creates {count} outcomes · one $1 creation fee"** (see `messages/*.json`
`eventCreateNote`, and the panel text).

---

## STEP 2 — On-chain neg-risk group + single-winner resolution

An event is now a real on-chain **group**: exactly one member resolves Yes, the
rest No, atomically. This replaces the per-outcome independent resolution.

### 2a. Register the group right after createEvent ⟶ `use-create-event.ts` / actions

Add a `registerNegRiskGroup` action (single call, no USDC → use `useEvmSend`, the
non-batch sponsored path, like `resolveMarket`):

```ts
const registerNegRiskGroup = useCallback(
  (groupId: bigint, memberIds: bigint[]) =>
    runSingle(
      encodeFunctionData({
        abi: PREDICTION_ABI,
        functionName: "registerNegRiskGroup",
        args: [groupId, memberIds],
      }),
      "creatingMarket",
      "marketCreated",
      "createMarketFailed"
    ),
  [runSingle]
);
```

Call it in `use-create-event.ts` after the markets are created:

```ts
const groupIdOnChain = randomMarketId(); // fresh non-zero id
await actions.registerNegRiskGroup(groupIdOnChain, marketIds);
```

Requirements the contract enforces (so validate/UX around them): every member must
be **Open**, **created by the caller**, **not already grouped**, and **≥2 members**.
Store `groupIdOnChain` with the off-chain group so resolution can reference it.

### 2b. Rewrite the resolve panel ⟶ `components/dashboard/prediction/event-resolve-panel.tsx`

**Today** it shows per-outcome Yes/No (can produce two winners). **Change to a
single "pick the winner" selector** → one call:

```ts
const resolveEvent = useCallback(
  (groupId: bigint, winnerMarketId: bigint) =>
    runSingle(
      encodeFunctionData({
        abi: PREDICTION_ABI,
        functionName: "resolveNegRiskGroup",
        args: [groupId, winnerMarketId],
      }),
      "resolvingMarket",
      "marketResolved",
      "resolveFailed"
    ),
  [runSingle]
);
```

UI: a radio list of the outcomes + one "Resolve · <winner> wins" button. Remove the
per-outcome resolve buttons for grouped events. **Important:** calling `resolve()`
on a grouped member now **reverts `"neg-risk member"`** — so the single-market
detail page must NOT offer a resolve button for a market where
`groupOfMarket(id) != 0`.

### 2c. Knowing if a market is grouped

Read `groupOfMarket(marketId)` (0 = standalone) or the backend endpoint
`GET /markets/:id/group` (backend team is adding it). Use it to:

- hide the single-market resolve button for grouped members, and
- render the parent-event breadcrumb (Step 4).

---

## STEP 3 — Challenge window on claims ⟶ positions / claim UI

Creator resolutions are now claimable only after `redeemableAt` (24h window).
Calling `redeem()` before then **reverts `"challenge window"`**.

- On a resolved market, if `market.redeemableAt > now` (and the user is not the
  owner), show **"Claimable in <countdown>"** instead of an active Claim button.
- Surface `redeemableAt` from the backend `GET /markets/:id` (backend team adding
  it) or read `markets(id)`'s new last field on-chain.
- `redeemableAt === 0` → claimable immediately (owner resolutions, invalid markets,
  and all pre-upgrade markets). Owner resolutions never wait.

`positions-panel-local.tsx` already retires the Claim button optimistically after a
redeem — just add the pre-window guard so it doesn't show a button that reverts.

---

## STEP 4 — Parent-event context on the child market page ⟶ `market-detail.tsx`

Clicking an outcome lands on a bare single-market page. If
`groupOfMarket(marketId) != 0` (or `GET /markets/:id/group` returns a group):

- show a **"Part of: <event title>"** breadcrumb linking to `/prediction/event/<slug>`,
- optionally list the sibling outcomes.

(Needs the backend `GET /markets/:id/group` endpoint.)

---

## STEP 5 — Verify against the reindexed backend

The backend read-model is being reindexed clean (phantom markets from old contract
deployments removed). No frontend change — same API base — but after it lands:

- confirm the market list no longer shows the old ghosts ("papa", "glasses",
  "pastor chris cap");
- markets briefly show without question/image (off-chain metadata) until
  re-attached — confirm create/edit re-attaches it.

---

## Already shipped (no action — FYI)

- 128-bit market ids (no more "id too large" on create)
- Split RPC transports in the sponsored-send path (`lib/trade/sponsor.ts`) — fixes
  the `eth_getCode` timeout that failed creates
- Optimistic Claim-button retire after redeem
- Close-time countdown + Resolved status on cards
- Per-outcome Yes/No on the event card

## Reference

|                               |                                                                          |
| ----------------------------- | ------------------------------------------------------------------------ |
| Proxy (call this)             | `0x09F05Bdfb3cFA9125f253b8E3d7814cC5Beca3D0`                             |
| New impl (v1.2.0)             | `0x98E2205493694152f1D84Bed305bC85D2f6590c9`                             |
| Full ABI (source of truth)    | `apps/prediction-market/src/chain/prediction-market-abi.json` (monorepo) |
| Contract audit + design notes | `apps/prediction-market/AUDIT.md` (monorepo)                             |
| New events                    | `NegRiskGroupRegistered`, `NegRiskGroupResolved`, `ChallengePeriodSet`   |
