import { ToolHeader } from "@/components/layout/ToolHeader";
import { AppFooter } from "@/components/layout/AppFooter";
import { SystemDesigner } from "@/components/system-design/SystemDesigner";

export const metadata = {
  title: "System Design Studio",
  description: "Visual system architecture and executable integration workbench - model systems, connect them, prove the flows.",
  robots: { index: false, follow: false },
};

export default function SystemPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <ToolHeader />
      <main className="mx-auto w-full max-w-[1500px] px-5 pt-6 pb-1 flex-1">
        <SystemDesigner />
      </main>
      <AppFooter variant="slim" />
    </div>
  );
}
