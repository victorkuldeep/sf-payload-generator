import { JsonSpike } from "@/components/json-spike/JsonSpike";

export const metadata = { title: "JSON Spike (internal)" };

/** Hidden spike route - not linked in navigation. Deleted after go/no-go. */
export default function JsonSpikePage() {
  return <JsonSpike />;
}
