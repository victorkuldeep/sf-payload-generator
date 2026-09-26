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

import { STORES, withStore } from "@/lib/db";

const STORE = STORES.soqlQueries;
const MAX_HISTORY = 30;

export async function listSoqlQueries(): Promise<SoqlQuery[]> {
  const all = await withStore<SoqlQuery[]>(STORE, "readonly", (store) => store.getAll());
  return (all ?? []).sort((a, b) => b.lastRun - a.lastRun);
}

export async function saveSoqlQuery(q: SoqlQuery): Promise<void> {
  await withStore(STORE, "readwrite", (store) => store.put(q));
  // Prune auto-history (saved queries are immortal)
  const all = await listSoqlQueries();
  const auto = all.filter((x) => !x.saved).slice(MAX_HISTORY);
  if (auto.length > 0) {
    await withStore(STORE, "readwrite", (store) => {
      for (const x of auto) store.delete(x.id);
      return store.get(q.id);
    });
  }
}

export async function deleteSoqlQuery(id: string): Promise<void> {
  await withStore(STORE, "readwrite", (store) => store.delete(id));
}
