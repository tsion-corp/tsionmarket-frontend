// The wallet service client lives in lib/wallet-runtime so the app-wide signer can use it
// too (lib and hooks cannot import features). Re-exported here so this feature is unchanged.
export * from "@/lib/wallet-runtime/api";
