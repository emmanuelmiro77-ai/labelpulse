/**
 * Project — Phase 2 (Home Dashboard)
 * =====================================================================
 * Estende il modello Phase 1 con due nuovi campi:
 *
 * - `goal`: obiettivo strategico del Project, scelto dall'utente al
 *   momento della creazione tra 4 opzioni fisse (GOALS).
 * - `progress`: intero 0-100 che rappresenta l'avanzamento percettuale.
 *   In Phase 2 è statico (default 0); le fasi successive lo collegheranno
 *   a eventi reali (demo inviati, risposte ricevute, ecc.).
 *
 * Inoltre introduce `computeNextAction()`: mapping STATICO (goal + bucket
 * di progress) → frase d'azione consigliata. Non dipende da alcun modulo
 * esterno: è puramente una funzione pura.
 *
 * 🔒 Phase 2 constraints (inalterate da Phase 1):
 * - Il modello Project NON è collegato a nessun'altra entità esistente.
 * - Nessun riferimento a release_id, demo_id, pitch_id, campaign_id.
 * - Le relazioni verranno introdotte nelle fasi successive.
 * =====================================================================
 */

/**
 * Valori consigliati per `Project.status`.
 *
 * La validazione lato server è permissiva (qualunque stringa non vuota è
 * accettata): questo permette alle fasi successive di aggiungere nuovi
 * stati senza rompere la compatibilità. Il client, tuttavia, dovrebbe
 * attenersi a questo enumerato per coerenza UI.
 */
