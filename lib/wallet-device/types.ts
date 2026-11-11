export interface WalletDeviceRecord {
  uid: string;
  walletId: string;
  deviceId: string;
  /** 32 random bytes, base64url. */
  secret: string;
}
