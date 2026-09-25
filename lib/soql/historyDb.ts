export interface SoqlQuery {
  id: string;
  soql: string;
  label: string;
  /** User-saved (named) vs auto history. */
  saved: boolean;
  tooling: boolean;
  rowCount: number | null;
  createdAt: number;
  lastRun: number;
}

const DB_NAME = "sf-payload-studio";
const STORE = "soql-queries";
const DB_VERSION = 4;
const MAX_HISTORY = 30;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("request-collection")) {
        db.createObjectStore("request-collection", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("collections")) {
        db.createObjectStore("collections", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("erd-snapshots")) {
        db.createObjectStore("erd-snapshots", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
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

export async function listSoqlQueries(): Promise<SoqlQuery[]> {
  const all = await withStore<SoqlQuery[]>("readonly", (store) => store.getAll());
  return (all ?? []).sort((a, b) => b.lastRun - a.lastRun);
}

export async function saveSoqlQuery(q: SoqlQuery): Promise<void> {
  await withStore("readwrite", (store) => store.put(q));
  // Prune auto-history (saved queries are immortal)
  const all = await listSoqlQueries();
  const auto = all.filter((x) => !x.saved).slice(MAX_HISTORY);
  if (auto.length > 0) {
    await withStore("readwrite", (store) => {
      for (const x of auto) store.delete(x.id);
      return store.get(q.id);
    });
  }
}

export async function deleteSoqlQuery(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}
