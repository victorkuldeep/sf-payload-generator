import { JsonStudio } from "@/components/json-studio/JsonStudio";

export const metadata = { title: "JSON Studio" };

export default function JsonPage() {
  return (
    <main className="mx-auto w-full max-w-[1400px] px-5 py-6">
      <JsonStudio />
    </main>
  );
}
