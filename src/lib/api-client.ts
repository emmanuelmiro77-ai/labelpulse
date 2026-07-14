/**
 * 🔒 API client per le tabelle dedicate (demo_submissions, label_personal_data,
 * pitch_campaigns, user_profiles, user_releases).
 *
 * Tutte le scritture (create/update/delete) passano da `writeDirect()`.
 * Se il salvataggio fallisce, l'errore viene propagato al chiamante.
 * Nessuna coda offline, nessun retry automatico.
 *
 * Le funzioni GET restano letture normali: se falliscono, chi chiama
 * (loadFromNewTables) semplicemente non aggiorna quel pezzo di stato e
 * riprova al giro successivo.
 */

const API_BASE = "";

/**
 * 🔒 writeDirect — fetch diretta senza coda outbox.
 *
 * Esegue la chiamata API immediatamente. Se fallisce, propaga l'errore
 * al chiamante (nessun retry, nessuna coda, nessun salvataggio locale).
 * L'errore deve essere gestito esplicitamente dal chiamante.
 *
 * Ritorna la risposta JSON se ok, altrimenti lancia un Error.
 *
 * 🔒 FASE 6A: opzione `keepalive` per flush su unload (pagehide/beforeunload).
 * Quando true, fetch usa { keepalive: true } per garantire che la request
 * completi anche se la tab viene chiusa. Limite: 64KB body.
 */
