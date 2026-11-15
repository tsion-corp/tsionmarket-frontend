export interface WalletDeviceRecord {
  uid: string;
  walletId: string;
  deviceId: string;
  /** 32 random bytes, base64url. */
  secret: string;
}

/**
 * The PIN unlock for one account on this device. The wallet key is sealed under a random device
 * secret, and the device secret is wrapped by the PIN (Argon2id), so what is stored is useless
 * without the PIN. `guard` counts wrong PINs: ten wipe the record.
 */
export interface StoredDeviceUnlock {
  uid: string;
  walletId: string;
  /** The device secret, wrapped by the PIN. */
  pin: import("@/lib/wallet-core/device-pin").WrappedDeviceSecret;
  /** The wallet key, sealed under the device secret. */
  sealedKey: { iv: string; ciphertext: string };
  guard: import("@/lib/wallet-core/device-pin").PinGuardState;
}
