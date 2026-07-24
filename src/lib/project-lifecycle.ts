/**
 * Project Lifecycle Engine
 * =====================================================================
 * UNICA fonte di verità per le decisioni relative ai Project.
 *
 * 🔒 Constraints (Lifecycle Engine Foundation):
 * - NON legge Demo, Release, Promotion, Pitch o qualsiasi altra entità.
 * - Usa ESCLUSIVAMENTE i campi già presenti nel `Project`:
 *     status, goal, progress, sourceUrl, createdAt, updatedAt, title, artist.
 * - Tutta la logica decisionale è centralizzata qui.
 * - La UI deve limitarsi a visualizzare i risultati: nessun calcolo
 *   decisionale inline nei componenti.
 *
 * Esporta 6 funzioni pure:
 *   - computeStage(project)           → ProjectStage
 *   - computeHealth(project)          → ProjectHealth
 *   - computeBlockingIssues(project)  → BlockingIssue[]
 *   - computeNextAction(project)      → NextAction
 *   - getAvailableGoals(stage)        → ProjectGoal[]
 *   - getVisibleWorkspace(stage, goal) → VisibleWorkspace
 *
 * Tutte sono funzioni pure: nessun side effect, nessuna dipendenza da
 * store / API / moduli esterni. Facilmente testabili.
 * =====================================================================
 */

import type { Project } from "@/types/project";

// ==================== TIPI ====================

/**
 * Stage del ciclo di vita di un Project.
 *
 * È DERIVATO (non persistito): viene calcolato da `computeStage()` a
 * partire dai campi del Project. Il mapping è:
 *
 *   status="idea"        + progress 0       → "intake"
 *   status="idea"        + progress > 0     → "intake"
 *   status="in_progress" + progress < 50    → "planning"
 *   status="in_progress" + progress >= 50   → "execution"
 *   status="ready"                           → "ready"
 *   status="submitted"                       → "tracking"
 *   status="released"                        → "post_release"
 *   status="archived"                        → "closed"
 *   qualunque altro status                   → "intake" (fallback sicuro)
 *
 * Gli stage sono ordinati logicamente dal meno avanzato al più avanzato.
 */
export const PROJECT_STAGES = [
  "intake",
  "planning",
  "execution",
  "ready",
  "tracking",
  "post_release",
  "closed",
] as const;

export type ProjectStage = (typeof PROJECT_STAGES)[number];

/**
 * Obiettivo strategico del Project.
 *
 * Re-export dei 4 goal definiti in @/types/project per avere un unico
 * punto di import per la UI. Il Lifecycle Engine non impone nuovi goal:
 * usa quelli già definiti.
 */
export type ProjectGoal =
  | "Find a label"
  | "Promote a released track"
  | "Build a DJ campaign"
  | "Monitor performance"
  | ""; // goal non impostato (project pre-Phase 2)

/**
 * Health del Project: indicatore sintetico dello stato di salute.
 *
 * - "on_track"     → tutto bene, nessun blocco, progress coerente
 * - "at_risk"      → ci sono blocking issues non critiche
 * - "blocked"      → c'è almeno una blocking issue critica
 * - "stale"        → nessun aggiornamento da > 30 giorni
 * - "not_started"  → progress=0 e status="idea" (ancora nulla da valutare)
 */
export const PROJECT_HEALTHS = [
  "not_started",
  "on_track",
  "at_risk",
  "blocked",
  "stale",
] as const;

export type ProjectHealth = (typeof PROJECT_HEALTHS)[number];

/**
 * Una singola blocking issue rilevata dal Lifecycle Engine.
 *
 * - `id`: identificatore stabile (usato dalla UI come React key e per
 *   eventuali dismiss futuribili).
 * - `severity`: "critical" blocca il progresso; "warning" rallenta.
 * - `message`: frase human-readable che spiega il problema.
 * - `field`: (opzionale) campo del Project correlato, per eventuale
 *   quick-fix UI futuro.
 */
export interface BlockingIssue {
  id: string;
  severity: "critical" | "warning";
  message: string;
  field?: keyof Project;
}

/**
 * Next action consigliata dal Lifecycle Engine.
 *
 * Strutturata (non solo una stringa) per permettere alla UI di
 * visualizzare label + descrizione + hint di azione.
 *
 * - `label`: frase breve (1 riga) — es. "Set your project goal"
 * - `description`: contesto più ampio (1-2 righe)
 * - `kind`: categoria per eventuale routing futuro (non usato in UI ora)
 */
