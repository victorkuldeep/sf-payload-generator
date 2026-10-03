import { WireframeRoute } from "@/components/wireframe/WireframeRoute";
import { ToolHeader } from "@/components/layout/ToolHeader";
import { AppFooter } from "@/components/layout/AppFooter";

export const metadata = { title: "Wireframe Studio" };

export default function WireframePage() {
  return (
    <div className="flex flex-col min-h-screen">
      <ToolHeader />
      <main className="mx-auto w-full max-w-[1500px] px-5 pt-6 pb-1 flex-1">
        <WireframeRoute />
      </main>
      <AppFooter variant="slim" />
    </div>
  );
}
