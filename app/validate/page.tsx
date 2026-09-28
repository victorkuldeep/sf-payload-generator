import { ValidateStudio } from "@/components/validate/ValidateStudio";
import { ToolHeader } from "@/components/layout/ToolHeader";
import { AppFooter } from "@/components/layout/AppFooter";

export const metadata = { title: "Validate - Contract Conformance" };

export default function ValidatePage() {
  return (
    <div className="flex flex-col min-h-screen">
      <ToolHeader />
      <main className="mx-auto w-full max-w-[1400px] px-5 pt-6 pb-1 flex-1">
        <ValidateStudio />
      </main>
      <AppFooter variant="slim" />
    </div>
  );
}
