import { MappingRoute } from "@/components/mapping/MappingRoute";
import { ToolHeader } from "@/components/layout/ToolHeader";
import { AppFooter } from "@/components/layout/AppFooter";

export const metadata = { title: "Mapping Studio" };

export default function MappingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <ToolHeader />
      <main className="mx-auto w-full max-w-[1600px] px-2 pt-3 pb-1 flex-1">
        <MappingRoute />
      </main>
      <AppFooter variant="slim" />
    </div>
  );
}
