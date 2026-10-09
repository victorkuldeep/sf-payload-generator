import { NotesRoute } from "@/components/notes/NotesRoute";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppFooter } from "@/components/layout/AppFooter";

export const metadata = { title: "Notes" };

export default function NotesPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1600px] px-2.5 pt-3 pb-1 flex-1">
        <NotesRoute />
      </main>
      <AppFooter variant="slim" />
    </div>
  );
}