export const PROJECT_STATUSES = [
  "idea",
  "in_progress",
  "ready",
  "submitted",
  "released",
  "archived",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/**
 * Obiettivi strategici selezionabili dall'utente alla creazione del
 * Project. Sono le 4 opzioni richieste dalla Phase 2 spec:
 *
 * - "Find a label"             → l'utente cerca una label per il suo demo
 * - "Promote a released track" → l'utente ha un brano già rilasciato e
 *                                vuole spingerlo
 * - "Build a DJ campaign"      → l'utente vuole costruire una campagna
 *                                verso DJ target
 * - "Monitor performance"      → l'utente vuole monitorare l'andamento
 *                                di un rilascio esistente
 *
 * L'etichetta è la stringa mostrata all'utente (in inglese per
 * coerenza con la UI Phase 1); il valore è la stessa stringa, salvato
 * tale e quale nel DB. Le fasi successive possono aggiungere nuove
 * opzioni senza rompere la compatibilità (la validazione server è
 * permissiva su `goal` come lo è su `status`).
 */
export const PROJECT_GOALS = [
  "Find a label",
  "Promote a released track",
  "Build a DJ campaign",
  "Monitor performance",
] as const;

export type ProjectGoal = (typeof PROJECT_GOALS)[number];

/**
 * Rappresentazione client-side di un Project.
 *
 * - `id`: identificatore testuale generato client (es. `proj_<base36>`).
 *   Indipendente da Beatport / Supabase id — è una chiave logica.
 * - `userId`: UUID Supabase dell'utente proprietario (per RLS).
 *   Opzionale lato client perché non sempre noto al momento della creazione
 *   locale; viene impostato server-side dall'API.
 * - `goal`: obiettivo strategico (stringa libera; dovrebbe essere uno
 *   dei PROJECT_GOALS ma il server non lo impone).
 * - `progress`: intero 0-100 (default 0). Sempre clampato lato server.
 * - `createdAt` / `updatedAt`: ISO 8601 string.
 */
export interface Project {
  id: string;
  userId?: string;
  title: string;
  artist: string;
  status: string;
  goal: string;
  progress: number;
  sourceUrl: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Rappresentazione "riga DB" di un Project (snake_case, come ritornato
 * dalle API / dalla tabella Supabase `projects`).
 *
 * Usata dal layer api-client per mappare 1:1 la risposta del server.
 */
export interface ProjectRow {
  id: string;
  user_id?: string;
  title: string;
  artist: string;
  status: string;
  goal?: string | null;
  progress?: number | null;
  source_url?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Payload di input per la creazione di un Project.
 *
 * Tutti i campi sono opzionali tranne `title` (un Project senza titolo non
 * ha senso). L'API genera id e timestamp se mancanti.
 */
export interface ProjectInput {
  id?: string;
  title: string;
  artist?: string;
  status?: string;
  goal?: string;
  progress?: number;
  source_url?: string;
}

/**
 * Payload di aggiornamento (PATCH). Nessun campo è obbligatorio: la
 * PATCH applica solo i campi presenti. `id`, `user_id`, `created_at`
 * sono ignorati se presenti (immutabili).
 */
export interface ProjectUpdate {
  title?: string;
  artist?: string;
  status?: string;
  goal?: string;
  progress?: number;
  source_url?: string;
}

/**
 * Converte una riga DB (snake_case) in un oggetto `Project` (camelCase).
 *
 * Usato dallo store dopo `loadProjects()` per normalizzare i dati
 * provenienti dal cloud. Esegue clamp + default sui nuovi campi
 * `goal` / `progress` per gestire righe pre-Phase-2 (goal=NULL,
 * progress=NULL) senza rompere la UI.
 */
export function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    artist: row.artist ?? "",
    status: row.status ?? "idea",
    goal: typeof row.goal === "string" ? row.goal : "",
    progress:
      typeof row.progress === "number" && Number.isFinite(row.progress)
        ? Math.max(0, Math.min(100, Math.round(row.progress)))
        : 0,
    sourceUrl: row.source_url ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ==================== NEXT ACTION (static mapping) ====================

/**
 * Bucket di progress: dividono il range 0-100 in 4 quartili per
 * selezionare la frase d'azione più appropriata.
 */
type ProgressBucket = "q1" | "q2" | "q3" | "q4";

function progressBucket(progress: number): ProgressBucket {
  const p = Math.max(0, Math.min(100, Math.round(progress)));
  if (p <= 25) return "q1";
  if (p <= 50) return "q2";
  if (p <= 75) return "q3";
  return "q4";
}

/**
 * Mapping statico (goal × bucket) → frase d'azione consigliata.
 *
 * È intenzionalmente STATICO: nessun lookup su demo / release / pitch /
 * campaign. Le fasi successive potranno sostituirlo con una funzione
 * dinamica basata sullo stato reale dei moduli collegati, ma in Phase 2
 * restiamo su frasi prefissate.
 *
 * Se il `goal` non è uno dei 4 noti (es. project creato prima di Phase 2
 * con goal vuoto), si ritorna un fallback generico.
 */
const NEXT_ACTION_MAP: Record<string, Record<ProgressBucket, string>> = {
  "Find a label": {
    q1: "Define your sound and pick your strongest demo",
    q2: "Identify target labels that match your sound",
    q3: "Prepare your pitch and submission",
    q4: "Submit to labels and track responses",
  },
  "Promote a released track": {
    q1: "Prepare promotional assets (artwork, teasers, press copy)",
    q2: "Build your DJ target list",
    q3: "Send promos and start outreach",
    q4: "Track support and follow up with key DJs",
  },
  "Build a DJ campaign": {
    q1: "Identify key DJs in your genre",
    q2: "Gather verified contact info",
    q3: "Send personalized DMs",
    q4: "Track replies and follow up",
  },
  "Monitor performance": {
    q1: "Set up tracking for your release (charts, streams, support)",
    q2: "Check weekly chart positions",
    q3: "Analyze streaming and engagement data",
    q4: "Compile insights and plan your next release",
  },
};

const NEXT_ACTION_FALLBACK: Record<ProgressBucket, string> = {
  q1: "Define the goal of this project to unlock suggested actions",
  q2: "Continue working on your project",
  q3: "You're past halfway — keep momentum",
  q4: "Wrap up and review results",
};

/**
 * Calcola la "next action" consigliata per un Project.
 *
 * Funzione pura: prende in input i campi necessari e ritorna una stringa.
 * Nessun side effect, nessuna dipendenza da store / API / moduli esterni.
 *
 * @param goal     - Il goal del Project (stringa libera)
 * @param progress - Intero 0-100 (verrà clampato)
 * @returns Frase d'azione consigliata (mai vuota)
 */
export function computeNextAction(goal: string, progress: number): string {
  const bucket = progressBucket(progress);
  const map = NEXT_ACTION_MAP[goal];
  if (map) {
    return map[bucket];
  }
  return NEXT_ACTION_FALLBACK[bucket];
}
