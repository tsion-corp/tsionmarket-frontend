import type { User } from "@privy-io/react-auth";

export interface Profile {
  name: string;
  email: string;
  avatarSeed: string;
}

export function deriveProfile(user: User | null): Profile {
  if (!user) {
    return { name: "Account", email: "", avatarSeed: "worldstreet" };
  }
  const email = user.google?.email ?? user.email?.address ?? "";
  const name =
    user.google?.name ??
    user.twitter?.name ??
    user.twitter?.username ??
    (email ? email.split("@")[0] : "World Street user");
  return {
    name,
    email: email || (user.twitter?.username ? `@${user.twitter.username}` : ""),
    avatarSeed: user.wallet?.address ?? user.id,
  };
}

export function hasEmbeddedWallet(user: User, chainType: "ethereum" | "solana"): boolean {
  return user.linkedAccounts.some(
    (account) =>
      account.type === "wallet" &&
      account.walletClientType === "privy" &&
      account.chainType === chainType
  );
}

export interface EmbeddedWallet {
  address: string;
  chainType: "ethereum" | "solana";
}

export function getEmbeddedWallets(user: User | null): EmbeddedWallet[] {
  if (!user) return [];
  return user.linkedAccounts
    .filter(
      (a): a is Extract<typeof a, { type: "wallet" }> =>
        a.type === "wallet" && a.walletClientType === "privy"
    )
    .filter((a) => a.chainType === "ethereum" || a.chainType === "solana")
    .map((a) => ({ address: a.address, chainType: a.chainType as "ethereum" | "solana" }));
}

export function getWalletAddress(
  user: User | null,
  chainType: "ethereum" | "solana"
): string | null {
  return getEmbeddedWallets(user).find((w) => w.chainType === chainType)?.address ?? null;
}
