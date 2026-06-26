"use client";

import { useState } from "react";
import { ArrowLeft, Shield, FileText, Cookie, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type Tab = "privacy" | "terms" | "cookies";

export default function LegalPage() {
  const [activeTab, setActiveTab] = useState<Tab>("privacy");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="h-4 w-4" />
              Torna all&apos;app
            </Button>
          </Link>
          <h1 className="font-semibold text-lg">Legale</h1>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="sticky top-[57px] z-10 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 flex gap-1">
          <button
            onClick={() => setActiveTab("privacy")}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "privacy"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Shield className="h-4 w-4" />
            Privacy
          </button>
          <button
            onClick={() => setActiveTab("terms")}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "terms"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileText className="h-4 w-4" />
            Termini
          </button>
          <button
            onClick={() => setActiveTab("cookies")}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "cookies"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Cookie className="h-4 w-4" />
            Cookie
          </button>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 py-6">
        {activeTab === "privacy" && <PrivacyContent />}
        {activeTab === "terms" && <TermsContent />}
        {activeTab === "cookies" && <CookiesContent />}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12">
        <div className="max-w-3xl mx-auto px-4 py-4 text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
          <Scale className="h-3 w-3" />
          Ultimo aggiornamento: 27 Giugno 2026 · Contatto: pulse.label.official@gmail.com
          <span className="text-muted-foreground/20">·</span>
          <a href="/account/withdrawal" className="underline hover:text-foreground transition-colors">
            Diritto di recesso
          </a>
        </div>
      </footer>
    </div>
  );
}

function PrivacyContent() {
  return (
    <div className="prose prose-sm prose-invert max-w-none">
      <h2>Privacy Policy</h2>
      <p><strong>Titolare del trattamento</strong>: Emmanuel Miro — LabelPulse</p>
      <p><strong>Email</strong>: pulse.label.official@gmail.com</p>
      <p><strong>Sito web</strong>: https://labelpulse.vercel.app</p>

      <h3>1. Chi siamo</h3>
      <p>LabelPulse è un&apos;applicazione web (PWA) sviluppata da Emmanuel Miro che permette a DJ e produttori musicali di gestire le proprie demo submission verso label discografiche elettroniche.</p>

      <h3>2. Quali dati raccogliamo</h3>
      <h4>2.1 Dati forniti dall&apos;utente</h4>
      <ul>
        <li><strong>Profilo utente</strong>: nome artista, link SoundCloud, bio, foto profilo (opzionali)</li>
        <li><strong>Account Google</strong>: email, nome e immagine del profilo Google (tramite NextAuth/OAuth)</li>
        <li><strong>Dati operativi</strong>: label tracciate, demo salvate, pitch generati, note personali</li>
        <li><strong>Gmail integration</strong>: accesso limitato all&apos;invio di email — non leggiamo la tua posta in arrivo</li>
      </ul>

      <h4>2.2 Dati raccolti automaticamente</h4>
      <ul>
        <li><strong>Dati di utilizzo</strong>: eventi di interazione tramite PostHog (solo con consenso)</li>
        <li><strong>Dati tecnici</strong>: tipo di browser, sistema operativo, risoluzione</li>
        <li><strong>Errori</strong>: errori client/server raccolti tramite Bugsnag</li>
      </ul>

      <h4>2.3 Dati NON raccolti</h4>
      <ul>
        <li>NON leggiamo le tue email in arrivo</li>
        <li>NON accediamo ai tuoi contatti</li>
        <li>NON tracciamo la tua posizione GPS</li>
        <li>NON raccogliamo dati di pagamento</li>
      </ul>

      <h3>3. Come utilizziamo i dati</h3>
      <table className="w-full text-xs">
        <thead>
          <tr><th>Finalità</th><th>Base giuridica</th></tr>
        </thead>
        <tbody>
          <tr><td>Fornire il servizio</td><td>Esecuzione contratto (art. 6(1)(b) GDPR)</td></tr>
          <tr><td>Cloud sync tra dispositivi</td><td>Esecuzione contratto (art. 6(1)(b) GDPR)</td></tr>
          <tr><td>Analisi di utilizzo</td><td>Interesse legittimo (art. 6(1)(f) GDPR)</td></tr>
          <tr><td>Monitoraggio errori</td><td>Interesse legittimo (art. 6(1)(f) GDPR)</td></tr>
          <tr><td>Comunicazioni beta</td><td>Consenso (art. 6(1)(a) GDPR)</td></tr>
        </tbody>
      </table>

      <h3>4. Dove conserviamo i dati</h3>
      <ul>
        <li><strong>Locale</strong>: localStorage sul tuo dispositivo (cache)</li>
        <li><strong>Cloud (Supabase)</strong>: dati operativi per utente, regione EU, RLS attivo, backup giornalieri</li>
        <li><strong>Servizi terzi</strong>: Vercel (hosting), PostHog (analytics), Bugsnag (errori), Google (auth)</li>
      </ul>

      <h3>5. I tuoi diritti (GDPR)</h3>
      <ul>
        <li><strong>Accesso</strong> (art. 15): ottenere una copia dei tuoi dati</li>
        <li><strong>Rettifica</strong> (art. 16): correggere dati inesatti</li>
        <li><strong>Cancellazione</strong> (art. 17): richiedere l&apos;eliminazione</li>
        <li><strong>Portabilità</strong> (art. 20): ricevere i dati in formato portabile</li>
        <li><strong>Opposizione</strong> (art. 21): opporsi al trattamento</li>
        <li><strong>Recesso consenso</strong> (art. 7(3)): revocare il consenso in qualsiasi momento</li>
      </ul>
      <p>Tempo di risposta: entro 30 giorni. Contatta: pulse.label.official@gmail.com</p>

      <h3>6. Sicurezza</h3>
      <ul>
        <li>Row Level Security (RLS) su tutte le tabelle</li>
        <li>HTTPS su tutte le connessioni</li>
        <li>PII redaction in Bugsnag</li>
        <li>NextAuth per autenticazione sicura</li>
        <li>Hard reset su cambio account (anti-contaminazione)</li>
      </ul>

      <h3>7. Conservazione dei dati</h3>
      <ul>
        <li>Dati account e operativi: fino alla cancellazione dell&apos;account</li>
        <li>Log errore (Bugsnag): 7 giorni</li>
        <li>Dati analytics (PostHog): 7 anni</li>
      </ul>

      <h3>8. Trasferimenti internazionali</h3>
      <p>Alcuni fornitori (Vercel, PostHog, Bugsnag, Google) si trovano negli Stati Uniti. I trasferimenti sono regolati da Standard Contractual Clauses e EU-US Data Privacy Framework.</p>

      <h3>9. Contatti</h3>
      <p>Email: pulse.label.official@gmail.com</p>

      <p className="text-xs text-muted-foreground mt-6">
        Questa Privacy Policy è redatta in conformità con il Regolamento (UE) 2016/679 (GDPR) e il D.Lgs. 196/2003.
      </p>
    </div>
  );
}

