"use client";

/**
 * 🔒 FASE D.5 — Realtime subscription per le 4 nuove tabelle
 *
 * Hook React che sottoscrive i cambiamenti delle tabelle:
 * - demo_submissions
 * - label_personal_data
 * - pitch_campaigns
 * - user_profiles
 *
 * Quando un cambiamento avviene su un altro dispositivo (es. PC lavoro),
 * questo hook riceve l'evento in 1-2 secondi e aggiorna lo store Zustand.
 *
 * Questo è il vero cross-device sync: PC casa vede subito le modifiche
 * fatte su PC lavoro, senza bisogno di reload.
 *
 * ⚠️ Richiede che l'utente sia autenticato con Supabase Auth (JWT).
 * Se l'utente ha solo sessione NextAuth (no Supabase JWT), il realtime
 * non funziona perché la RLS blocca la sottoscrizione.
 */

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useAppStore } from "@/lib/store";

type RealtimePayload = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: any;
  old: any;
  schema: string;
  table: string;
};

export function useRealtimeSync() {
  const { data: session } = useSession();
  const supabaseAccessToken = (session as any)?.supabaseAccessToken;
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!supabaseAccessToken) return;

    let mounted = true;

    const setupRealtime = async () => {
      try {
        // Crea client Supabase con il JWT dell'utente
        const { createClient } = await import("@supabase/supabase-js");
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey, {
          global: {
            headers: {
              Authorization: `Bearer ${supabaseAccessToken}`,
            },
          },
          realtime: {
            params: {
              eventsPerSecond: 10,
            },
          },
        });

        if (!mounted) return;

        // Crea un unico channel per tutte le tabelle
        const channel = supabase.channel("labelpulse-fase-d-realtime");

        // 1. demo_submissions
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "demo_submissions" },
          (payload: RealtimePayload) => {
            console.log("[Realtime] demo_submissions:", payload.eventType);
            handleDemoChange(payload);
          }
        );

        // 2. label_personal_data
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "label_personal_data" },
          (payload: RealtimePayload) => {
            console.log("[Realtime] label_personal_data:", payload.eventType);
            handleLabelDataChange(payload);
          }
        );

        // 3. pitch_campaigns
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "pitch_campaigns" },
          (payload: RealtimePayload) => {
            console.log("[Realtime] pitch_campaigns:", payload.eventType);
            handlePitchChange(payload);
          }
        );

        // 4. user_profiles
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "user_profiles" },
          (payload: RealtimePayload) => {
            console.log("[Realtime] user_profiles:", payload.eventType);
            handleProfileChange(payload);
          }
        );

        channel.subscribe((status: string) => {
          console.log("[Realtime] channel status:", status);
        });

        channelRef.current = channel;
      } catch (err) {
        console.error("[Realtime] setup failed:", err);
      }
    };

    setupRealtime();

    return () => {
      mounted = false;
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [supabaseAccessToken]);
}

// ==================== HANDLERS ====================

function handleDemoChange(payload: RealtimePayload) {
  const state = useAppStore.getState();
  const demos = [...state.demos];

  if (payload.eventType === "DELETE") {
    const filtered = demos.filter((d) => d.id !== payload.old?.id);
    useAppStore.setState({ demos: filtered });
    return;
  }

  const newRow = payload.new;
  if (!newRow) return;

  const mappedDemo = {
    id: newRow.id,
    labelId: newRow.label_id,
    trackName: newRow.track_name,
    artistName: newRow.artist_name || "",
    link: newRow.link || "",
    status: newRow.status || "ready",
    sentDate: newRow.sent_date,
    pitchText: newRow.pitch_text,
    pitchSubject: newRow.pitch_subject,
    pitchTracks: newRow.pitch_tracks,
    notes: newRow.notes,
    parentReleaseId: newRow.parent_release_id,
    createdAt: newRow.created_at,
  };

  const idx = demos.findIndex((d) => d.id === newRow.id);
  if (idx >= 0) {
    demos[idx] = mappedDemo;
  } else {
    demos.unshift(mappedDemo);
  }
  useAppStore.setState({ demos });
}

