/**
 * ProjectTargetArtist — WP-009
 * =====================================================================
 * Relazione molti-a-molti tra Project e Artist.
 *
 * Una riga per (user_id, project_id, artist_id). Rappresenta gli artisti
 * "target" che l'utente ha selezionato per un dato Project — ovvero i DJ
 * o producer a cui intende sottoporre promo / DM per quel project.
 *
 * 🔒 Vincoli (WP-009):
 * - NON modifica il Lifecycle Engine.
 * - NON modifica Label Finder.
 * - NON modifica il comportamento di Artist Explorer fuori dal Project.
 * - NON modifica la UI (nessun pulsante "Add" in questo task).
 * - Struttura minimale: (id, project_id, artist_id, created_at) + user_id
 *   per RLS. Nessun campo di stato (introdotto in task successivi).
 *
 * pattern (speculare a ProjectTargetLabel — WP-006):
 * - `id`: TEXT PRIMARY KEY, generato client (es. `pta_<base36>`).
 * - `userId`: UUID Supabase dell'utente proprietario (per RLS).
 *   Opzionale lato client; impostato server-side dall'API.
 * - `projectId`: riferimento al Project (TEXT). Nessuna FK constraint
 *   nel DB per evitare accoppiamento stretto (vedi migration).
 * - `artistId`: riferimento all'Artist (TEXT). Gli Artist vivono in
 *   IndexedDB lato client + Beatport scraper; non c'è tabella `artists`
 *   dedicata a cui collegarsi. L'`artistId` può essere:
 *   - "bp_<id>" per artisti Beatport
 *   - "custom_<id>" per artisti custom (artist_custom_data)
 * - `createdAt`: ISO 8601 string.
 * =====================================================================
 */

/**
 * Rappresentazione client-side di una Project Target Artist.
 */
export interface ProjectTargetArtist {
  id: string;
  userId?: string;
  projectId: string;
  artistId: string;
  createdAt: string;
}

/**
 * Rappresentazione "riga DB" (snake_case, come ritornato dalle API /
 * dalla tabella Supabase `project_target_artists`).
 */
export interface ProjectTargetArtistRow {
  id: string;
  user_id?: string;
  project_id: string;
  artist_id: string;
  created_at: string;
}

/**
 * Payload di input per la creazione.
 *
 * `project_id` e `artist_id` sono obbligatori. L'API genera `id` e
 * `created_at` se mancanti.
 */
export interface ProjectTargetArtistInput {
  id?: string;
  project_id: string;
  artist_id: string;
}

/**
 * Payload di aggiornamento (PATCH).
 *
 * In WP-009 i campi effettivamente mutabili sono pochi: tipicamente
 * solo `artist_id` (cambio target). `project_id` è immutabile dopo la
 * creazione (cambiare project equivale a eliminare + ricreare).
 * Per future-proofing manteniamo il tipo generico; la API filtra
 * esplicitamente i campi mutabili.
 */
export interface ProjectTargetArtistUpdate {
  artist_id?: string;
}

/**
 * Converte una riga DB (snake_case) in un oggetto `ProjectTargetArtist`
 * (camelCase).
 *
 * Usato dallo store dopo il load dal cloud per normalizzare i dati.
 */
export function rowToProjectTargetArtist(
  row: ProjectTargetArtistRow,
): ProjectTargetArtist {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    artistId: row.artist_id,
    createdAt: row.created_at,
  };
}
