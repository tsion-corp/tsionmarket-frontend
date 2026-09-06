// What the server tells the browser about the session it rendered for. A
// plain value, shaped on the server from the verified cookie and nothing
// else, so it is safe to hand to a Client Component.
//
// It exists so the app can paint before Privy's browser SDK has finished
// starting. Until then the SDK's `user` is null, and anything that builds a
// query key or a display from it would build the wrong one: the balance card
// would ask for ["portfolio", null, null] and show nothing, or worse, zero.
export interface ServerSession {
  userId: string;
  wallets: {
    ethereum: string | null;
    solana: string | null;
  };
}