function TermsContent() {
  return (
    <div className="prose prose-sm prose-invert max-w-none">
      <h2>Termini di Servizio</h2>
      <p><strong>Operatore</strong>: Emmanuel Miro — LabelPulse</p>
      <p><strong>Email</strong>: pulse.label.official@gmail.com</p>

      <h3>1. Accettazione dei termini</h3>
      <p>Utilizzando LabelPulse, accetti di essere vincolato da questi Termini. L&apos;utilizzo durante la beta è soggetto anche al NDA firmato durante lo screening.</p>

      <h3>2. Descrizione del Servizio</h3>
      <p>LabelPulse è una PWA per DJ e produttori musicali che permette di gestire demo submission, generare pitch, visualizzare classifiche Beatport e sincronizzare dati tra dispositivi. Il Servizio è attualmente in fase di beta testing chiuso.</p>

      <h3>3. Requisiti di accesso</h3>
      <ul>
        <li>Codice di accesso beta valido</li>
        <li>Account Google per l&apos;autenticazione</li>
        <li>Accettazione del NDA beta tester</li>
      </ul>

      <h3>4. Contenuti dell&apos;utente</h3>
      <p>Tu mantieni la piena proprietà di tutti i contenuti creati in LabelPulse (profilo, note, demo, pitch). Concedi a LabelPulse una licenza limitata per memorizzare ed elaborare i tuoi dati al solo scopo di fornire il Servizio.</p>

      <h3>5. Condotta dell&apos;utente</h3>
      <p>Ti impegni a NON:</p>
      <ul>
        <li>Utilizzare il Servizio per scopi illegali</li>
        <li>Inviare spam o email non richieste tramite la funzionalità Gmail</li>
        <li>Accedere ai dati di altri utenti</li>
        <li>Eseguire reverse engineering del Servizio</li>
        <li>Utilizzare bot o scraper non autorizzati</li>
        <li>Utilizzare il Servizio per creare un prodotto concorrente</li>
      </ul>

      <h3>6. Limitazione di responsabilità</h3>
      <p>IL SERVIZIO È FORNITO &quot;COSÌ COM&apos;È&quot; SENZA ALCUNA GARANZIA. LabelPulse non è responsabile per perdita di dati, mancato invio di pitch o errori nelle classifiche. Sei responsabile dei tuoi backup.</p>

      <h3>7. Risoluzione</h3>
      <p>Puoi smettere di utilizzare il Servizio in qualsiasi momento. Per eliminare il tuo account: email a pulse.label.official@gmail.com. I dati saranno eliminati entro 30 giorni (GDPR art. 17).</p>

      <h3>8. Diritto di recesso</h3>
      <p>Ai sensi dell&apos;art. 52 del Codice del Consumo, hai diritto di recedere da questi Termini entro 14 giorni senza motivazione. Email: pulse.label.official@gmail.com.</p>

      <h3>9. Legge applicabile</h3>
      <p>Questi Termini sono regolati dalla legge italiana. Foro competente: Milano.</p>

      <p className="text-xs text-muted-foreground mt-6">
        Documento completo disponibile su{" "}
        <a href="https://github.com/emmanuelmiro77-ai/labelpulse/blob/main/docs/terms-of-service.md" target="_blank" rel="noopener" className="underline">
          GitHub
        </a>.
      </p>
    </div>
  );
}

