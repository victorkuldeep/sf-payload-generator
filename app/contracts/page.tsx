import { ToolHeader } from "@/components/layout/ToolHeader";
import { AppFooter } from "@/components/layout/AppFooter";
import { ContractsRoute } from "@/components/contracts/ContractsRoute";

export const metadata = {
  title: "API Contract Studio",
  description: "Design OpenAPI contracts from live Salesforce metadata - profiles, operations, mappings, validation.",
  robots: { index: false, follow: false },
};

export default function ContractsPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <ToolHeader />
      <main className="mx-auto w-full max-w-[1600px] px-2 pt-3 pb-1 flex-1">
        <ContractsRoute />
      </main>
      <AppFooter variant="slim" />
    </div>
  );
}