export interface NextAction {
  label: string;
  description: string;
  kind:
    | "configure"
    | "prepare"
    | "submit"
    | "track"
    | "review"
    | "complete"
    | "archive";
}

/**
 * Descrive quali "workspace" (sezioni/moduli) sono visibili per un dato
 * stage + goal. In questa fase i workspace sono nomi logici (nessun
 * collegamento a moduli reali); serviranno nelle fasi successive per
 * decidere cosa mostrare nella pagina Overview.
 *
 * - `sections`: elenco ordinato di sezioni visibili (es. "submissions",
 *   "targets", "performance"). Stringhe libere — la UI attuale non le
 *   usa ancora, ma l'engine le espone per future integrazioni.
 * - `primary`: la sezione principale (prima visibile in alto).
 */
export interface VisibleWorkspace {
  sections: string[];
  primary: string | null;
}

// ==================== HELPERS INTERNI ====================

const STALE_THRESHOLD_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Clamp helper per progress. Garantisce intero 0-100 anche se il campo
 * è undefined/NaN (difensivo: il server già clampa, ma l'engine deve
 * essere robusto a input sporchi per essere una fonte di verità).
 */
function clampProgress(progress: unknown): number {
  if (typeof progress === "number" && Number.isFinite(progress)) {
    return Math.max(0, Math.min(100, Math.round(progress)));
  }
  return 0;
}

/**
 * Giorni trascorsi dall'ultimo aggiornamento. Ritorna +∞ se la data non
 * è valida o mancante (trattato come "molto stale").
 */
function daysSinceUpdated(updatedAt: string | undefined | null): number {
  if (!updatedAt) return Number.POSITIVE_INFINITY;
  const t = new Date(updatedAt).getTime();
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  const diff = Date.now() - t;
  return Math.floor(diff / MS_PER_DAY);
}

/**
 * Verifica se un `goal` è uno dei 4 goal noti (non vuoto).
 */
function isKnownGoal(goal: string): goal is ProjectGoal {
  return (
    goal === "Find a label" ||
    goal === "Promote a released track" ||
    goal === "Build a DJ campaign" ||
    goal === "Monitor performance"
  );
}

// ==================== FUNZIONI PURE (API PUBBLICA) ====================

/**
 * computeStage(project) → ProjectStage
 *
 * Deriva lo stage dallo `status` + `progress`. Vedi docstring di
 * `ProjectStage` per il mapping completo.
 *
 * Funzione pura: nessun side effect, deterministic.
 */
export function computeStage(project: Project): ProjectStage {
  const progress = clampProgress(project.progress);
  const status = typeof project.status === "string" ? project.status : "";

  switch (status) {
    case "archived":
      return "closed";
    case "released":
      return "post_release";
    case "submitted":
      return "tracking";
    case "ready":
      return "ready";
    case "in_progress":
      return progress >= 50 ? "execution" : "planning";
    case "idea":
    default:
      // Fallback sicuro per status non riconosciuti.
      return "intake";
  }
}

/**
 * computeBlockingIssues(project) → BlockingIssue[]
 *
 * Rileva problemi che bloccano o rallentano il Project. Usa solo i
 * campi del Project (nessuna lettura di entità esterne).
 *
 * Regole (in ordine di priorità — la UI mostra nell'ordine ritornato):
 *
 * 1. GOAL non impostato (critical) — senza goal non possiamo consigliare
 *    next action né workspace.
 * 2. ARTIST vuoto (warning) — necessario per qualunque outreach.
 * 3. SOURCE URL vuoto quando il goal implica un asset (warning)
 *    - "Promote a released track" e "Monitor performance" richiedono
 *      un riferimento al brano/rilascio.
 * 4. PROGRESS = 0 in stage avanzato (warning)
 *    - Se lo stage è "execution" o successivo e progress=0, qualcosa
 *      non quadra: l'utente ha messo lo status avanti ma non ha fatto
 *      nulla di concreto.
 * 5. STALE: nessun aggiornamento da > 30 giorni (warning)
 *
 * Ritorna array vuoto se non ci sono problemi.
 */
