import { RequirementsRoute } from "@/components/requirements/RequirementsRoute";
import { ToolHeader } from "@/components/layout/ToolHeader";
import { AppFooter } from "@/components/layout/AppFooter";

export const metadata = { title: "Requirements" };

export default function RequirementsPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <ToolHeader />
      <main className="mx-auto w-full max-w-[1600px] px-2.5 pt-3 pb-1 flex-1">
        <RequirementsRoute />
      </main>
      <AppFooter variant="slim" />
    </div>
  );
}
