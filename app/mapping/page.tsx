import { MappingRoute } from "@/components/mapping/MappingRoute";
import { ToolHeader } from "@/components/layout/ToolHeader";
import { AppFooter } from "@/components/layout/AppFooter";

export const metadata = { title: "Mapping Studio" };

export default function MappingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <ToolHeader />
      <main className="mx-auto w-full max-w-[1500px] px-5 py-6 flex-1">
        <MappingRoute />
      </main>
      <AppFooter variant="slim" />
    </div>
  );
}