function CookiesContent() {
  return (
    <div className="prose prose-sm prose-invert max-w-none">
      <h2>Cookie Policy</h2>

      <h3>Quali cookie utilizziamo</h3>

      <h4>Cookie necessari (sempre attivi)</h4>
      <p>Questi cookie sono essenziali per il funzionamento dell&apos;app e non richiedono consenso:</p>
      <ul>
        <li><strong>labelpulse-storage</strong>: stato dell&apos;applicazione (Zustand persist) — memorizzato in localStorage</li>
        <li><strong>next-auth.*</strong>: sessione di autenticazione — cookie di sessione</li>
        <li><strong>Service Worker cache</strong>: funzionamento offline PWA — cache del browser</li>
      </ul>

      <h4>Cookie analitici (con consenso)</h4>
      <p>Questi cookie sono attivati solo se accetti il banner di consenso:</p>
      <ul>
        <li><strong>PostHog localStorage</strong>: eventi di utilizzo, page views, session recording (10% sample). Dati anonimizzati. Utilizziamo localStorage invece di cookie per maggiore privacy.</li>
      </ul>

      <h4>Monitoraggio errori (con consenso)</h4>
      <ul>
        <li><strong>Bugsnag</strong>: stack traces, contesto errore, performance spans. PII redaction attiva (password, token, API key automaticamente oscurati).</li>
      </ul>

      <h3>Come gestire i cookie</h3>

      <h4>Nel banner di consenso</h4>
      <p>Al primo accesso puoi accettare o rifiutare i cookie analitici. Puoi anche accedere alle preferenze dettagliate cliccando l&apos;icona impostazioni.</p>

      <h4>Nel browser</h4>
      <p>Puoi cancellare tutti i dati locali tramite le impostazioni del browser:</p>
      <ul>
        <li><strong>Chrome</strong>: Impostazioni → Privacy → Cancella dati di navigazione</li>
        <li><strong>Safari</strong>: Preferenze → Privacy → Gestisci dati sito web</li>
        <li><strong>Firefox</strong>: Opzioni → Privacy → Cancella dati</li>
      </ul>

      <h4>Do Not Track</h4>
      <p>Se il tuo browser ha l&apos;impostazione &quot;Do Not Track&quot; attiva, PostHog rispetterà questa preferenza e non raccoglierà dati di utilizzo, indipendentemente dal consenso dato.</p>

      <h3>localStorage vs Cookie</h3>
      <p>LabelPulse utilizza principalmente localStorage invece di cookie. Questo è più privacy-friendly perché:</p>
      <ul>
        <li>I dati localStorage non vengono inviati automaticamente al server ad ogni richiesta</li>
        <li>Puoi cancellare i dati localStorage dal browser in qualsiasi momento</li>
        <li>I dati localStorage sono isolati per dominio</li>
      </ul>

      <h3>Modifiche a questa Cookie Policy</h3>
      <p>Se aggiungiamo nuovi cookie o modifichiamo le nostre pratiche, aggiorneremo questa pagina e ti mostreremo nuovamente il banner di consenso.</p>

      <h3>Contatti</h3>
      <p>Per domande sui cookie: pulse.label.official@gmail.com</p>
    </div>
  );
}