export function computeBlockingIssues(project: Project): BlockingIssue[] {
  const issues: BlockingIssue[] = [];
  const stage = computeStage(project);
  const progress = clampProgress(project.progress);
  const goal = typeof project.goal === "string" ? project.goal : "";

  // 1. Goal mancante
  if (!isKnownGoal(goal)) {
    issues.push({
      id: "missing_goal",
      severity: "critical",
      message:
        "Set a goal to unlock tailored next actions and workspace sections.",
      field: "goal",
    });
  }

  // 2. Artista mancante
  if (!project.artist || project.artist.trim() === "") {
    issues.push({
      id: "missing_artist",
      severity: "warning",
      message:
        "Artist name is empty — required for outreach and pitch personalization.",
      field: "artist",
    });
  }

  // 3. Source URL mancante per goal che implicano un asset esistente
  const needsSourceUrl =
    goal === "Promote a released track" || goal === "Monitor performance";
  if (needsSourceUrl && (!project.sourceUrl || project.sourceUrl.trim() === "")) {
    issues.push({
      id: "missing_source_url",
      severity: "warning",
      message: `Source URL is empty — the goal "${goal}" needs a reference to the released track.`,
      field: "sourceUrl",
    });
  }

  // 4. Progress incoerente con lo stage
  const advancedStages: ProjectStage[] = [
    "execution",
    "ready",
    "tracking",
    "post_release",
  ];
  if (advancedStages.includes(stage) && progress === 0) {
    issues.push({
      id: "progress_zero_in_advanced_stage",
      severity: "warning",
      message: `Progress is 0% but stage is "${stage}". Update progress to reflect actual work done.`,
      field: "progress",
    });
  }

  // 5. Stale
  const daysSinceUpdate = daysSinceUpdated(project.updatedAt);
  if (
    Number.isFinite(daysSinceUpdate) &&
    daysSinceUpdate > STALE_THRESHOLD_DAYS
  ) {
    issues.push({
      id: "stale_project",
      severity: "warning",
      message: `No updates in ${daysSinceUpdate} days. Consider archiving or reactivating this project.`,
      field: "updatedAt",
    });
  }

  return issues;
}

/**
 * computeHealth(project) → ProjectHealth
 *
 * Sintetizza lo stato di salute combinando stage + blocking issues +
 * staleness. Regole (in ordine di priorità):
 *
 * 1. "not_started" — status="idea" AND progress=0 AND nessun update recente
 *    (entro 7 giorni). Un project appena creato senza attività.
 * 2. "blocked"    — almeno una blocking issue critical.
 * 3. "stale"      — no update da > 30 giorni (e non not_started).
 * 4. "at_risk"    — almeno una blocking issue warning.
 * 5. "on_track"   — nessun problema.
 */
export function computeHealth(project: Project): ProjectHealth {
  const progress = clampProgress(project.progress);
  const status = typeof project.status === "string" ? project.status : "";
  const issues = computeBlockingIssues(project);
  const daysSinceUpdate = daysSinceUpdated(project.updatedAt);

  // 1. Not started: idea + progress 0 + recente (≤ 7 gg) o senza update
  if (
    status === "idea" &&
    progress === 0 &&
    (Number.isFinite(daysSinceUpdate) ? daysSinceUpdate <= 7 : true)
  ) {
    return "not_started";
  }

  // 2. Blocked: almeno una critical
  if (issues.some((i) => i.severity === "critical")) {
    return "blocked";
  }

  // 3. Stale
  if (
    Number.isFinite(daysSinceUpdate) &&
    daysSinceUpdate > STALE_THRESHOLD_DAYS
  ) {
    return "stale";
  }

  // 4. At risk: almeno una warning
  if (issues.some((i) => i.severity === "warning")) {
    return "at_risk";
  }

  // 5. On track
  return "on_track";
}

/**
 * computeNextAction(project) → NextAction
 *
 * Sceglie la prossima azione consigliata combinando stage + goal +
 * blocking issues. La logica è centralizzata qui: la UI non deve
 * replicare nessun calcolo.
 *
 * Priorità (la prima regola che matcha vince):
 *
 * 1. Se c'è una blocking issue critical → risolverla.
 * 2. Se lo stage è "closed" → azione "review" (archiviazione definitiva).
 * 3. Se lo stage è "post_release" → "track" le performance.
 * 4. Se lo stage è "tracking" → follow-up sulle submission.
 * 5. Se lo stage è "ready" → "submit".
 * 6. Se lo stage è "execution" o "planning" → dipende dal goal.
 * 7. Se lo stage è "intake" → configura il project (goal/artist).
 *
 * Se il goal non è uno dei 4 noti, l'action è generica ("configure").
 */
