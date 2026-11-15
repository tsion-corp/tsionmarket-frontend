import { type StoredDeviceUnlock, type WalletDeviceRecord } from "./types";

/**
 * Where this browser keeps the secret that identifies it to its wallet.
 *
 * The device secret signs package changes (with a Clerk session as well) and can
 * wrap this device's envelope. It cannot decrypt the wallet on its own: the
 * passphrase or recovery secret does that. It lives in IndexedDB, per user, so
 * signing out and in as someone else never reaches it.
 */
export interface DeviceStore {
  get(uid: string): Promise<WalletDeviceRecord | null>;
  put(record: WalletDeviceRecord): Promise<void>;
  remove(uid: string): Promise<void>;
}

export function memoryDeviceStore(): DeviceStore {
  const records = new Map<string, WalletDeviceRecord>();
  return {
    get: async (uid) => records.get(uid) ?? null,
    put: async (record) => void records.set(record.uid, { ...record }),
    remove: async (uid) => void records.delete(uid),
  };
}

const DB_NAME = "tsion-wallet";
const STORE = "device";
// The device PIN unlock (lib/wallet-core/device-unlock). Added in version 2.
const UNLOCK_STORE = "unlock";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "uid" });
      if (!db.objectStoreNames.contains(UNLOCK_STORE)) {
        db.createObjectStore(UNLOCK_STORE, { keyPath: "uid" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open device storage"));
  });
}

function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
  storeName: string = STORE
): Promise<T> {
  return open().then((db) =>
    new Promise<T>((resolve, reject) => {
      const request = work(db.transaction(storeName, mode).objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Device storage failed"));
    }).finally(() => db.close())
  );
}

export function indexedDbDeviceStore(): DeviceStore {
  return {
    get: async (uid) =>
      ((await run("readonly", (s) => s.get(uid))) as WalletDeviceRecord | undefined) ?? null,
    put: async (record) => void (await run("readwrite", (s) => s.put(record))),
    remove: async (uid) => void (await run("readwrite", (s) => s.delete(uid))),
  };
}

/** What the PIN unlock keeps on this device for one account. */
export interface DeviceUnlockStore {
  get(uid: string): Promise<StoredDeviceUnlock | null>;
  put(record: StoredDeviceUnlock): Promise<void>;
  remove(uid: string): Promise<void>;
}

export function memoryUnlockStore(): DeviceUnlockStore {
  const records = new Map<string, StoredDeviceUnlock>();
  return {
    get: async (uid) => records.get(uid) ?? null,
    put: async (record) => void records.set(record.uid, structuredClone(record)),
    remove: async (uid) => void records.delete(uid),
  };
}

export function indexedDbUnlockStore(): DeviceUnlockStore {
  return {
    get: async (uid) =>
      ((await run("readonly", (s) => s.get(uid), UNLOCK_STORE)) as
        StoredDeviceUnlock | undefined) ?? null,
    put: async (record) => void (await run("readwrite", (s) => s.put(record), UNLOCK_STORE)),
    remove: async (uid) => void (await run("readwrite", (s) => s.delete(uid), UNLOCK_STORE)),
  };
}
