import { JsonStudio } from "@/components/json-studio/JsonStudio";
import { ToolHeader } from "@/components/layout/ToolHeader";
import { AppFooter } from "@/components/layout/AppFooter";

export const metadata = { title: "JSON Studio" };

export default function JsonPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <ToolHeader />
      <main className="mx-auto w-full max-w-[1400px] px-5 py-6 flex-1">
        <JsonStudio />
      </main>
      <AppFooter variant="slim" />
    </div>
  );
}

