/**
 * ProjectTargetLabel — WP-006
 * =====================================================================
 * Relazione molti-a-molti tra Project e Label.
 *
 * Una riga per (user_id, project_id, label_id). Rappresenta le label
 * "target" che l'utente ha selezionato per un dato Project — ovvero le
 * label a cui intende sottoporre demo / pitch per quel project specifico.
 *
 * 🔒 Vincoli (WP-006):
 * - NON modifica il Lifecycle Engine.
 * - NON modifica Label Finder, Artist Explorer o altri moduli esistenti.
 * - NON modifica la UI (nessun pulsante "Add" collegato in questo task).
 * - NON modifica il workflow esistente.
 * - La struttura è isolata: solo (id, project_id, label_id, created_at)
 *   + user_id per RLS. Nessun campo di stato (lo stato della target label
 *   sarà introdotto in task successivi se necessario).
 *
 * pattern:
 * - `id`: TEXT PRIMARY KEY, generato client (es. `ptl_<base36>`).
 * - `userId`: UUID Supabase dell'utente proprietario (per RLS).
 *   Opzionale lato client; impostato server-side dall'API.
 * - `projectId`: FK verso `projects.id` (TEXT). NON c'è FK constraint
 *   nel DB per evitare accoppiamento stretto (il Project può essere
 *   eliminato e le target labels restano orfane, gestite dalla UI).
 * - `labelId`: riferimento alla Label (TEXT). Le Label sono in app_state
 *   riga global + label_personal_data; non c'è tabella `labels` dedicata,
 *   quindi non c'è FK constraint.
 * - `createdAt`: ISO 8601 string.
 * =====================================================================
 */

/**
 * Rappresentazione client-side di una Project Target Label.
 */
export interface ProjectTargetLabel {
  id: string;
  userId?: string;
  projectId: string;
  labelId: string;
  createdAt: string;
}

/**
 * Rappresentazione "riga DB" (snake_case, come ritornato dalle API /
 * dalla tabella Supabase `project_target_labels`).
 */
export interface ProjectTargetLabelRow {
  id: string;
  user_id?: string;
  project_id: string;
  label_id: string;
  created_at: string;
}

/**
 * Payload di input per la creazione.
 *
 * `project_id` e `label_id` sono obbligatori. L'API genera `id` e
 * `created_at` se mancanti.
 */
export interface ProjectTargetLabelInput {
  id?: string;
  project_id: string;
  label_id: string;
}

/**
 * Payload di aggiornamento (PATCH).
 *
 * In WP-006 i campi effettivamente mutabili sono pochi: tipicamente
 * solo `label_id` (cambio target). `project_id` è immutabile dopo la
 * creazione (cambiare project equivale a eliminare + ricreare).
 * Per future-proofing manteniamo il tipo generico; la API filtra
 * esplicitamente i campi mutabili.
 */
export interface ProjectTargetLabelUpdate {
  label_id?: string;
}

/**
 * Converte una riga DB (snake_case) in un oggetto `ProjectTargetLabel`
 * (camelCase).
 *
 * Usato dallo store dopo il load dal cloud per normalizzare i dati.
 */
export function rowToProjectTargetLabel(
  row: ProjectTargetLabelRow,
): ProjectTargetLabel {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    labelId: row.label_id,
    createdAt: row.created_at,
  };
}
