"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Bug, KeyRound, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const ADMIN_EMAILS = new Set(["emmanuel.miro77@gmail.com"]);

export default function AdminIndexPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    const email = session?.user?.email?.toLowerCase().trim() || "";
    if (!ADMIN_EMAILS.has(email)) {
      router.push("/");
    }
  }, [session, status, router]);

  if (status !== "authenticated") {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Verifica accesso…</div>;
  }

  const email = session?.user?.email?.toLowerCase().trim() || "";
  if (!ADMIN_EMAILS.has(email)) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6 max-w-3xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Area Admin</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gestione beta tester e feedback
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={() => router.push("/admin/beta-testers")}
          className="text-left rounded-lg border border-border/40 bg-card/50 p-5 hover:bg-card transition-colors group"
        >
          <KeyRound className="h-8 w-8 text-amber-400 mb-3" />
          <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
            Beta Tester
            <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
          </h2>
          <p className="text-sm text-muted-foreground">
            Genera codici di accesso per amici/colleghi senza account Google.
            Vedi chi ha usato il codice e quando.
          </p>
        </button>

        <button
          onClick={() => router.push("/admin/feedback")}
          className="text-left rounded-lg border border-border/40 bg-card/50 p-5 hover:bg-card transition-colors group"
        >
          <Bug className="h-8 w-8 text-amber-400 mb-3" />
          <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
            Bug Reports
            <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
          </h2>
          <p className="text-sm text-muted-foreground">
            Leggi i feedback inviati dai beta tester dall'app.
            Cambia stato (nuovo, letto, risolto, ignorato).
          </p>
        </button>
      </div>

      <div className="mt-8">
        <Button variant="outline" size="sm" onClick={() => router.push("/")}>
          ← Torna all'app
        </Button>
      </div>
    </div>
  );
}