export function computeNextAction(project: Project): NextAction {
  const stage = computeStage(project);
  const issues = computeBlockingIssues(project);
  const goal = typeof project.goal === "string" ? project.goal : "";

  // 1. Risolvi prima le critical
  const critical = issues.find((i) => i.severity === "critical");
  if (critical) {
    if (critical.id === "missing_goal") {
      return {
        label: "Set your project goal",
        description:
          "Choose one of the four goals to unlock tailored actions and workspace sections.",
        kind: "configure",
      };
    }
    return {
      label: "Resolve blocking issue",
      description: critical.message,
      kind: "configure",
    };
  }

  // 2. Closed
  if (stage === "closed") {
    return {
      label: "Review archived project",
      description:
        "This project is closed. Review outcomes and lessons learned before starting a new one.",
      kind: "review",
    };
  }

  // 3. Post-release
  if (stage === "post_release") {
    if (goal === "Monitor performance") {
      return {
        label: "Compile performance insights",
        description:
          "Analyze chart positions, streaming data and DJ support. Plan your next release based on what worked.",
        kind: "track",
      };
    }
    return {
      label: "Track post-release performance",
      description:
        "Monitor chart positions, streaming numbers and DJ support for this release.",
      kind: "track",
    };
  }

  // 4. Tracking (submitted)
  if (stage === "tracking") {
    return {
      label: "Follow up on submissions",
      description:
        "Check responses from labels/DJs. Send polite follow-ups where appropriate.",
      kind: "track",
    };
  }

  // 5. Ready
  if (stage === "ready") {
    return {
      label: "Submit your work",
      description:
        "Your project is ready. Send submissions to your target list and track responses.",
      kind: "submit",
    };
  }

  // 6. Execution / Planning: dipende dal goal
  if (stage === "execution" || stage === "planning") {
    switch (goal) {
      case "Find a label":
        if (stage === "planning") {
          return {
            label: "Identify target labels",
            description:
              "Build a shortlist of labels that match your sound. Prioritize those open to demos.",
            kind: "prepare",
          };
        }
        return {
          label: "Prepare your pitch",
          description:
            "Craft a personalized pitch for each target label. Highlight your strongest demo.",
          kind: "prepare",
        };
      case "Promote a released track":
        if (stage === "planning") {
          return {
            label: "Build your DJ target list",
            description:
              "Identify key DJs in your genre. Gather verified contact info.",
            kind: "prepare",
          };
        }
        return {
          label: "Send promos to DJs",
          description:
            "Send personalized promos and start outreach to your DJ target list.",
          kind: "submit",
        };
      case "Build a DJ campaign":
        if (stage === "planning") {
          return {
            label: "Gather verified contact info",
            description:
              "Collect Instagram, email and DM handles for each target DJ.",
            kind: "prepare",
          };
        }
        return {
          label: "Send personalized DMs",
          description:
            "Reach out to DJs with personalized messages. Track replies and follow up.",
          kind: "submit",
        };
      case "Monitor performance":
        return {
          label: "Check weekly chart positions",
          description:
            "Monitor chart positions and streaming data weekly. Flag any anomalies.",
          kind: "track",
        };
      default:
        // Goal non riconosciuto: action generica
        return {
          label: "Continue working on your project",
          description:
            "Update progress as you complete tasks. Set a goal to unlock tailored guidance.",
          kind: "configure",
        };
    }
  }

  // 7. Intake (default)
  if (!isKnownGoal(goal)) {
    return {
      label: "Configure your project",
      description:
        "Set a goal and add basic info (artist, source URL) to get started.",
      kind: "configure",
    };
  }
  return {
    label: "Start working on your project",
    description:
      "Define your first tasks based on the goal you selected. Update progress as you go.",
    kind: "prepare",
  };
}

