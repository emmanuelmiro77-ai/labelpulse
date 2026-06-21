"use client";

import React, { useState, useCallback, useEffect } from "react";
import {
  signInWithEmail,
  signUpWithEmail,
  signOut,
  resetPassword,
  getCurrentUser,
  onAuthStateChange,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { t, type Locale } from "@/lib/i18n";
import type { User, Session } from "@supabase/supabase-js";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  Music2,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  LogOut,
  Cloud,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type AuthView = "login" | "signup" | "forgot" | "confirm";

interface AuthPageProps {
  locale: Locale;
  onAuthChange?: (user: User | null) => void;
}

export function AuthPage({ locale, onAuthChange }: AuthPageProps) {
  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Check auth state on mount
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    getCurrentUser().then((user) => {
      setCurrentUser(user);
      onAuthChange?.(user);
    });

    const unsubscribe = onAuthStateChange((user) => {
      setCurrentUser(user);
      onAuthChange?.(user);
    });

    return unsubscribe;
  }, [onAuthChange]);

  const handleLogin = useCallback(async () => {
    if (!email.trim() || !password) {
      setError("Inserisci email e password");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    const { user, error: authError } = await signInWithEmail(email.trim(), password);

    if (authError) {
      setError(authError);
      setLoading(false);
      return;
    }

    if (user) {
      setSuccess("Login effettuato! Caricamento dati...");
      setCurrentUser(user);
      onAuthChange?.(user);
      // Il redirect è gestito dal parent component
    } else {
      setError("Errore imprevisto durante il login");
    }
    setLoading(false);
  }, [email, password, onAuthChange]);

  const handleSignup = useCallback(async () => {
    if (!email.trim() || !password) {
      setError("Inserisci email e password");
      return;
    }

    if (password.length < 6) {
      setError("La password deve essere di almeno 6 caratteri");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    const { user, error: authError } = await signUpWithEmail(email.trim(), password);

    if (authError) {
      setError(authError);
      setLoading(false);
      return;
    }

    if (user) {
      // Se email confirmation è disabilitata, l'utente è subito loggato
      if (user.email_confirmed_at) {
        setSuccess("Account creato! Benvenuto in LabelPulse!");
        setCurrentUser(user);
        onAuthChange?.(user);
      } else {
        setSuccess("Account creato! Controlla la tua email per confermare.");
        setView("confirm");
      }
    }
    setLoading(false);
  }, [email, password, onAuthChange]);

  const handleForgotPassword = useCallback(async () => {
    if (!email.trim()) {
      setError("Inserisci la tua email");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    const { error: resetError } = await resetPassword(email.trim());

    if (resetError) {
      setError(resetError);
    } else {
      setSuccess("Email di reset inviata! Controlla la tua casella di posta.");
    }
    setLoading(false);
  }, [email]);

  const handleLogout = useCallback(async () => {
    setLoading(true);
    await signOut();
    setCurrentUser(null);
    onAuthChange?.(null);
    setView("login");
    setEmail("");
    setPassword("");
    setError(null);
    setSuccess(null);
    setLoading(false);
  }, [onAuthChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !loading) {
        if (view === "login") handleLogin();
        else if (view === "signup") handleSignup();
        else if (view === "forgot") handleForgotPassword();
      }
    },
    [view, loading, handleLogin, handleSignup, handleForgotPassword]
  );

  // If Supabase is not configured, show offline mode
  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md bg-card/60 border-border/40">
          <CardContent className="p-8 text-center">
            <div className="flex items-end justify-center gap-[3px] h-10 w-10 mx-auto mb-4">
              <div className="vu-bar w-[5px] rounded-sm bg-primary" style={{ animationDuration: "1.1s" }} />
              <div className="vu-bar w-[5px] rounded-sm bg-primary/80" style={{ animationDuration: "0.8s" }} />
              <div className="vu-bar w-[5px] rounded-sm bg-cyan-glow" style={{ animationDuration: "1s" }} />
              <div className="vu-bar w-[5px] rounded-sm bg-primary/80" style={{ animationDuration: "0.7s" }} />
              <div className="vu-bar w-[5px] rounded-sm bg-primary" style={{ animationDuration: "0.9s" }} />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">LabelPulse</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Modalità offline — i dati vengono salvati solo su questo dispositivo.
            </p>
            <p className="text-xs text-muted-foreground/60">
              Configura Supabase per abilitare il sync cloud e il login.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-end justify-center gap-[3px] h-10 w-10 mx-auto mb-3">
            <div className="vu-bar w-[5px] rounded-sm bg-primary" style={{ animationDuration: "1.1s" }} />
            <div className="vu-bar w-[5px] rounded-sm bg-primary/80" style={{ animationDuration: "0.8s" }} />
            <div className="vu-bar w-[5px] rounded-sm bg-cyan-glow" style={{ animationDuration: "1s" }} />
            <div className="vu-bar w-[5px] rounded-sm bg-primary/80" style={{ animationDuration: "0.7s" }} />
            <div className="vu-bar w-[5px] rounded-sm bg-primary" style={{ animationDuration: "0.9s" }} />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">LabelPulse</h1>
          <p className="text-xs text-muted-foreground font-mono tracking-widest uppercase mt-1">
            DJ & Producer Demo Manager
          </p>
        </div>

        {/* Main Auth Card */}
        <Card className="bg-card/60 border-border/40 backdrop-blur-sm">
          <CardContent className="p-6 sm:p-8">
            {/* Error message */}
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 mb-4">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Success message */}
            {success && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 mb-4">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-sm text-emerald-400">{success}</p>
              </div>
            )}

            {/* LOGIN VIEW */}
            {view === "login" && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Accedi</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Usa il tuo account per sincronizzare i dati su tutti i dispositivi
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); setError(null); }}
                        onKeyDown={handleKeyDown}
                        placeholder="tu@email.com"
                        className="pl-9 bg-secondary/50"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setError(null); }}
                        onKeyDown={handleKeyDown}
                        placeholder="••••••"
                        className="pl-9 pr-10 bg-secondary/50"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => { setView("forgot"); setError(null); setSuccess(null); }}
                    className="text-xs text-primary hover:underline"
                  >
                    Password dimenticata?
                  </button>
                </div>

                <Button
                  onClick={handleLogin}
                  disabled={loading}
                  className="w-full gap-2"
                  size="lg"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Accedi
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>

                <div className="text-center">
                  <p className="text-sm text-muted-foreground">
                    Non hai un account?{" "}
                    <button
                      type="button"
                      onClick={() => { setView("signup"); setError(null); setSuccess(null); }}
                      className="text-primary hover:underline font-medium"
                    >
                      Registrati
                    </button>
                  </p>
                </div>
              </div>
            )}

            {/* SIGNUP VIEW */}
            {view === "signup" && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Crea il tuo account</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Un account per sincronizzare i tuoi dati su PC, telefono e tablet
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); setError(null); }}
                        onKeyDown={handleKeyDown}
                        placeholder="tu@email.com"
                        className="pl-9 bg-secondary/50"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setError(null); }}
                        onKeyDown={handleKeyDown}
                        placeholder="Almeno 6 caratteri"
                        className="pl-9 pr-10 bg-secondary/50"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Benefits */}
                <div className="space-y-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="text-[10px] uppercase tracking-wider font-medium text-primary mb-2">
                    Con un account ottieni:
                  </p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Cloud className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>Sync automatico tra tutti i tuoi dispositivi</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Music2 className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>Backup cloud dei tuoi dati sempre aggiornato</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>I tuoi dati sono privati e accessibili solo a te</span>
                  </div>
                </div>

                <Button
                  onClick={handleSignup}
                  disabled={loading}
                  className="w-full gap-2"
                  size="lg"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Crea account
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => { setView("login"); setError(null); setSuccess(null); }}
                    className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 mx-auto"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Torna al login
                  </button>
                </div>
              </div>
            )}

            {/* FORGOT PASSWORD VIEW */}
            {view === "forgot" && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Reset password</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Inserisci la tua email e ti invieremo un link per reimpostare la password
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setError(null); }}
                      onKeyDown={handleKeyDown}
                      placeholder="tu@email.com"
                      className="pl-9 bg-secondary/50"
                      autoFocus
                    />
                  </div>
                </div>

                <Button
                  onClick={handleForgotPassword}
                  disabled={loading}
                  className="w-full gap-2"
                  size="lg"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Invia link di reset"
                  )}
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => { setView("login"); setError(null); setSuccess(null); }}
                    className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 mx-auto"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Torna al login
                  </button>
                </div>
              </div>
            )}

            {/* CONFIRM EMAIL VIEW */}
            {view === "confirm" && (
              <div className="space-y-5 text-center">
                <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                  <Mail className="h-8 w-8 text-emerald-400 mx-auto mb-3" />
                  <h2 className="text-lg font-semibold text-foreground">Controlla la tua email</h2>
                  <p className="text-sm text-muted-foreground mt-2">
                    Abbiamo inviato un link di conferma a <strong className="text-foreground">{email}</strong>.
                    Clicca sul link per attivare il tuo account.
                  </p>
                </div>

                <Button
                  onClick={() => { setView("login"); setError(null); setSuccess(null); }}
                  variant="outline"
                  className="w-full gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Torna al login
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer info */}
        <p className="text-center text-[10px] text-muted-foreground/40 mt-6 font-mono">
          I tuoi dati sono cifrati e accessibili solo dal tuo account
        </p>
      </div>
    </div>
  );
}
