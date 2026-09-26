export interface RestHistoryEntry {
  id: string;
  name: string;
  method: string;
  scope: "org" | "custom";
  url: string;
  status: number | null;
  timeMs: number | null;
  createdAt: number;
  /** Full request snapshot for one-click recall. */
  snapshot: {
    method: string;
    path: string;
    customUrl: string;
    authType: string;
    headers: { key: string; value: string }[];
    body: string;
  };
}

const DB_NAME = "sf-payload-studio";
const STORE = "rest-history";
const DB_VERSION = 5;
const MAX_ENTRIES = 50;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of [
        "request-collection",
        "collections",
        "erd-snapshots",
        "soql-queries",
        STORE,
      ]) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: "id" });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        let tx: IDBTransaction;
        try {
          tx = db.transaction(STORE, mode);
        } catch (err) {
          db.close();
          reject(err instanceof Error ? err : new Error("IndexedDB transaction failed"));
          return;
        }
        const store = tx.objectStore(STORE);
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

export async function listRestHistory(): Promise<RestHistoryEntry[]> {
  const all = await withStore<RestHistoryEntry[]>("readonly", (store) => store.getAll());
  return (all ?? []).sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveRestHistory(entry: RestHistoryEntry): Promise<void> {
  await withStore("readwrite", (store) => store.put(entry));
  const all = await listRestHistory();
  const extra = all.slice(MAX_ENTRIES);
  if (extra.length > 0) {
    await withStore("readwrite", (store) => {
      for (const x of extra) store.delete(x.id);
      return store.get(entry.id);
    });
  }
}

export async function deleteRestHistory(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

export async function clearRestHistory(): Promise<void> {
  await withStore("readwrite", (store) => store.clear());
}
