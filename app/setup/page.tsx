import { AppHeader } from "@/components/layout/AppHeader";
import { AppFooter } from "@/components/layout/AppFooter";
import { SetupRoute } from "@/components/setup/SetupRoute";

export const metadata = {
  title: "Setup - GRAVENX Admin",
  description: "Admin console: agent control plane, connections, workspace, compliance, about.",
  robots: { index: false, follow: false },
};

export default function SetupPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1600px] px-2.5 pt-3 pb-1 flex-1">
        <SetupRoute />
      </main>
      <AppFooter variant="slim" />
    </div>
  );
}