export async function writeDirect<T = any>(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: any,
  options?: { keepalive?: boolean },
): Promise<T> {
  const bodyWithTimestamp = body !== undefined
    ? { ...body, local_updated_at: new Date().toISOString() }
    : undefined;

  const res = await fetch(url, {
    method,
    headers: bodyWithTimestamp !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: bodyWithTimestamp !== undefined ? JSON.stringify(bodyWithTimestamp) : undefined,
    keepalive: options?.keepalive === true,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const err = new Error(errData?.error || `HTTP ${res.status}`) as any;
    err.status = res.status;
    err.body = errData;
    throw err;
  }

  return res.json();
}

export interface DemoRow {
  id: string;
  label_id: string;
  label_name?: string;
  track_name: string;
  artist_name?: string;
  link?: string;
  status?: string;
  sent_date?: string;
  pitch_text?: string;
  pitch_subject?: string;
  pitch_tracks?: any[];
  notes?: string;
  parent_release_id?: string;
}

export interface LabelDataRow {
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
  custom_genre?: string;
}

export interface PitchRow {
  id: string;
  label_id?: string;
  label_name?: string;
  demo_id?: string;
  subject?: string;
  body?: string;
  pitch_tracks?: any[];
  ep_link_mode?: string;
  ep_soundcloud_url?: string;
  status?: "draft" | "sent";
  sent_at?: string;
  sent_method?: string;
}

export interface ProfileRow {
  artist_name?: string;
  bio?: string;
  photo_url?: string;
  sc_link?: string;
  links?: { type: string; value: string }[];
  cyanite_api_token?: string;
  locale?: string;
}

// ==================== DEMOS ====================

export async function apiCreateDemo(demo: DemoRow): Promise<boolean> {
  try {
    await writeDirect(`${API_BASE}/api/demos`, "POST", demo);
    return true;
  } catch (err) {
    console.error("[apiCreateDemo] failed:", err);
    return false;
  }
}

export async function apiUpdateDemo(id: string, updates: Partial<DemoRow>): Promise<boolean> {
  try {
    await writeDirect(`${API_BASE}/api/demos?id=${encodeURIComponent(id)}`, "PATCH", updates);
    return true;
  } catch (err) {
    console.error("[apiUpdateDemo] failed:", err);
    return false;
  }
}

export async function apiDeleteDemo(id: string): Promise<boolean> {
  try {
    await writeDirect(`${API_BASE}/api/demos?id=${encodeURIComponent(id)}`, "DELETE");
    return true;
  } catch (err) {
    console.error("[apiDeleteDemo] failed:", err);
    return false;
  }
}

export async function apiFetchAllDemos(): Promise<DemoRow[] | null> {
  try {
    const res = await fetch(`${API_BASE}/api/demos`);
    if (!res.ok) {
      console.error("[apiFetchAllDemos] failed:", res.status);
      return null;
    }
    const data = await res.json();
    return data.demos || [];
  } catch (err) {
    console.error("[apiFetchAllDemos] network error:", err);
    return null;
  }
}

// ==================== LABEL DATA ====================

export async function apiUpsertLabelData(labelData: LabelDataRow): Promise<boolean> {
  try {
    await writeDirect(`${API_BASE}/api/label-data`, "POST", labelData);
    return true;
  } catch (err) {
    console.error("[apiUpsertLabelData] failed:", err);
    return false;
  }
}

export async function apiDeleteLabelData(labelId: string): Promise<boolean> {
  try {
    await writeDirect(`${API_BASE}/api/label-data?label_id=${encodeURIComponent(labelId)}`, "DELETE");
    return true;
  } catch (err) {
    console.error("[apiDeleteLabelData] failed:", err);
    return false;
  }
}

export async function apiFetchAllLabelData(): Promise<LabelDataRow[] | null> {
  try {
    const res = await fetch(`${API_BASE}/api/label-data`);
    if (!res.ok) {
      console.error("[apiFetchAllLabelData] failed:", res.status);
      return null;
    }
    const data = await res.json();
    return data.labels || [];
  } catch (err) {
    console.error("[apiFetchAllLabelData] network error:", err);
    return null;
  }
}

// ==================== PITCHES ====================

export async function apiCreatePitch(pitch: PitchRow): Promise<boolean> {
  try {
    await writeDirect(`${API_BASE}/api/pitches`, "POST", pitch);
    return true;
  } catch (err) {
    console.error("[apiCreatePitch] failed:", err);
    return false;
  }
}

export async function apiUpdatePitch(id: string, updates: Partial<PitchRow>): Promise<boolean> {
  try {
    await writeDirect(`${API_BASE}/api/pitches?id=${encodeURIComponent(id)}`, "PATCH", updates);
    return true;
  } catch (err) {
    console.error("[apiUpdatePitch] failed:", err);
    return false;
  }
}

export async function apiDeletePitch(id: string): Promise<boolean> {
  try {
    await writeDirect(`${API_BASE}/api/pitches?id=${encodeURIComponent(id)}`, "DELETE");
    return true;
  } catch (err) {
    console.error("[apiDeletePitch] failed:", err);
    return false;
  }
}

export async function apiFetchAllPitches(): Promise<PitchRow[] | null> {
  try {
    const res = await fetch(`${API_BASE}/api/pitches`);
    if (!res.ok) {
      console.error("[apiFetchAllPitches] failed:", res.status);
      return null;
    }
    const data = await res.json();
    return data.pitches || [];
  } catch (err) {
    console.error("[apiFetchAllPitches] network error:", err);
    return null;
  }
}

// ==================== PROFILE ====================

export async function apiUpsertProfile(
  profile: ProfileRow,
  options?: { keepalive?: boolean },
): Promise<boolean> {
  try {
    await writeDirect(`${API_BASE}/api/profile`, "POST", profile, options);
    return true;
  } catch (err) {
    console.error("[apiUpsertProfile] failed:", err);
    return false;
  }
}

export async function apiFetchProfile(): Promise<ProfileRow | null> {
  try {
    const res = await fetch(`${API_BASE}/api/profile`);
    if (!res.ok) {
      console.error("[apiFetchProfile] failed:", res.status);
      return null;
    }
    const data = await res.json();
    return data.profile || null;
  } catch (err) {
    console.error("[apiFetchProfile] network error:", err);
    return null;
  }
}

// ==================== RELEASES ====================

export interface ReleaseRow {
  id: string;
  type?: string;
  title: string;
  artists?: string[];
  track_ids?: string[];
  genre?: string;
  notes?: string;
  ep_soundcloud_url?: string;
  // 🔒 RP-007 — Live Release fields
  label?: string;
  beatport_url?: string;
  promo_link?: string;
  spotify_url?: string;
}

export async function apiCreateRelease(release: ReleaseRow): Promise<boolean> {
  try {
    await writeDirect(`${API_BASE}/api/releases`, "POST", release);
    return true;
  } catch (err) {
    console.error("[apiCreateRelease] failed:", err);
    return false;
  }
}

export async function apiUpdateRelease(id: string, updates: Partial<ReleaseRow>): Promise<boolean> {
  try {
    await writeDirect(`${API_BASE}/api/releases?id=${encodeURIComponent(id)}`, "PATCH", updates);
    return true;
  } catch (err) {
    console.error("[apiUpdateRelease] failed:", err);
    return false;
  }
}

export async function apiDeleteRelease(id: string): Promise<boolean> {
  try {
    await writeDirect(`${API_BASE}/api/releases?id=${encodeURIComponent(id)}`, "DELETE");
    return true;
  } catch (err) {
    console.error("[apiDeleteRelease] failed:", err);
    return false;
  }
}

// ==================== PROMOTION TARGETS (RP-005) ====================

export type PromotionStatus = "pending" | "dm_sent" | "waiting" | "replied" | "supported" | "not_interested";

export interface PromotionTargetRow {
  id?: string;
  release_id: string;
  artist_id: string;
  artist_name: string;
  status: PromotionStatus;
  notes?: string | null;
}

export async function apiFetchPromotionTargets(releaseId: string): Promise<PromotionTargetRow[] | null> {
  try {
    const res = await fetch(`${API_BASE}/api/promotion-targets?release_id=${encodeURIComponent(releaseId)}`);
    if (!res.ok) {
      console.error("[apiFetchPromotionTargets] failed:", res.status);
      return null;
    }
    const data = await res.json();
    return data.targets || [];
  } catch (err) {
    console.error("[apiFetchPromotionTargets] failed:", err);
    return null;
  }
}

export async function apiUpsertPromotionTarget(target: PromotionTargetRow): Promise<boolean> {
  try {
    await writeDirect(`${API_BASE}/api/promotion-targets`, "POST", target);
    return true;
  } catch (err) {
    console.error("[apiUpsertPromotionTarget] failed:", err);
    return false;
  }
}
