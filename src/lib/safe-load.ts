/**
 * Safe Load Utilities — Non-destructive data merging
 * =====================================================================
 * Garantisce che nessun caricamento dal cloud possa cancellare dati
 * precedentemente salvati dall'utente.
 *
 * Principi:
 * 1. UNION by id, mai REPLACE di interi array
 * 2. I dati locali non salvati nel cloud sopravvivono
 * 3. I dati cloud sovrascrivono i locali SOLO per campi Beatport
 *    (mai per campi personali dell'utente)
 * 4. Se il cloud ritorna vuoto, i dati locali restano intatti
 * =====================================================================
 */

/**
 * Union by id: mantiene tutti gli elementi locali e cloud.
 * Se un elemento esiste in entrambi, cloud vince (per i campi che ha).
 * Gli elementi solo-locali sopravvivono.
 */
export function unionById<T extends { id: string }>(
  local: T[] | null | undefined,
  cloud: T[] | null | undefined,
): T[] {
  const a = Array.isArray(local) ? local : [];
  const b = Array.isArray(cloud) ? cloud : [];
  const map = new Map<string, T>();
  // Local first (preserves local-only items)
  for (const item of a) {
    if (item?.id) map.set(item.id, item);
  }
  // Cloud overrides matching items, but local-only items survive
  for (const item of b) {
    if (item?.id) {
      const existing = map.get(item.id);
      map.set(item.id, existing ? { ...existing, ...item } : item);
    }
  }
  return Array.from(map.values());
}

/**
 * Merge ranking snapshots by id (then by timestamp+source as fallback).
 * Non distrugge mai gli snapshot esistenti.
 */
export function mergeRankingSnapshots<T extends { id?: string; timestamp?: string; source?: string }>(
  local: T[] | null | undefined,
  cloud: T[] | null | undefined,
): T[] {
  const a = Array.isArray(local) ? local : [];
  const b = Array.isArray(cloud) ? cloud : [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const s of [...a, ...b]) {
    if (!s || typeof s !== "object") continue;
    const key = s.id || `${s.timestamp}|${s.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  out.sort(
    (x, y) =>
      new Date(x.timestamp || 0).getTime() - new Date(y.timestamp || 0).getTime()
  );
  return out;
}

/**
 * UPSERT label personal data without resetting existing fields.
 *
 * Instead of the current "reset all to defaults, then reapply from API"
 * pattern, this function:
 * 1. Takes the current labels array (with all personal fields intact)
 * 2. For each API row, UPSERTS only the fields that are present in the API
 * 3. Does NOT reset any field to default — if API doesn't return emails,
 *    the local emails survive
 */
export function upsertLabelPersonalData<
  L extends {
    id: string;
    emails?: string[];
    notes?: string;
    status?: string;
    website?: string;
    demoLink?: string;
    socialLink?: string;
    soundcloudLink?: string;
    beatportLink?: string;
    contactInfo?: string;
    customLinks?: { type: string; value: string }[];
    isCustom?: boolean;
    isFavorite?: boolean;
    name?: string;
  },
  A extends {
    label_id: string;
    emails?: string[];
    notes?: string;
    status?: string;
    website?: string;
    demo_link?: string;
    social_link?: string;
    soundcloud_link?: string;
    beatport_link?: string;
    contact_info?: string;
    custom_links?: { type: string; value: string }[];
    is_custom?: boolean;
    is_favorite?: boolean;
    custom_name?: string;
  },
>(
  currentLabels: L[],
  apiRows: A[],
): L[] {
  const apiMap = new Map<string, A>();
  for (const row of apiRows) {
    if (row?.label_id) apiMap.set(row.label_id, row);
  }

  return currentLabels.map((label) => {
    const api = apiMap.get(label.id);
    if (!api) return label; // No API data for this label — preserve local

    // UPSERT: only override fields that are actually present in the API row
    return {
      ...label,
      ...(api.emails !== undefined ? { emails: api.emails } : {}),
      ...(api.notes !== undefined ? { notes: api.notes } : {}),
      ...(api.status !== undefined ? { status: api.status } : {}),
      ...(api.website !== undefined ? { website: api.website } : {}),
      ...(api.demo_link !== undefined ? { demoLink: api.demo_link } : {}),
      ...(api.social_link !== undefined ? { socialLink: api.social_link } : {}),
      ...(api.soundcloud_link !== undefined ? { soundcloudLink: api.soundcloud_link } : {}),
      ...(api.beatport_link !== undefined ? { beatportLink: api.beatport_link } : {}),
      ...(api.contact_info !== undefined ? { contactInfo: api.contact_info } : {}),
      ...(api.custom_links !== undefined ? { customLinks: api.custom_links } : {}),
      ...(api.is_custom !== undefined ? { isCustom: api.is_custom } : {}),
      ...(api.is_favorite !== undefined ? { isFavorite: api.is_favorite } : {}),
      ...(api.custom_name && api.custom_name.trim() ? { name: api.custom_name } : {}),
    };
  });
}
