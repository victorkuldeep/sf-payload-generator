import { WireframeRoute } from "@/components/wireframe/WireframeRoute";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppFooter } from "@/components/layout/AppFooter";

export const metadata = { title: "Wireframe Studio" };

export default function WireframePage() {
  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1600px] px-2.5 pt-3 pb-1 flex-1">
        <WireframeRoute />
      </main>
      <AppFooter variant="slim" />
    </div>
  );
}
