/**
 * Project Progress — WP-008R
 * =====================================================================
 * Modulo DEDICATO e CENTRALIZZATO per il calcolo del progress di un
 * Project. Tutta la logica decisionale sul progress vive qui.
 *
 * 🔒 Vincoli (WP-008R):
 * - NON modifica la UI.
 * - NON modifica il Lifecycle Engine.
 * - NON modifica Label Finder o Artist Explorer.
 * - Tutto il codice che necessita del progress deve utilizzare
 *   `calculateProjectProgress(projectId, state)`.
 *
 * Fasi future (WP-009+) potranno estendere il calcolo considerando
 * altre entità (demos inviati, risposte ricevute, ecc.) — ma sempre
 * passando per questa funzione, mai duplicando la logica.
 * =====================================================================
 */

import type { Project } from "@/types/project";
import type { ProjectTargetLabel } from "@/types/project-target-label";

/**
 * Stato minimo richiesto da `calculateProjectProgress`.
 *
 * Definiamo un'interfaccia strutturale (non nominale) così la funzione
 * accetta qualunque oggetto che abbia `projects` e `projectTargetLabels`
 * — inclusi lo stato Zustand `AppState` e snapshot di test.
 */
export interface ProjectProgressState {
  projects: Project[];
  projectTargetLabels: ProjectTargetLabel[];
}

/**
 * Mappa di calcolo del progress in base al numero di Target Labels.
 *
 * Specifica WP-008R:
 *   0 target      → 0%
 *   1-4 target    → 10%
 *   5-9 target    → 20%
 *   >=10 target   → 30%
 *
 * Funzione PURA: nessun side effect, deterministic, facilmente testabile.
 */
export function progressFromTargetCount(count: number): number {
  if (count <= 0) return 0;
  if (count <= 4) return 10;
  if (count <= 9) return 20;
  return 30;
}

/**
 * Calcola il progress di un Project in base allo stato corrente.
 *
 * 🔒 UNICA fonte di verità per il progress del Project. Tutto il codice
 * che necessita del progress (store, Lifecycle Engine futuro, UI futura)
 * deve passare per questa funzione.
 *
 * @param projectId - ID del Project di cui calcolare il progress
 * @param state     - Stato contenente `projects` e `projectTargetLabels`
 * @returns intero 0-100 (sempre clampato dai valori della mappa)
 *
 * La funzione è PURA: non legge da store globali, non ha side effect.
 * Questo permette di testarla in isolamento passando uno stato fittizio.
 *
 * Nota: se il project non esiste in `state.projects`, ritorna 0 (safe
 * default). Questo può accadere temporaneamente durante un delete
 * concorrente — non è un errore.
 */
export function calculateProjectProgress(
  projectId: string,
  state: ProjectProgressState,
): number {
  // Verifica che il project esista (defensive: se è stato eliminato
  // concorrentemente, ritorniamo 0 invece di lanciare).
  const projectExists = state.projects.some((p) => p.id === projectId);
  if (!projectExists) return 0;

  // Conta le target labels del project.
  const targetCount = state.projectTargetLabels.filter(
    (tl) => tl.projectId === projectId,
  ).length;

  return progressFromTargetCount(targetCount);
}
