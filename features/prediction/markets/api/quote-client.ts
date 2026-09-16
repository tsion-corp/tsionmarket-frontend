"use client";

import { WalletType } from "@polymarket/client";
import {
  COMBO_QUOTE_PROVIDER_PATH,
  createPolymarketAccountHeaders,
} from "@/features/prediction/lib/polymarket/account-auth";
import type { SecureClient } from "@/features/prediction/lib/polymarket/secure-client";
import { predictionCombos } from "./service";
import type { ComboQuote, RequestComboBuyQuoteInput } from "./types";

const MIN_COMBO_LEGS = 2;
const MAX_COMBO_LEGS = 50;

function validateBaseUnits(value: string, field: string): void {
  if (!/^[1-9]\d*$/u.test(value)) {
    throw new Error(`${field} must be a positive base-unit integer.`);
  }
}

export function buildComboBuyQuoteBody(
  client: SecureClient,
  input: RequestComboBuyQuoteInput
): string {
  if (client.account.walletType !== WalletType.DEPOSIT_WALLET) {
    throw new Error("Combo trading requires a Polymarket Deposit Wallet.");
  }
  if (
    input.legPositionIds.length < MIN_COMBO_LEGS ||
    input.legPositionIds.length > MAX_COMBO_LEGS
  ) {
    throw new Error(`A Combo must contain between ${MIN_COMBO_LEGS} and ${MAX_COMBO_LEGS} legs.`);
  }
  const uniqueLegs = new Set(input.legPositionIds);
  if (uniqueLegs.size !== input.legPositionIds.length) {
    throw new Error("A Combo cannot contain the same leg more than once.");
  }
  for (const positionId of input.legPositionIds) {
    validateBaseUnits(positionId, "positionId");
  }
  validateBaseUnits(input.notionalE6, "notionalE6");

  return JSON.stringify({
    signer_address: client.account.wallet,
    maker_address: client.account.wallet,
    signature_type: 3,
    leg_position_ids: input.legPositionIds,
    direction: "BUY",
    side: "YES",
    requested_size: {
      unit: "notional",
      value_e6: input.notionalE6,
    },
  });
}

export async function requestComboBuyQuote(
  client: SecureClient,
  input: RequestComboBuyQuoteInput
): Promise<ComboQuote> {
  const body = buildComboBuyQuoteBody(client, input);
  const accountHeaders = await createPolymarketAccountHeaders(
    client,
    "POST",
    COMBO_QUOTE_PROVIDER_PATH,
    body
  );
  return predictionCombos.postRawJson<ComboQuote>("/combos/quotes", body, {
    ...accountHeaders,
    "Idempotency-Key": input.idempotencyKey,
    "x-idem-key": input.idempotencyKey,
  });
}
