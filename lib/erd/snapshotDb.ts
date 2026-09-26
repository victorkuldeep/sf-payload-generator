export interface ErdSnapshot {
  id: string;
  /** Org hostname, e.g. myorg.my.salesforce.com - snapshots are listed per org. */
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

import { STORES, withStore } from "@/lib/db";

const STORE = STORES.erdSnapshots;
const MAX_PER_ORG = 20;

export async function listSnapshotsByOrg(orgDomain: string): Promise<ErdSnapshot[]> {
  const all = await withStore<ErdSnapshot[]>(STORE, "readonly", (store) => store.getAll());
  return (all ?? [])
    .filter((s) => s.orgDomain === orgDomain)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveSnapshot(snap: ErdSnapshot): Promise<void> {
  await withStore(STORE, "readwrite", (store) => store.put(snap));
  // Prune to the newest MAX_PER_ORG for this org
  const kept = await listSnapshotsByOrg(snap.orgDomain);
  const extra = kept.slice(MAX_PER_ORG);
  if (extra.length > 0) {
    await withStore(STORE, "readwrite", (store) => {
      for (const s of extra) store.delete(s.id);
      // Return a dummy request - completion is tracked via the transaction
      return store.get(snap.id);
    });
  }
}

export async function deleteSnapshot(id: string): Promise<void> {
  await withStore(STORE, "readwrite", (store) => store.delete(id));
}

export async function renameSnapshot(id: string, name: string): Promise<void> {
  const all = await withStore<ErdSnapshot[]>(STORE, "readonly", (store) => store.getAll());
  const found = (all ?? []).find((s) => s.id === id);
  if (!found) return;
  await withStore(STORE, "readwrite", (store) => store.put({ ...found, name }));
}
