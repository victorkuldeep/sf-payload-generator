import { buildIndex, type GraphIndex, type GraphInput } from "./index";
import { listSystemProjects, loadSystemProject } from "@/lib/system-design/store";
import { listExperiences } from "@/lib/wireframe/store";
import { listSequences } from "@/lib/sequence/store";
import { listDecisions } from "@/lib/decisions/store";
import { listConsoleTasks } from "@/lib/console/store";
import { listSnapshotsByOrg } from "@/lib/erd/snapshotDb";
import { aiHistoryKey } from "@/lib/ai/gate";
import { readStoredScene } from "@/lib/draw/storage";

/**
 * Assemble a GraphInput from the live IDB stores. Every source degrades
 * to empty off-browser or on failure - a partial index still answers.
 * Snapshots need an org; without a connection they are skipped (bindings
 * still resolve as stubs, honestly marked unresolved).
 */
export async function loadGraphInput(): Promise<GraphInput> {
  const [summaries, experiences, sequences, decisions, tasks] = await Promise.all([
    listSystemProjects().catch(() => []),
    listExperiences().catch(() => []),
    listSequences().catch(() => []),
    listDecisions().catch(() => []),
    listConsoleTasks().catch(() => []),
  ]);
  const systems = (
    await Promise.all(summaries.map((s) => loadSystemProject(s.id).catch(() => null)))
  ).filter((p): p is NonNullable<typeof p> => p !== null);
  let snapshots: GraphInput["snapshots"] = [];
  try {
    const org = aiHistoryKey();
    if (org !== "local") snapshots = await listSnapshotsByOrg(org).catch(() => []);
  } catch {
    snapshots = [];
  }
  let drawBoard = false;
  try {
    drawBoard = (await readStoredScene().catch(() => null)) !== null;
  } catch {
    drawBoard = false;
  }
  return { systems, experiences, sequences, decisions, tasks, snapshots, drawBoard };
}

/** Build the index straight from the live stores. */
export async function loadGraphIndex(): Promise<GraphIndex> {
  return buildIndex(await loadGraphInput());
}
