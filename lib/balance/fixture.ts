// The one real balance body we have, verbatim, so the parser's tests and the
// hook's tests judge the same bytes rather than two hand-written guesses that
// can drift apart. `data` only: the envelope is unwrap()'s business.
//
// Kept as a function rather than a constant so a test that mutates a copy to
// describe a broken payload cannot leak that edit into the next test.

export function balanceBody(): unknown {
  return {
    generatedAt: "2026-09-23T15:11:29.600Z",
    staleAt: "2026-09-23T15:11:44.600Z",
    cached: false,
    chains: ["0x2105"],
    totalUsdValue: null,
    wallets: [
      {
        chain: "0x2105",
        address: "0x72f2578ade01ca5a844cb0a46dc1943bbd233aca",
        native: {
          symbol: "ETH",
          name: "Ether",
          decimals: 18,
          address: null,
          balance: "504709067444182",
          balanceFormatted: "0.000504709067444182",
          usdValue: null,
        },
        tokens: [
          {
            symbol: "USDC",
            name: "USD Coin",
            decimals: 6,
            address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
            balance: "128718",
            balanceFormatted: "0.128718",
            usdValue: null,
          },
        ],
        blockNumber: "51693471",
        slot: null,
      },
    ],
  };
}

/** The same body with no linked wallets, which is a valid answer. */
export function emptyBalanceBody(): unknown {
  return {
    generatedAt: "2026-09-23T15:11:29.600Z",
    staleAt: "2026-09-23T15:11:44.600Z",
    cached: true,
    chains: ["0x2105"],
    totalUsdValue: null,
    wallets: [],
  };
}