/**
 * getAvailableGoals(stage) → ProjectGoal[]
 *
 * Ritorna i goal sensati per un dato stage. Alcuni goal non hanno senso
 * in stage avanzati (es. "Find a label" in "post_release") e viceversa.
 *
 * Mappa:
 *
 *   intake / planning / execution / ready → tutti i 4 goal (l'utente
 *   può ancora cambiare idea).
 *
 *   tracking → tutti tranne "Find a label" (le submission sono già
 *   partite).
 *
 *   post_release → "Promote a released track", "Build a DJ campaign",
 *   "Monitor performance".
 *
 *   closed → nessun goal (il project è archiviato).
 *
 * Nota: l'engine non impone questa lista — è una guida. La UI può
 * usarla per disabilitare opzioni non rilevanti.
 */
export function getAvailableGoals(stage: ProjectStage): ProjectGoal[] {
  const ALL: ProjectGoal[] = [
    "Find a label",
    "Promote a released track",
    "Build a DJ campaign",
    "Monitor performance",
  ];

  switch (stage) {
    case "closed":
      return [];
    case "post_release":
      return [
        "Promote a released track",
        "Build a DJ campaign",
        "Monitor performance",
      ];
    case "tracking":
      return [
        "Promote a released track",
        "Build a DJ campaign",
        "Monitor performance",
      ];
    default:
      return ALL;
  }
}

/**
 * getVisibleWorkspace(stage, goal) → VisibleWorkspace
 *
 * Determina quali sezioni del workspace sono visibili per un dato
 * stage + goal. In questa fase restituisce nomi logici (nessun
 * collegamento a moduli reali): serviranno nelle fasi successive per
 * decidere cosa mostrare nella pagina Overview.
 *
 * Regole:
 *
 * - "closed" → solo "summary" (vista archivio).
 * - "intake" → solo "setup" (configurazione iniziale).
 * - "planning" / "execution" → "setup" + goal-specific sections.
 * - "ready" → "submissions" + "targets".
 * - "tracking" → "submissions" + "responses".
 * - "post_release" → "performance" + goal-specific.
 *
 * `primary` è la prima sezione dell'array, o null se l'array è vuoto.
 */
export function getVisibleWorkspace(
  stage: ProjectStage,
  goal: ProjectGoal,
): VisibleWorkspace {
  switch (stage) {
    case "closed":
      return { sections: ["summary"], primary: "summary" };
    case "intake":
      return { sections: ["setup"], primary: "setup" };
    case "planning":
    case "execution": {
      const sections: string[] = ["setup"];
      switch (goal) {
        case "Find a label":
          sections.push("targets", "pitch_draft");
          break;
        case "Promote a released track":
        case "Build a DJ campaign":
          sections.push("targets", "outreach");
          break;
        case "Monitor performance":
          sections.push("performance");
          break;
        default:
          // goal non impostato: solo setup
          break;
      }
      return { sections, primary: sections[0] };
    }
    case "ready":
      return { sections: ["submissions", "targets"], primary: "submissions" };
    case "tracking":
      return { sections: ["submissions", "responses"], primary: "responses" };
    case "post_release": {
      const sections: string[] = ["performance"];
      if (goal === "Build a DJ campaign" || goal === "Promote a released track") {
        sections.push("outreach");
      }
      return { sections, primary: sections[0] };
    }
    default:
      return { sections: ["setup"], primary: "setup" };
  }
}

// ==================== METADATI UI (helper opzionali) ====================
//
// Questi helper non sono "decisionali" — forniscono solo metadati di
// presentazione (label, colori) che la UI può usare per renderizzare
// in modo coerente. La logica decisionale resta nelle 6 funzioni sopra.

export const STAGE_LABELS: Record<ProjectStage, string> = {
  intake: "Intake",
  planning: "Planning",
  execution: "Execution",
  ready: "Ready",
  tracking: "Tracking",
  post_release: "Post-release",
  closed: "Closed",
};

export const HEALTH_LABELS: Record<ProjectHealth, string> = {
  not_started: "Not started",
  on_track: "On track",
  at_risk: "At risk",
  blocked: "Blocked",
  stale: "Stale",
};

export const HEALTH_STYLES: Record<ProjectHealth, string> = {
  not_started: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  on_track: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  at_risk: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  blocked: "bg-red-500/15 text-red-300 border-red-500/30",
  stale: "bg-purple-500/15 text-purple-300 border-purple-500/30",
};

export const STAGE_STYLES: Record<ProjectStage, string> = {
  intake: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  planning: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  execution: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  ready: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  tracking: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  post_release: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  closed: "bg-zinc-600/15 text-zinc-400 border-zinc-600/30",
};