function handleLabelDataChange(payload: RealtimePayload) {
  const state = useAppStore.getState();
  const labels = [...state.labels];

  if (payload.eventType === "DELETE") {
    // La label personal data è stata cancellata — resetta i campi personalizzati
    const labelId = payload.old?.label_id;
    const idx = labels.findIndex((l) => l.id === labelId);
    if (idx >= 0) {
      labels[idx] = {
        ...labels[idx],
        emails: [],
        notes: "",
        status: "unknown",
        website: "",
        demoLink: "",
        socialLink: "",
        soundcloudLink: "",
        contactInfo: "",
      };
      useAppStore.setState({ labels });
    }
    return;
  }

  const newRow = payload.new;
  if (!newRow) return;

  const idx = labels.findIndex((l) => l.id === newRow.label_id);
  if (idx >= 0) {
    // Aggiorna i campi personalizzati sulla label esistente
    labels[idx] = {
      ...labels[idx],
      emails: newRow.emails || labels[idx].emails,
      notes: newRow.notes || labels[idx].notes,
      status: newRow.status || labels[idx].status,
      website: newRow.website || labels[idx].website,
      demoLink: newRow.demo_link || labels[idx].demoLink,
      socialLink: newRow.social_link || labels[idx].socialLink,
      soundcloudLink: newRow.soundcloud_link || labels[idx].soundcloudLink,
      contactInfo: newRow.contact_info || labels[idx].contactInfo,
    };
    useAppStore.setState({ labels });
  } else if (newRow.is_custom) {
    // Custom label nuova — aggiungila
    labels.push({
      id: newRow.label_id,
      name: newRow.custom_name || "Unknown",
      genre: newRow.custom_genre || "",
      status: newRow.status || "unknown",
      emails: newRow.emails || [],
      notes: newRow.notes || "",
      website: newRow.website || "",
      demoLink: newRow.demo_link || "",
      socialLink: newRow.social_link || "",
      soundcloudLink: newRow.soundcloud_link || "",
      contactInfo: newRow.contact_info || "",
      isCustom: true,
      submissionType: "email",
      createdAt: newRow.created_at,
      genres: [],
      rankByGenre: {},
      pointsByGenre: {},
      trending: false,
      trendingRankByGenre: {},
      trendingPointsByGenre: {},
    });
    useAppStore.setState({ labels });
  }
}

function handlePitchChange(payload: RealtimePayload) {
  const state = useAppStore.getState();
  const newRow = payload.new;
  const oldRow = payload.old;

  if (payload.eventType === "DELETE") {
    // Rimuovi da entrambi savedPitches e sentCampaigns
    useAppStore.setState({
      savedPitches: state.savedPitches.filter((p) => p.id !== oldRow?.id),
      sentCampaigns: state.sentCampaigns.filter((c) => c.id !== oldRow?.id),
    });
    return;
  }

  if (!newRow) return;

  const mappedPitch = {
    id: newRow.id,
    labelId: newRow.label_id,
    labelName: newRow.label_name,
    demoId: newRow.demo_id,
    subject: newRow.subject,
    body: newRow.body,
    pitchTracks: newRow.pitch_tracks,
    epLinkMode: newRow.ep_link_mode,
    epSoundCloudUrl: newRow.ep_soundcloud_url,
    createdAt: newRow.created_at,
    updatedAt: newRow.updated_at,
    sentAt: newRow.sent_at,
    sentMethod: newRow.sent_method,
  };

  if (newRow.status === "sent") {
    // Aggiungi/aggiorna in sentCampaigns
    const sent = [...state.sentCampaigns];
    const idx = sent.findIndex((c) => c.id === newRow.id);
    if (idx >= 0) {
      sent[idx] = mappedPitch;
    } else {
      sent.unshift(mappedPitch);
    }
    // Rimuovi da savedPitches se era lì (è stata inviata)
    useAppStore.setState({
      sentCampaigns: sent,
      savedPitches: state.savedPitches.filter((p) => p.id !== newRow.id),
    });
  } else {
    // Draft — aggiungi/aggiorna in savedPitches
    const drafts = [...state.savedPitches];
    const idx = drafts.findIndex((p) => p.id === newRow.id);
    if (idx >= 0) {
      drafts[idx] = mappedPitch;
    } else {
      drafts.push(mappedPitch);
    }
    useAppStore.setState({ savedPitches: drafts });
  }
}

function handleProfileChange(payload: RealtimePayload) {
  const state = useAppStore.getState();
  const newRow = payload.new;
  if (!newRow) return;

  // Solo se il profilo è dell'utente corrente (RLS dovrebbe garantire questo)
  useAppStore.setState({
    userProfile: {
      ...state.userProfile,
      artistName: newRow.artist_name || state.userProfile.artistName,
      bio: newRow.bio || state.userProfile.bio,
      photoUrl: newRow.photo_url || state.userProfile.photoUrl,
      scLink: newRow.sc_link || state.userProfile.scLink,
      links: newRow.links || state.userProfile.links,
      cyaniteApiToken: newRow.cyanite_api_token || state.userProfile.cyaniteApiToken,
    },
  });
}
