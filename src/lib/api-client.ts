/**
 * 🔒 FASE C — API client per le nuove tabelle dedicate
 *
 * Helper functions per chiamare le API routes /api/demos, /api/label-data,
 * /api/pitches, /api/profile con gestione errori silenziosa.
 *
 * Strategia: "dual write" — l'app continua a usare localStorage come cache,
 * MA ogni operazione viene anche inviata alla nuova API.
 * Quando la migrazione sarà completa, rimuoveremo il vecchio sistema app_state.
 *
 * Se la API fallisce (network error, server down), l'errore viene loggato ma
 * l'operazione locale continua — l'utente non vede errori.
 */

const API_BASE = "";

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
    const res = await fetch(`${API_BASE}/api/demos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(demo),
    });
    if (!res.ok) {
      console.error("[apiCreateDemo] failed:", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[apiCreateDemo] network error:", err);
    return false;
  }
}

export async function apiUpdateDemo(id: string, updates: Partial<DemoRow>): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/demos?id=${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      console.error("[apiUpdateDemo] failed:", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[apiUpdateDemo] network error:", err);
    return false;
  }
}

export async function apiDeleteDemo(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/demos?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      console.error("[apiDeleteDemo] failed:", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[apiDeleteDemo] network error:", err);
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
    const res = await fetch(`${API_BASE}/api/label-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(labelData),
    });
    if (!res.ok) {
      console.error("[apiUpsertLabelData] failed:", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[apiUpsertLabelData] network error:", err);
    return false;
  }
}

export async function apiDeleteLabelData(labelId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/label-data?label_id=${encodeURIComponent(labelId)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      console.error("[apiDeleteLabelData] failed:", res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[apiDeleteLabelData] network error:", err);
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
    const res = await fetch(`${API_BASE}/api/pitches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pitch),
    });
    if (!res.ok) {
      console.error("[apiCreatePitch] failed:", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[apiCreatePitch] network error:", err);
    return false;
  }
}

export async function apiUpdatePitch(id: string, updates: Partial<PitchRow>): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/pitches?id=${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      console.error("[apiUpdatePitch] failed:", res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[apiUpdatePitch] network error:", err);
    return false;
  }
}

export async function apiDeletePitch(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/pitches?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      console.error("[apiDeletePitch] failed:", res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[apiDeletePitch] network error:", err);
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

export async function apiUpsertProfile(profile: ProfileRow): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    if (!res.ok) {
      console.error("[apiUpsertProfile] failed:", res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[apiUpsertProfile] network error:", err);
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
}

export async function apiCreateRelease(release: ReleaseRow): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/releases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(release),
    });
    if (!res.ok) {
      console.error("[apiCreateRelease] failed:", res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[apiCreateRelease] network error:", err);
    return false;
  }
}

export async function apiUpdateRelease(id: string, updates: Partial<ReleaseRow>): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/releases?id=${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      console.error("[apiUpdateRelease] failed:", res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[apiUpdateRelease] network error:", err);
    return false;
  }
}

export async function apiDeleteRelease(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/releases?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      console.error("[apiDeleteRelease] failed:", res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[apiDeleteRelease] network error:", err);
    return false;
  }
}

