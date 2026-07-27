"use client";

/**
 * Project Context — WP-003
 * =====================================================================
 * Livello di contesto React che espone il `Project` corrente a tutti i
 * componenti figli della pagina Overview (`/projects/[id]`).
 *
 * 🔒 Scopo (WP-003):
 * Introdurre ESCLUSIVAMENTE il livello di contesto. Nessun componente
 * consuma ancora `useProject()`. I task successivi (WP-004+) potranno
 * rendere i moduli project-aware leggendo il context invece di ricevere
 * props, senza refactoring dei moduli stessi.
 *
 * 🔒 Vincoli rispettati:
 * - Nessuna modifica ai tipi `Project` (importa il tipo da `@/types/project`).
 * - Nessuna modifica a store, API, database, Lifecycle Engine.
 * - Nessuna modifica a Label Finder, Artist Explorer o altri moduli.
 * - Nessun consumer introdotto in questo task.
 * =====================================================================
 */

import { createContext, useContext, type ReactNode } from "react";
import type { Project } from "@/types/project";

/**
 * Tipo del valore esposto dal context.
 *
 * `Project | null`:
 * - `Project` quando il provider è montato con un project valido.
 * - `null` come default (prima del mount o se il provider non è usato).
 *
 * I consumer dovrebbero gestire esplicitamente il caso `null` anche se,
 * nel flusso attuale, il provider è sempre montato con un project non-null
 * (la pagina Overview mostra già uno stato "Project non trovato" prima
 * di renderizzare il provider).
 */
export type ProjectContextValue = Project | null;

/**
 * Context React. Non esportare direttamente questo oggetto: i consumer
 * devono passare da `useProject()` per avere validazione + error boundary
 * se usato fuori dal Provider.
 */
const ProjectContext = createContext<ProjectContextValue>(null);

/**
 * Props del Provider. Accetta `value` di tipo `Project` (non-null: la
 * pagina chiamante garantisce che il project esista, avendo già gestito
 * il caso not-found con early return).
 */
export interface ProjectProviderProps {
  value: Project;
  children: ReactNode;
}

/**
 * Provider che rende disponibile il `Project` corrente a tutti i
 * componenti figli via React Context.
 *
 * Usage:
 * ```tsx
 * <ProjectProvider value={project}>
 *   <Overview />
 * </ProjectProvider>
 * ```
 *
 * Il provider è intenzionalmente "thin": non fa fetch, non fa logica,
 * non gestisce loading state. Tutto quello avviene a monte, nella pagina
 * Overview. Il provider si limita a pubblicare il valore nel context.
 */
export function ProjectProvider({ value, children }: ProjectProviderProps) {
  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}

/**
 * Hook per consumare il `Project` corrente dal context.
 *
 * Ritorna `null` se chiamato fuori da un `<ProjectProvider>` (default
 * value del context). I consumer dovrebbero gestire questo caso.
 *
 * 🔒 Nessun consumer usa ancora questo hook in WP-003. Verrà consumato
 * dai moduli project-aware nei task successivi (WP-004+).
 *
 * @throws non lancia — ritorna `null` silenziosamente se fuori dal
 *   provider. Questo evita crash nei moduli riutilizzati fuori dalla
 *   pagina Overview (es. Label Finder usato standalone nel tab Labels).
 */
export function useProject(): ProjectContextValue {
  return useContext(ProjectContext);
}
