export const PREDICTION_MIN_STAKE_USD = 5;

export function isValidPredictionStake(amountUsd: number): boolean {
  return Number.isFinite(amountUsd) && amountUsd >= PREDICTION_MIN_STAKE_USD;
}

export function predictionMinimumStakeMessage(): string {
  return `Minimum prediction-market stake is $${PREDICTION_MIN_STAKE_USD.toFixed(2)} USDC.`;
}
