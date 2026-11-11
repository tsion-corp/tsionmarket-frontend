import { type WalletDeviceRecord } from "./types";

/**
 * Where this browser keeps the secret that identifies it to its wallet.
 *
 * The device secret signs package changes (with a Clerk session as well) and can
 * wrap this device's envelope. It cannot decrypt the wallet on its own: the
 * passphrase or recovery phrase does that. It lives in IndexedDB, per user, so
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

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "uid" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open device storage"));
  });
}

function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return open().then((db) =>
    new Promise<T>((resolve, reject) => {
      const request = work(db.transaction(STORE, mode).objectStore(STORE));
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
