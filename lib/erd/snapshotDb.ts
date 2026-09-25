export interface ErdSnapshot {
  id: string;
  /** Org hostname, e.g. myorg.my.salesforce.com — snapshots are listed per org. */
  orgDomain: string;
  name: string;
  createdAt: number;
  root: string;
  focus: string;
  /** Objects on canvas. */
  nodes: string[];
  /** Drag positions to reapply on restore. */
  positions: Record<string, { x: number; y: number }>;
}

const DB_NAME = "sf-payload-studio";
const STORE = "erd-snapshots";
const DB_VERSION = 3;
const MAX_PER_ORG = 20;

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

export async function listSnapshotsByOrg(orgDomain: string): Promise<ErdSnapshot[]> {
  const all = await withStore<ErdSnapshot[]>("readonly", (store) => store.getAll());
  return (all ?? [])
    .filter((s) => s.orgDomain === orgDomain)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveSnapshot(snap: ErdSnapshot): Promise<void> {
  await withStore("readwrite", (store) => store.put(snap));
  // Prune to the newest MAX_PER_ORG for this org
  const kept = await listSnapshotsByOrg(snap.orgDomain);
  const extra = kept.slice(MAX_PER_ORG);
  if (extra.length > 0) {
    await withStore("readwrite", (store) => {
      for (const s of extra) store.delete(s.id);
      // Return a dummy request — completion is tracked via the transaction
      return store.get(snap.id);
    });
  }
}

export async function deleteSnapshot(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

export async function renameSnapshot(id: string, name: string): Promise<void> {
  const all = await withStore<ErdSnapshot[]>("readonly", (store) => store.getAll());
  const found = (all ?? []).find((s) => s.id === id);
  if (!found) return;
  await withStore("readwrite", (store) => store.put({ ...found, name }));
}
