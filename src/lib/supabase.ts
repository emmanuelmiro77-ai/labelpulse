"use client";

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ==================== SUPABASE CLIENT ====================
// Client-side Supabase per la sincronizzazione cloud dei dati.
// Se le variabili d'ambiente non sono configurate, il client è null
// e l'app funziona in modalità localStorage-only.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (typeof window === "undefined") return null;

  if (!_supabase) {
    _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false }, // Nessuna sessione auth per app single-user
    });
  }
  return _supabase;
}

// ==================== CLOUD SYNC FUNCTIONS ====================

const CLOUD_TABLE = "app_state";
const CLOUD_ROW_ID = "default";

/**
 * Salva lo stato completo dell'app su Supabase.
 * Usa upsert per creare o aggiornare il record.
 */
export async function saveStateToCloud(data: object): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  try {
    const { error } = await supabase.from(CLOUD_TABLE).upsert(
      {
        id: CLOUD_ROW_ID,
        data: data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (error) {
      console.error("[LabelPulse Cloud] Save error:", error.message);
      return false;
    }

    console.log("[LabelPulse Cloud] State saved successfully");
    return true;
  } catch (err) {
    console.error("[LabelPulse Cloud] Save exception:", err);
    return false;
  }
}

/**
 * Carica lo stato completo dell'app da Supabase.
 * Ritorna null se non ci sono dati o se Supabase non è configurato.
 */
export async function loadStateFromCloud(): Promise<object | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from(CLOUD_TABLE)
      .select("data, updated_at")
      .eq("id", CLOUD_ROW_ID)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows returned — first time, no data in cloud yet
        console.log("[LabelPulse Cloud] No cloud data found (first sync)");
        return null;
      }
      console.error("[LabelPulse Cloud] Load error:", error.message);
      return null;
    }

    if (!data?.data || Object.keys(data.data).length === 0) {
      console.log("[LabelPulse Cloud] Cloud data is empty");
      return null;
    }

    console.log(
      "[LabelPulse Cloud] State loaded successfully, updated_at:",
      data.updated_at
    );
    return data.data as object;
  } catch (err) {
    console.error("[LabelPulse Cloud] Load exception:", err);
    return null;
  }
}
