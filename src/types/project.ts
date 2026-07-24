/**
 * Project — Phase 1 Foundation
 * =====================================================================
 * Nuova entità "Project", isolata da Demo / Release / Promotion / Pitch.
 *
 * IMPORTANTE (Phase 1):
 * - Il modello Project NON è collegato a nessun'altra entità esistente.
 * - I campi sono volutamente minimici: title, artist, status, source_url.
 * - Nessun riferimento a release_id, demo_id, pitch_id, campaign_id.
 * - Le relazioni verranno introdotte nelle fasi successive.
 *
 * Lo status è una stringa libera (con un set di valori consigliati) per
 * permettere evoluzione futura senza migration del tipo TypeScript.
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
 * Rappresentazione client-side di un Project.
 *
 * - `id`: identificatore testuale generato client (es. `proj_<base36>`).
 *   Indipendente da Beatport / Supabase id — è una chiave logica.
 * - `userId`: UUID Supabase dell'utente proprietario (per RLS).
 *   Opzionale lato client perché non sempre noto al momento della creazione
 *   locale; viene impostato server-side dall'API.
 * - `createdAt` / `updatedAt`: ISO 8601 string.
 */
export interface Project {
  id: string;
  userId?: string;
  title: string;
  artist: string;
  status: string;
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
  source_url?: string;
}

/**
 * Converte una riga DB (snake_case) in un oggetto `Project` (camelCase).
 *
 * Usato dallo store dopo `loadProjects()` per normalizzare i dati
 * provenienti dal cloud.
 */
export function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    artist: row.artist ?? "",
    status: row.status ?? "idea",
    sourceUrl: row.source_url ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
