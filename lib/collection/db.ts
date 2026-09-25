import type { Collection, CollectionItem } from "./types";

const DB_NAME = "sf-payload-studio";
const ITEMS_STORE = "request-collection";
const COLLECTIONS_STORE = "collections";
// v3 also hosts the erd-snapshots store (see lib/erd/snapshotDb.ts).
const DB_VERSION = 3;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ITEMS_STORE)) {
        db.createObjectStore(ITEMS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(COLLECTIONS_STORE)) {
        db.createObjectStore(COLLECTIONS_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });
}

function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        let tx: IDBTransaction;
        try {
          tx = db.transaction(storeName, mode);
        } catch (err) {
          db.close();
          reject(err instanceof Error ? err : new Error("IndexedDB transaction failed"));
          return;
        }
        const store = tx.objectStore(storeName);
        let result: T;
        try {
          const req = fn(store);
          req.onsuccess = () => {
            result = req.result;
          };
          req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
        } catch (err) {
          reject(err instanceof Error ? err : new Error("IndexedDB request failed"));
          return;
        }
        tx.oncomplete = () => {
          db.close();
          resolve(result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error("IndexedDB transaction failed"));
        };
      })
  );
}

// ── Items ────────────────────────────────────────────────────────────────

export async function listCollectionItems(): Promise<CollectionItem[]> {
  const items = await withStore<CollectionItem[]>(ITEMS_STORE, "readonly", (store) =>
    store.getAll()
  );
  return (items ?? []).sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveCollectionItem(item: CollectionItem): Promise<void> {
  await withStore(ITEMS_STORE, "readwrite", (store) => store.put(item));
}

export async function deleteCollectionItem(id: string): Promise<void> {
  await withStore(ITEMS_STORE, "readwrite", (store) => store.delete(id));
}

export async function clearCollectionItems(): Promise<void> {
  await withStore(ITEMS_STORE, "readwrite", (store) => store.clear());
}

// ── Collections ──────────────────────────────────────────────────────────

export async function listCollections(): Promise<Collection[]> {
  const cols = await withStore<Collection[]>(COLLECTIONS_STORE, "readonly", (store) =>
    store.getAll()
  );
  return (cols ?? []).sort((a, b) => a.createdAt - b.createdAt);
}

export async function saveCollection(collection: Collection): Promise<void> {
  await withStore(COLLECTIONS_STORE, "readwrite", (store) => store.put(collection));
}

export async function deleteCollection(id: string): Promise<void> {
  await withStore(COLLECTIONS_STORE, "readwrite", (store) => store.delete(id));
}
