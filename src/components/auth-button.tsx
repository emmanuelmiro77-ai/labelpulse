"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { LogOut, LogIn, User, ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Auth button shown in the top-right of the header.
 *
 * - When unauthenticated: shows "Accedi" (Login with Google)
 * - When authenticated: shows the user's avatar + name, with a dropdown
 *   containing "Esci" (Logout) that calls signOut()
 *
 * The login flow uses NextAuth's Google provider, which is already
 * configured in /api/auth/[...nextauth]/route.ts. The Google OAuth
 * credentials must be set in the environment (GOOGLE_CLIENT_ID,
 * GOOGLE_CLIENT_SECRET, NEXTAUTH_SECRET, NEXTAUTH_URL) — Vercel has them.
 *
 * After login, useAuthEffect() (mounted in the root page) detects the
 * authenticated session and triggers loadFromCloud() so the user's data
 * appears on any device they log in from.
 */
export function AuthButton() {
  const { data: session, status } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  // Loading state — don't render anything to avoid layout shift
  if (status === "loading") {
    return (
      <div className="w-8 h-8 rounded-full bg-muted/50 animate-pulse" />
    );
  }

  // Unauthenticated — show login button
  // IMPORTANT: text "Accedi" is ALWAYS visible (no `hidden sm:inline`) so
  // the button is identifiable on mobile, where the header is crowded with
  // many small icon-only buttons. Variant="default" (primary color) makes
  // it stand out as the primary call-to-action for unauthenticated users.
  if (status === "unauthenticated" || !session?.user) {
    return (
      <Button
        onClick={() => signIn("google")}
        size="sm"
        variant="default"
        className="gap-1.5 text-xs shrink-0"
        title="Accedi con Google per sincronizzare i tuoi dati su tutti i dispositivi"
      >
        <LogIn className="h-3.5 w-3.5" />
        <span>Accedi</span>
      </Button>
    );
  }

  // Authenticated — show avatar + dropdown
  const user = session.user!;
  const displayName = user.name || user.email || "User";
  const initials = (user.name || user.email || "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex items-center gap-1.5 rounded-full pl-1 pr-2 py-1 hover:bg-secondary/50 transition-colors"
        title={user.email || displayName}
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt={displayName}
            className="w-7 h-7 rounded-full border border-border/50"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold border border-primary/30">
            {initials}
          </div>
        )}
        <ChevronDown className="h-3 w-3 text-muted-foreground hidden sm:block" />
      </button>

      {menuOpen && (
        <div className="absolute right-0 top-full mt-1 w-64 rounded-lg border border-border/50 bg-popover shadow-lg z-50 overflow-hidden">
          <div className="p-3 border-b border-border/30">
            <div className="flex items-center gap-2">
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.image}
                  alt={displayName}
                  className="w-10 h-10 rounded-full border border-border/50"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold border border-primary/30">
                  {initials}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{displayName}</div>
                {user.email && (
                  <div className="text-xs text-muted-foreground truncate">
                    {user.email}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="p-1">
            <button
              onClick={() => {
                setMenuOpen(false);
                signOut({ callbackUrl: "/" });
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Esci
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
