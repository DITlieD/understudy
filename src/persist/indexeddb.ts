import { STORE_NAMES, type KvDriver, type StoreName } from "./driver";

const DB_NAME = "understudy";
const DB_VERSION = 1;

export async function openIndexedDbDriver(
  factory: IDBFactory | null | undefined = globalThis.indexedDB,
): Promise<KvDriver> {
  if (!factory) {
    throw new Error("IndexedDB is not available");
  }
  const db = await openDb(factory);
  return {
    get(store, key) {
      return withStore(db, store, "readonly", (objectStore) =>
        requestToPromise(objectStore.get(key)),
      );
    },
    async put(store, key, value) {
      await withStore(db, store, "readwrite", (objectStore) =>
        requestToPromise(objectStore.put(structuredClone(value), key)),
      );
    },
    async delete(store, key) {
      await withStore(db, store, "readwrite", (objectStore) =>
        requestToPromise(objectStore.delete(key)),
      );
    },
    async getAll(store) {
      const rows = await withStore(db, store, "readonly", (objectStore) =>
        requestToPromise(objectStore.getAll()),
      );
      return rows.map((row) => structuredClone(row));
    },
  };
}

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORE_NAMES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name);
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb open failed"));
  });
}

function withStore<T>(
  db: IDBDatabase,
  store: StoreName,
  mode: IDBTransactionMode,
  work: (objectStore: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const tx = db.transaction(store, mode);
  const done = transactionDone(tx);
  return work(tx.objectStore(store)).then(async (value) => {
    await done;
    return value;
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexeddb transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("indexeddb transaction aborted"));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb request failed"));
  });
}
