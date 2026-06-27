#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LabelPulse — Strategia Beta Test + Licensing + Pricing
Genera un PDF strategico integrato che riassume le 3 ricerche in
/home/z/my-project/research-output/ + AGENT_CONTEXT.md updates.
Output: /home/z/my-project/download/labelpulse-beta-strategy.pdf
"""

import os
import sys
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm, cm
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak,
    Table, TableStyle, KeepTogether, Image, ListFlowable, ListItem
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# --- Font registration (CJK + Latin) ---
FONT_PATHS = {
    "NotoSans":      "/usr/share/fonts/truetype/chinese/NotoSansSC-Regular.ttf",
    "NotoSans-Bold": "/usr/share/fonts/truetype/chinese/NotoSansSC-Bold.ttf",
    "NotoSerif":     "/usr/share/fonts/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf",
    "NotoSerif-Bold":"/usr/share/fonts/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf",
}
for name, path in FONT_PATHS.items():
    if os.path.exists(path):
        try:
            pdfmetrics.registerFont(TTFont(name, path))
        except Exception as e:
            print(f"WARN: cannot register {name}: {e}", file=sys.stderr)

BODY_FONT = "NotoSans" if "NotoSans" in pdfmetrics.getRegisteredFontNames() else "Helvetica"
BOLD_FONT = "NotoSans-Bold" if "NotoSans-Bold" in pdfmetrics.getRegisteredFontNames() else "Helvetica-Bold"
SERIF_FONT = "NotoSerif" if "NotoSerif" in pdfmetrics.getRegisteredFontNames() else "Times-Roman"

# --- Palette (LabelPulse brand) ---
C_PRIMARY   = colors.HexColor("#0EA5E9")  # cyan-glow
C_ACCENT    = colors.HexColor("#06B6D4")
C_DARK      = colors.HexColor("#0F172A")
C_MUTED     = colors.HexColor("#64748B")
C_BG_SOFT   = colors.HexColor("#F1F5F9")
C_BG_TABLE  = colors.HexColor("#E0F2FE")
C_BORDER    = colors.HexColor("#CBD5E1")
C_OK        = colors.HexColor("#10B981")
C_WARN      = colors.HexColor("#F59E0B")
C_DANGER    = colors.HexColor("#EF4444")

# --- Document setup ---
OUTPUT_PATH = "/home/z/my-project/download/labelpulse-beta-strategy.pdf"
os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

doc = SimpleDocTemplate(
    OUTPUT_PATH,
    pagesize=A4,
    leftMargin=20*mm, rightMargin=20*mm,
    topMargin=22*mm, bottomMargin=20*mm,
    title="LabelPulse - Strategia Beta Test, Licensing e Pricing",
    author="LabelPulse Team",
    subject="Strategia go-to-market per beta test e monetizzazione",
    creator="LabelPulse Strategy Generator",
)

# --- Styles ---
styles = getSampleStyleSheet()

style_title = ParagraphStyle(
    "TitleX", parent=styles["Title"],
    fontName=BOLD_FONT, fontSize=26, leading=32,
    textColor=C_DARK, alignment=TA_LEFT, spaceAfter=6,
)
style_subtitle = ParagraphStyle(
    "SubtitleX", parent=styles["Normal"],
    fontName=BODY_FONT, fontSize=12, leading=16,
    textColor=C_MUTED, alignment=TA_LEFT, spaceAfter=14,
)
style_h1 = ParagraphStyle(
    "H1X", parent=styles["Heading1"],
    fontName=BOLD_FONT, fontSize=18, leading=24,
    textColor=C_DARK, alignment=TA_LEFT,
    spaceBefore=14, spaceAfter=8,
    borderPadding=(0, 0, 4, 0),
)
style_h2 = ParagraphStyle(
    "H2X", parent=styles["Heading2"],
    fontName=BOLD_FONT, fontSize=14, leading=20,
    textColor=C_PRIMARY, alignment=TA_LEFT,
    spaceBefore=12, spaceAfter=6,
)
style_h3 = ParagraphStyle(
    "H3X", parent=styles["Heading3"],
    fontName=BOLD_FONT, fontSize=11, leading=16,
    textColor=C_DARK, alignment=TA_LEFT,
    spaceBefore=8, spaceAfter=4,
)
style_body = ParagraphStyle(
    "BodyX", parent=styles["Normal"],
    fontName=BODY_FONT, fontSize=10, leading=15,
    textColor=C_DARK, alignment=TA_JUSTIFY,
    spaceAfter=6,
)
style_body_left = ParagraphStyle(
    "BodyLX", parent=style_body, alignment=TA_LEFT,
)
style_bullet = ParagraphStyle(
    "BulletX", parent=style_body,
    leftIndent=14, bulletIndent=0, spaceAfter=3, alignment=TA_LEFT,
)
style_callout = ParagraphStyle(
    "CalloutX", parent=style_body,
    fontName=BODY_FONT, fontSize=10, leading=14,
    textColor=C_DARK, backColor=C_BG_SOFT,
    borderColor=C_PRIMARY, borderWidth=0, borderPadding=10,
    leftIndent=0, rightIndent=0, spaceBefore=8, spaceAfter=8,
)
style_small = ParagraphStyle(
    "SmallX", parent=style_body,
    fontSize=8, leading=11, textColor=C_MUTED, alignment=TA_LEFT,
)
style_table_cell = ParagraphStyle(
    "TableCellX", parent=style_body,
    fontSize=8.5, leading=12, alignment=TA_LEFT, spaceAfter=0,
)
style_table_header = ParagraphStyle(
    "TableHeaderX", parent=style_body,
    fontName=BOLD_FONT, fontSize=9, leading=12,
    textColor=colors.white, alignment=TA_LEFT, spaceAfter=0,
)

story = []

# ===================================================================
# COVER
# ===================================================================
story.append(Spacer(1, 40*mm))

cover_title = ParagraphStyle("CT", parent=style_title, fontSize=32, leading=40, alignment=TA_CENTER)
cover_sub   = ParagraphStyle("CS", parent=style_subtitle, fontSize=14, leading=20, alignment=TA_CENTER)

story.append(Paragraph("LabelPulse", cover_title))
story.append(Spacer(1, 6*mm))
story.append(Paragraph("Strategia Beta Test, Licensing &amp; Pricing", cover_sub))
story.append(Spacer(1, 14*mm))

# Decorative line
line_tbl = Table([[""]], colWidths=[60*mm], rowHeights=[2])
line_tbl.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,-1), C_PRIMARY),
    ("LINEBELOW", (0,0), (-1,-1), 0, colors.transparent),
]))
story.append(line_tbl)
story.append(Spacer(1, 14*mm))

story.append(Paragraph(
    "Trasformare LabelPulse da progetto personale a SaaS commerciale: "
    "beta test strutturato, protezione anti-piracy, modello di abbonamento "
    "mensile/annuale, conformita legale EU.",
    ParagraphStyle("CSub2", parent=style_body, fontSize=11, leading=16,
                   alignment=TA_CENTER, textColor=C_MUTED)
))
story.append(Spacer(1, 60*mm))

# Cover footer
story.append(Paragraph(
    f"<b>Versione:</b> 1.0 &nbsp;&nbsp;|&nbsp;&nbsp; "
    f"<b>Data:</b> {datetime.now().strftime('%Y-%m-%d')} &nbsp;&nbsp;|&nbsp;&nbsp; "
    f"<b>Autore:</b> LabelPulse Team",
    ParagraphStyle("CF", parent=style_small, alignment=TA_CENTER, fontSize=9)
))

story.append(PageBreak())

# ===================================================================
# INDICE
# ===================================================================
story.append(Paragraph("Indice", style_h1))
story.append(Spacer(1, 4*mm))

toc_data = [
    ["1.", "Executive Summary", "3"],
    ["2.", "Fase 1: Beta Test Strutturato", "4"],
    ["2.1", "Reclutamento tester", "4"],
    ["2.2", "Onboarding &amp; gestione", "6"],
    ["2.3", "Stack tecnico (Sentry, PostHog, Discord, Canny)", "7"],
    ["2.4", "Metriche e criteri di graduation", "8"],
    ["3.", "Fase 2: Licensing &amp; Anti-Piracy", "9"],
    ["3.1", "Billing: Lemon Squeezy (MoR) + Stripe Billing", "9"],
    ["3.2", "Protezione codice Next.js + Supabase", "10"],
    ["3.3", "Subscription states &amp; device limit", "11"],
    ["3.4", "Cosa NON funziona (verificato)", "12"],
    ["4.", "Fase 3: Pricing &amp; Business Model", "13"],
    ["4.1", "Analisi competitor (SubmitHub, Groover, LANDR...)", "13"],
    ["4.2", "3 strategie a confronto", "14"],
    ["4.3", "Raccomandazione finale + revenue projection", "15"],
    ["5.", "Fase 4: Conformita Legale EU/IT", "16"],
    ["6.", "Roadmap integrata 30-60-90 giorni", "17"],
    ["7.", "Checklist azioni immediate (settimana 1)", "18"],
]
toc_tbl = Table(
    [[Paragraph(f"<b>{n}</b>", style_table_cell),
      Paragraph(t, style_table_cell),
      Paragraph(f"<i>{p}</i>", style_table_cell)] for n, t, p in toc_data],
    colWidths=[14*mm, 130*mm, 22*mm]
)
toc_tbl.setStyle(TableStyle([
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("ALIGN", (2,0), (2,-1), "RIGHT"),
    ("TOPPADDING", (0,0), (-1,-1), 3),
    ("BOTTOMPADDING", (0,0), (-1,-1), 3),
    ("LINEBELOW", (1,0), (1,-1), 0.3, C_BORDER),
]))
story.append(toc_tbl)
story.append(PageBreak())

# ===================================================================
# 1. EXECUTIVE SUMMARY
# ===================================================================
story.append(Paragraph("1. Executive Summary", style_h1))

story.append(Paragraph(
    "Questo documento definisce la strategia go-to-market per LabelPulse nelle prossime 12 settimane. "
    "L'obiettivo e trasformare l'app da progetto personale testato solo dal founder a SaaS commerciale "
    "con beta tester esterni verificati, protezione anti-copia, modello di abbonamento e conformita legale EU. "
    "La strategia si articola in 4 fasi sequenziali che possono essere eseguite in parte in parallelo. "
    "Ogni fase ha deliverable concreti, metriche di successo oggettive e stack tecnologico raccomandato "
    "basato su best practice di SaaS gia testati sul mercato (Splice, LANDR, DistroKid, SubmitHub, Groover).",
    style_body
))

story.append(Paragraph(
    "Il principio guida e <b>replicare stabilita e sicurezza di SaaS gia testati</b>, non inventare soluzioni custom. "
    "Per LabelPulse questo significa: spostare la value proposition lato server (label database, ranking Beatport, "
    "pitch generation euristica), usare Lemon Squeezy come Merchant of Record per gestire VAT EU automaticamente, "
    "RLS Supabase per multi-tenant isolation (gia implementato), PostHog per analytics + feature flag + session "
    "replay in un unico SDK. Costo totale stimato a regime: circa $127/mese per 50 utenti paganti.",
    style_body
))

# Pillars summary table
pillars_data = [
    [Paragraph("<b>Fase</b>", style_table_header),
     Paragraph("<b>Obiettivo</b>", style_table_header),
     Paragraph("<b>Durata</b>", style_table_header),
     Paragraph("<b>Output chiave</b>", style_table_header)],
    [Paragraph("1. Beta Test", style_table_cell),
     Paragraph("Validare product-market fit con 15-25 tester reali selezionati", style_table_cell),
     Paragraph("4-6 sett.", style_table_cell),
     Paragraph("NPS &gt;=30, bug rate &lt;1/100, D7 retention &gt;=15%", style_table_cell)],
    [Paragraph("2. Licensing", style_table_cell),
     Paragraph("Anti-piracy server-side + subscription billing EU-compliant", style_table_cell),
     Paragraph("2 sett.", style_table_cell),
     Paragraph("Tabella subscriptions + RLS + Lemon Squeezy webhook", style_table_cell)],
    [Paragraph("3. Pricing", style_table_cell),
     Paragraph("Definire modello freemium + tier Pro/Studio", style_table_cell),
     Paragraph("1 sett.", style_table_cell),
     Paragraph("3 tier pubblici con prezzi EUR, upgrade trigger definiti", style_table_cell)],
    [Paragraph("4. Legale", style_table_cell),
     Paragraph("GDPR, EULA, cookie consent, diritto recesso EU", style_table_cell),
     Paragraph("1 sett.", style_table_cell),
     Paragraph("iubenda Pro attivo, EULA pubblicato, cookie banner", style_table_cell)],
]
pillars_tbl = Table(pillars_data, colWidths=[28*mm, 65*mm, 22*mm, 55*mm])
pillars_tbl.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), C_PRIMARY),
    ("TEXTCOLOR", (0,0), (-1,0), colors.white),
    ("BACKGROUND", (0,1), (-1,-1), colors.white),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, C_BG_SOFT]),
    ("GRID", (0,0), (-1,-1), 0.4, C_BORDER),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("LEFTPADDING", (0,0), (-1,-1), 6),
    ("RIGHTPADDING", (0,0), (-1,-1), 6),
    ("TOPPADDING", (0,0), (-1,-1), 6),
    ("BOTTOMPADDING", (0,0), (-1,-1), 6),
]))
story.append(Spacer(1, 6*mm))
story.append(pillars_tbl)

story.append(Spacer(1, 6*mm))
story.append(Paragraph(
    "<b>Investimento totale fase beta:</b> $127/mese infrastruttura + ~25 ore di sviluppo "
    "full-time per setup completo (Sentry, PostHog, Lemon Squeezy, RLS subscriptions, "
    "iubenda). ROI atteso al GA: 500 early adopter a €149 lifetime = €74.500 una tantum + "
    "€1.750/mese ricorrenti dai nuovi Pro subscriber.",
    style_callout
))

story.append(PageBreak())

# ===================================================================
# 2. FASE 1 - BETA TEST
# ===================================================================
story.append(Paragraph("2. Fase 1: Beta Test Strutturato", style_h1))

story.append(Paragraph(
    "Il passaggio da \"giochino per me\" a vero beta test richiede 4 componenti: reclutamento mirato di "
    "producer reali, onboarding strutturato con NDA e kit di benvenuto, stack tecnico per raccogliere "
    "feedback qualitativi e quantitativi, e criteri oggettivi per decidere quando passare da closed beta "
    "a General Availability. La regola d'oro e che 5-10 tester trovano l'80% dei bug UX maggiori "
    "(legge di Nielsen, ancora valida nel 2026); 25-50 tester e il sweet spot per SaaS bootstrap. "
    "Oltre 100 tester richiedono tool strutturati (Centercode, Canny) e una persona dedicata alla triage.",
    style_body
))

# 2.1 Reclutamento
story.append(Paragraph("2.1 Reclutamento tester", style_h2))

story.append(Paragraph(
    "Per LabelPulse il canale primario di reclutamento non sono le piattaforme SaaS generiche ma le "
    "community di producer musicali elettronici. Le piattaforme beta-testing generiche (BetaList, "
    "BetaFamily) sono utili per volume ma il segnale e basso: la maggior parte degli iscritti e "
    "indie hacker SaaS B2B, non producer. Le community musicali (subreddit, Discord, forum) convertono "
    "meno ma con qualita molto piu alta. Strategia consigliata: BetaList featured ($129) per volume "
    "+ 20 DM mirate su Reddit/Discord per qualita.",
    style_body
))

# Platforms table
plat_data = [
    [Paragraph("<b>Piattaforma</b>", style_table_header),
     Paragraph("<b>Costo</b>", style_table_header),
     Paragraph("<b>Pro / Contro</b>", style_table_header)],
    [Paragraph("BetaList", style_table_cell),
     Paragraph("Free submit; $129-$299 featured", style_table_cell),
     Paragraph("100-200 signup per featured, ma audience SaaS B2B generica", style_table_cell)],
    [Paragraph("r/WeAreTheMusicMakers", style_table_cell),
     Paragraph("Free", style_table_cell),
     Paragraph("55K+ membri, alta qualita se post value-first (no 'test my app')", style_table_cell)],
    [Paragraph("r/edmproduction", style_table_cell),
     Paragraph("Free", style_table_cell),
     Paragraph("Target esatto per LabelPulse (EDM producer)", style_table_cell)],
    [Paragraph("Gearspace (già Gearslutz)", style_table_cell),
     Paragraph("Free", style_table_cell),
     Paragraph("Forum #1 pro audio, sezione Electronic Music Production", style_table_cell)],
    [Paragraph("Discord Splice / Output / Audius", style_table_cell),
     Paragraph("Free", style_table_cell),
     Paragraph("Producer attivi, accesso diretto ma moderazione severa", style_table_cell)],
    [Paragraph("FB 'Electronic Music Producers'", style_table_cell),
     Paragraph("Free", style_table_cell),
     Paragraph("Posting 'test my SaaS' spesso bloccato, richiede caso d'uso reale", style_table_cell)],
    [Paragraph("BetaTesting (Erli Bird)", style_table_cell),
     Paragraph("$50-$500/sessione", style_table_cell),
     Paragraph("Reclutamento chiavi in mano ma costoso per bootstrap", style_table_cell)],
    [Paragraph("UserTesting", style_table_cell),
     Paragraph("~$40K/anno", style_table_cell),
     Paragraph("OUT OF SCALE per bootstrap, sconsigliato", style_table_cell)],
]
plat_tbl = Table(plat_data, colWidths=[42*mm, 35*mm, 93*mm])
plat_tbl.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), C_PRIMARY),
    ("TEXTCOLOR", (0,0), (-1,0), colors.white),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, C_BG_SOFT]),
    ("GRID", (0,0), (-1,-1), 0.4, C_BORDER),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("LEFTPADDING", (0,0), (-1,-1), 6),
    ("RIGHTPADDING", (0,0), (-1,-1), 6),
    ("TOPPADDING", (0,0), (-1,-1), 5),
    ("BOTTOMPADDING", (0,0), (-1,-1), 5),
]))
story.append(plat_tbl)

story.append(Spacer(1, 6*mm))
story.append(Paragraph("Email/DM template per outreach", style_h3))
story.append(Paragraph(
    "Oggetto: Ti va di stress-testare un tool per label tracking? (beta chiusa, 15 posti)<br/><br/>"
    "Ciao [Nome],<br/><br/>"
    "ho visto il tuo post su r/edmproduction sui problemi a tenere traccia delle demo inviate "
    "alle label - e esattamente il problema che sto cercando di risolvere con LabelPulse. "
    "In sintesi: tiene traccia di ogni demo inviata, genera pitch personalizzati per ogni label, "
    "e ti mostra i ranking Beatport aggiornati per capire dove puntare.<br/><br/>"
    "Sto per aprire una closed beta con 15 producer. 30 minuti di setup, accesso gratuito a vita "
    "al piano Pro in cambio di feedback onesto.<br/><br/>"
    "Se ti va: https://labelpulse.app/beta - altrimenti zero pressione, grazie del tempo che hai "
    "dedicato a leggere.<br/><br/>"
    "- [Tuo nome], founder",
    style_callout
))

story.append(Spacer(1, 4*mm))
story.append(Paragraph("Screening questionnaire - chi accettare e chi rifiutare", style_h3))
story.append(Paragraph(
    "<b>ACCETTARE:</b> producer che inviano almeno 2 demo al mese a label (valida il need reale), "
    "producgono electronic/EDM/house/techno (target principale per Beatport rankings), hanno un "
    "catalogo SoundCloud/Beatport attivo, sono disposti a 30 min onboarding + 1 check-in ogni 2 settimane. "
    "Questi criteri assicurano che il tester abbia skin nel game e fornisca feedback realistico.",
    style_body
))
story.append(Paragraph(
    "<b>RIFIUTARE (gentilmente):</b> aspiranti producer ('mi piacerebbe imparare a produrre'), "
    "producer hip-hop/country puro fuori target per la v1, account Reddit/Discord appena creati "
    "(sospetto bot), chi chiede subito 'e gratis?' come prima domanda (bassa intenzione di feedback), "
    "agenzie/manager (target diverso, serve product-market fit separata).",
    style_body
))

# 2.2 Onboarding
story.append(Paragraph("2.2 Onboarding &amp; gestione beta tester", style_h2))

story.append(Paragraph(
    "Il primo contatto entro 24 ore dall'accettazione e critico per evitare drop-off. La sequenza "
    "consigliata include: email di benvenuto personale, link onboarding (URL univoco o codice invito "
    "Discord), NDA opzionale (template gratuito su wonder.legal o rocketlawyer.com), credenziali "
    "magic-login tramite NextAuth gia integrato, 3 compiti chiari per la prima settimana (crea profilo, "
    "aggiungi 1 label, inserisci 1 demo), calendario check-in biweekly. Per LabelPulse, dove non ci "
    "sono algoritmi sensibili esclusivi, l'NDA e opzionale ma raccomandato se si condividono feature "
    "non ancora rilasciate pubblicamente.",
    style_body
))

story.append(Paragraph(
    "<b>Cadenza check-in:</b> settimanale per primi 14 giorni (alta probabilita di drop-off), "
    "biweekly da giorno 15 in poi, wrap-up survey a fine beta (giorno 30/45). Formato check-in: "
    "email breve con 3 domande (max 60 secondi per rispondere): cosa ha funzionato questa settimana, "
    "cosa ti ha bloccato, una feature che vorresti.",
    style_body
))

story.append(Paragraph(
    "<b>Strumenti di gestione:</b> Discord server privato gratuito con canali dedicati "
    "(#beta-announcements, #bug-reports, #feature-requests, #general) + Canny free (fino a 100 MAU) "
    "per feature request board pubblica da linkare in onboarding. Centercode ($2K-$10K/anno) e "
    "UserVoice ($16K/anno) sono out-of-scale per bootstrap sotto i 50 tester.",
    style_body
))

# 2.3 Stack tecnico
story.append(Paragraph("2.3 Stack tecnico per beta test", style_h2))

story.append(Paragraph(
    "LabelPulse attualmente NON ha Sentry configurato ne analytics strutturato. Per la beta e "
    "necessario aggiungere 3 componenti: error tracking, analytics + session replay, feature flag. "
    "La scelta consigliata e <b>PostHog</b> perche combina in un unico SDK analytics, feature flag "
    "e session replay (gratis 1M eventi/mese + 5K replay + 1M flag requests), piu <b>Sentry</b> "
    "free tier per error tracking server-side (5K errori/mese gratuiti). Costo totale: $0/mese "
    "fino a soglia free, poi ~$26/mese Sentry Team.",
    style_body
))

stack_data = [
    [Paragraph("<b>Tool</b>", style_table_header),
     Paragraph("<b>Scopo</b>", style_table_header),
     Paragraph("<b>Costo free tier</b>", style_table_header)],
    [Paragraph("PostHog", style_table_cell),
     Paragraph("Analytics + Feature Flag + Session Replay (1 SDK)", style_table_cell),
     Paragraph("1M eventi + 5K replay + 1M flag/mese", style_table_cell)],
    [Paragraph("Sentry (@sentry/nextjs)", style_table_cell),
     Paragraph("Error tracking server + client side", style_table_cell),
     Paragraph("5K errori + 50 replay/mese", style_table_cell)],
    [Paragraph("Canny", style_table_cell),
     Paragraph("Feature request board pubblica", style_table_cell),
     Paragraph("Fino a 100 MAU", style_table_cell)],
    [Paragraph("Discord", style_table_cell),
     Paragraph("Community beta tester, voice + chat realtime", style_table_cell),
     Paragraph("Free (Nitro opzionale)", style_table_cell)],
    [Paragraph("Vercel Flags SDK", style_table_cell),
     Paragraph("Feature flag nativo Next.js (alternativa a PostHog)", style_table_cell),
     Paragraph("Free (libreria open-source)", style_table_cell)],
]
stack_tbl = Table(stack_data, colWidths=[42*mm, 90*mm, 38*mm])
stack_tbl.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), C_PRIMARY),
    ("TEXTCOLOR", (0,0), (-1,0), colors.white),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, C_BG_SOFT]),
    ("GRID", (0,0), (-1,-1), 0.4, C_BORDER),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("LEFTPADDING", (0,0), (-1,-1), 6),
    ("RIGHTPADDING", (0,0), (-1,-1), 6),
    ("TOPPADDING", (0,0), (-1,-1), 5),
    ("BOTTOMPADDING", (0,0), (-1,-1), 5),
]))
story.append(stack_tbl)

story.append(Spacer(1, 5*mm))
story.append(Paragraph(
    "<b>Eventi da tracciare in PostHog:</b> user_signed_up, onboarding_completed, profile_created, "
    "first_label_added, first_demo_added, first_pitch_generated, demo_sent, feedback_submitted, "
    "push_enabled, weekly_recap_received. Funnel chiave: signed_up &rarr; onboarding_completed "
    "&rarr; first_label_added &rarr; first_pitch_generated &rarr; demo_sent (momento 'aha').",
    style_body
))

# 2.4 Metriche
story.append(Paragraph("2.4 Metriche e criteri di graduation (beta &rarr; GA)", style_h2))

metrics_data = [
    [Paragraph("<b>Metrica</b>", style_table_header),
     Paragraph("<b>Definizione</b>", style_table_header),
     Paragraph("<b>Target LabelPulse</b>", style_table_header)],
    [Paragraph("Activation rate", style_table_cell),
     Paragraph("% signup che completano 'aha moment' entro 7gg", style_table_cell),
     Paragraph("&gt;=35% (benchmark SaaS B2C: 37.5%)", style_table_cell)],
    [Paragraph("Time-to-value (TTV)", style_table_cell),
     Paragraph("Tempo signup &rarr; primo pitch generato", style_table_cell),
     Paragraph("&lt;30 min", style_table_cell)],
    [Paragraph("D1 retention", style_table_cell),
     Paragraph("% utenti che tornano il giorno dopo signup", style_table_cell),
     Paragraph("&gt;=30%", style_table_cell)],
    [Paragraph("D7 retention", style_table_cell),
     Paragraph("% utenti attivi a 7gg", style_table_cell),
     Paragraph("&gt;=15%", style_table_cell)],
    [Paragraph("NPS", style_table_cell),
     Paragraph("Likelihood to recommend 0-10", style_table_cell),
     Paragraph("&gt;=30 per GA (&gt;50 = eccellente)", style_table_cell)],
    [Paragraph("Bug rate critici", style_table_cell),
     Paragraph("P0/P1 bug per 100 tester-attivi / settimana", style_table_cell),
     Paragraph("&lt;1 (se &gt;2 = non passare a GA)", style_table_cell)],
    [Paragraph("CSAT post-azione", style_table_cell),
     Paragraph("Satisfaction dopo primo pitch generato", style_table_cell),
     Paragraph("&gt;=80%", style_table_cell)],
]
metrics_tbl = Table(metrics_data, colWidths=[36*mm, 80*mm, 54*mm])
metrics_tbl.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), C_PRIMARY),
    ("TEXTCOLOR", (0,0), (-1,0), colors.white),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, C_BG_SOFT]),
    ("GRID", (0,0), (-1,-1), 0.4, C_BORDER),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("LEFTPADDING", (0,0), (-1,-1), 6),
    ("RIGHTPADDING", (0,0), (-1,-1), 6),
    ("TOPPADDING", (0,0), (-1,-1), 5),
    ("BOTTOMPADDING", (0,0), (-1,-1), 5),
]))
story.append(metrics_tbl)

story.append(Spacer(1, 5*mm))
story.append(Paragraph(
    "<b>Regola di decisione:</b> se 4 su 5 metriche sono verdi si puo passare a GA. "
    "Se NPS &lt;10 o P0 bug &gt;2 NON passare. La definizione operativa di 'tester attivo' "
    "e: almeno 1 login negli ultimi 7 giorni E almeno 1 azione chiave (demo added, pitch generated, "
    "feedback inviato). 'Tester dormiente' = nessun login negli ultimi 14 giorni &rarr; email "
    "automatica 'tutto ok? serve aiuto?'. Dormiente da 21gg &rarr; escluso dal count beta attivo.",
    style_body
))

story.append(PageBreak())

# ===================================================================
# 3. FASE 2 - LICENSING
# ===================================================================
story.append(Paragraph("3. Fase 2: Licensing &amp; Anti-Piracy", style_h1))

story.append(Paragraph(
    "La protezione di LabelPulse non si basa su obfuscation client-side (crackable in ore, verificato "
    "da piu fonti) ma su un principio piu solido: <b>la value proposition sta nei dati e nella logica "
    "server-side, non nel codice client</b>. Le API routes Next.js mantengono scoring label, ranking "
    "Beatport, generazione pitch sensibile lato server. Supabase RLS blocca accesso a dati non di "
    "propriet dell'utente. Lemon Squeezy gestisce billing come Merchant of Record (MoR) absorbendo "
    "VAT EU, chargeback risk, tax compliance. Questo e lo stesso pattern usato da LANDR, Output Arcade, "
    "Splice: il client e solo una UI, la value e server-side.",
    style_body
))

# 3.1 Billing
story.append(Paragraph("3.1 Billing: Lemon Squeezy + Stripe Billing", style_h2))

billing_data = [
    [Paragraph("<b>Piattaforma</b>", style_table_header),
     Paragraph("<b>Costo</b>", style_table_header),
     Paragraph("<b>MoR</b>", style_table_header),
     Paragraph("<b>VAT EU</b>", style_table_header),
     Paragraph("<b>Quando usarla</b>", style_table_header)],
    [Paragraph("Lemon Squeezy", style_table_cell),
     Paragraph("5% + 50¢/trans", style_table_cell),
     Paragraph("Si", style_table_cell),
     Paragraph("Auto", style_table_cell),
     Paragraph("Fase beta + early commercial (MRR &lt;$5K)", style_table_cell)],
    [Paragraph("Paddle", style_table_cell),
     Paragraph("5% + 50¢/trans", style_table_cell),
     Paragraph("Si", style_table_cell),
     Paragraph("Auto", style_table_cell),
     Paragraph("Alternativa a LS, piu enterprise", style_table_cell)],
    [Paragraph("Stripe Billing", style_table_cell),
     Paragraph("2.9% + 30¢ + 0.5% sub", style_table_cell),
     Paragraph("No", style_table_cell),
     Paragraph("Solo con Stripe Tax (+0.5%)", style_table_cell),
     Paragraph("Sopra $5K MRR (risparmio ~1.6%)", style_table_cell)],
    [Paragraph("Chargebee", style_table_cell),
     Paragraph("Free &lt;$50K MRR, poi $599+/mese", style_table_cell),
     Paragraph("No", style_table_cell),
     Paragraph("Tramite integrazione", style_table_cell),
     Paragraph("Overkill in beta, utile dopo PMF", style_table_cell)],
]
billing_tbl = Table(billing_data, colWidths=[30*mm, 35*mm, 14*mm, 25*mm, 66*mm])
billing_tbl.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), C_PRIMARY),
    ("TEXTCOLOR", (0,0), (-1,0), colors.white),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, C_BG_SOFT]),
    ("GRID", (0,0), (-1,-1), 0.4, C_BORDER),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("LEFTPADDING", (0,0), (-1,-1), 5),
    ("RIGHTPADDING", (0,0), (-1,-1), 5),
    ("TOPPADDING", (0,0), (-1,-1), 5),
    ("BOTTOMPADDING", (0,0), (-1,-1), 5),
]))
story.append(billing_tbl)

story.append(Spacer(1, 5*mm))
story.append(Paragraph(
    "<b>Raccomandazione:</b> Lemon Squeezy in fase beta + early commercial (5% + 50¢, MoR, "
    "VAT EU automatizzata - critico per vendite a utenti italiani). Migrazione a Stripe Billing + "
    "Stripe Tax sopra $5K MRR. Risparmio ~1.6% sopra soglia, giustifica il costo di migrazione.",
    style_callout
))

# 3.2 Protezione codice
story.append(Paragraph("3.2 Protezione codice Next.js + Supabase", style_h2))

story.append(Paragraph(
    "LabelPulse e attualmente su GitHub pubblico. Per la fase beta commerciale e raccomandato "
    "<b>spostare il repo su privato</b> quando ci si avvicina al lancio commerciale. La value di "
    "LabelPulse sta nella label database + euristica ranking Beatport, non nel codice UI. Tenere "
    "pubblico un repo separato labelpulse-docs o labelpulse-sdk per trasparenza e contributi esterni.",
    style_body
))

story.append(Paragraph(
    "Next.js 16 App Router fornisce gia strumenti gratuiti per nascondere logica sensibile: "
    "API routes serverless (app/api/*/route.ts) eseguite solo server-side, Server Components con "
    "'use server' che inviano solo HTML finale al client, Server Actions callable dal client ma "
    "eseguite solo server-side, Edge Middleware per route protection prima del render. Per LabelPulse, "
    "spostare qui: scoring/ranking labels, chiamate Beatport/Soundcloud con chiavi API, generazione "
    "JWT di licenza, query Supabase con service_role key (mai nel client bundle).",
    style_body
))

story.append(Paragraph(
    "<b>Configurazione obbligatoria in next.config.ts:</b> "
    "<font face='Courier'>productionBrowserSourceMaps: false</font> per disabilitare source map "
    "in produzione (default true in Next.js dev). Verificare che non sia stato accidentalmente "
    "attivato. Aggiungere watermarking: ogni utente riceve una build con marker unico per identificare "
    "eventuali leak (hash user_id embedded in bundle, confrontabile in caso di redistribute non autorizzata).",
    style_body
))

# 3.3 Subscription states
story.append(Paragraph("3.3 Subscription states &amp; device limit", style_h2))

story.append(Paragraph(
    "I subscription states standard Stripe/Lemon Squeezy sono: incomplete (appena creata, attesa pagamento), "
    "incomplete_expired (scaduta prima del pagamento), trialing (in prova gratuita), active (pagata e valida), "
    "past_due (rinnovo fallito, in retry entro 4 tentativi con Smart Retries), canceled (terminata), "
    "unpaid (retry esauriti, accesso revocato).",
    style_body
))

story.append(Paragraph(
    "<b>Pattern implementativo raccomandato:</b> webhook Lemon Squeezy/Stripe su /api/webhooks/billing "
    "aggiorna colonna subscriptions in Supabase con status, current_period_end, cancel_at_period_end. "
    "Middleware Next.js legge subscriptions.status ad ogni richiesta autenticata: se active/trialing/past_due "
    "&rarr; accesso OK; se canceled/unpaid/incomplete_expired &rarr; redirect a /billing. Grace period "
    "past_due di 7 giorni (configurabile in LS/Stripe Billing) evita lockout per carte temporaneamente bloccate.",
    style_body
))

story.append(Paragraph(
    "<b>Device limit per licenza:</b> 3 dispositivi attivi simultanei per account (desktop + 2 mobile, "
    "tipico per producer che lavora in studio + in mobilita). No HWID hard binding in fase beta (PWA "
    "installabile, non plugin VST - HWID e fragile su browser). Offline grace period di 7 giorni: "
    "JWT firmato server-side salvato in IndexedDB, validato localmente con chiave pubblica embedded "
    "quando offline. Server-side check al login + ogni 24 ore durante l'uso. Questo e lo stesso pattern "
    "usato da Output Arcade (2 device, 14gg offline grace).",
    style_body
))

# 3.4 Cosa NON funziona
story.append(Paragraph("3.4 Cosa NON funziona (verificato da casi reali)", style_h2))

no_work_data = [
    [Paragraph("<b>Tecnica</b>", style_table_header),
     Paragraph("<b>Perche non funziona</b>", style_table_header),
     Paragraph("<b>Fonte</b>", style_table_header)],
    [Paragraph("Obfuscation JS client-side", style_table_cell),
     Paragraph("Crackable in ore tramite de4js, webcrack, restringer reverse", style_table_cell),
     Paragraph("Eresus Security, Mozilla dev.to", style_table_cell)],
    [Paragraph("Anti-debugging devtools", style_table_cell),
     Paragraph("Bypassato con 'Search in folders' devtools", style_table_cell),
     Paragraph("Casi reali su Reddit r/Piracy", style_table_cell)],
    [Paragraph("HWID hard binding", style_table_cell),
     Paragraph("False positività + GDPR issues (dati biometrici)", style_table_cell),
     Paragraph("GDPR Art. 4 (14)", style_table_cell)],
    [Paragraph("EULA per SaaS web-first", style_table_cell),
     Paragraph("Serve SaaS Agreement (non EULA classica)", style_table_cell),
     Paragraph("law365.co.uk", style_table_cell)],
    [Paragraph("Client-side license check only", style_table_cell),
     Paragraph("Bypassabile modificando JS bundle", style_table_cell),
     Paragraph("Caso Output Arcade crackato FLARE", style_table_cell)],
]
no_work_tbl = Table(no_work_data, colWidths=[42*mm, 88*mm, 40*mm])
no_work_tbl.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), C_DANGER),
    ("TEXTCOLOR", (0,0), (-1,0), colors.white),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#FEE2E2")]),
    ("GRID", (0,0), (-1,-1), 0.4, C_BORDER),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("LEFTPADDING", (0,0), (-1,-1), 5),
    ("RIGHTPADDING", (0,0), (-1,-1), 5),
    ("TOPPADDING", (0,0), (-1,-1), 5),
    ("BOTTOMPADDING", (0,0), (-1,-1), 5),
]))
story.append(no_work_tbl)

story.append(Spacer(1, 5*mm))
story.append(Paragraph(
    "<b>Cosa FUNZIONA davvero:</b> spostare logica critica server-side (API routes Next.js), "
    "licensing server-checked (JWT firmato server, refresh ogni 24h), account-bound features "
    "(dati label e ranking accessibili solo via RLS Supabase con user_id match), watermarking "
    "per identificare leak, rate limiting API routes (Upstash Redis).",
    style_callout
))

story.append(PageBreak())

# ===================================================================
# 4. FASE 3 - PRICING
# ===================================================================
story.append(Paragraph("4. Fase 3: Pricing &amp; Business Model", style_h1))

story.append(Paragraph(
    "Per definire il pricing di LabelPulse e necessario analizzare i 2 competitor diretti "
    "(SubmitHub e Groover, entrambi pay-as-you-go per demo submission) e i SaaS music tool adiacenti "
    "(LANDR, DistroKid, Splice, Output Arcade, Beatport Link). Il modello dominante nel settore e "
    "subscription mensile $10-$30 (sweet spot music SaaS), con free trial standard 14-30 giorni e "
    "free tier permanente quasi assente. SubmitHub e Groover usano credito pay-as-you-go (~$1/invio) "
    "che diventa 5-10x piu costoso di una subscription illimitata per producer attivi (50+ demo/mese).",
    style_body
))

# 4.1 Analisi competitor
story.append(Paragraph("4.1 Analisi competitor (pricing reali 2025-2026)", style_h2))

comp_data = [
    [Paragraph("<b>Tool</b>", style_table_header),
     Paragraph("<b>Modello</b>", style_table_header),
     Paragraph("<b>Prezzo min</b>", style_table_header),
     Paragraph("<b>Free tier</b>", style_table_header)],
    [Paragraph("SubmitHub", style_table_cell),
     Paragraph("Crediti pay-as-you-go", style_table_cell),
     Paragraph("~$1/invio (bulk $0.80)", style_table_cell),
     Paragraph("No (credit-only)", style_table_cell)],
    [Paragraph("Groover", style_table_cell),
     Paragraph("Crediti pay-as-you-go", style_table_cell),
     Paragraph("€2/invio (1 Grooviz = €1)", style_table_cell),
     Paragraph("No", style_table_cell)],
    [Paragraph("LANDR", style_table_cell),
     Paragraph("Subscription mensile/annuale", style_table_cell),
     Paragraph("$12-25/mese", style_table_cell),
     Paragraph("No (trial 7gg)", style_table_cell)],
    [Paragraph("DistroKid", style_table_cell),
     Paragraph("Subscription annuale", style_table_cell),
     Paragraph("$23/anno", style_table_cell),
     Paragraph("No", style_table_cell)],
    [Paragraph("Splice", style_table_cell),
     Paragraph("Subscription mensile", style_table_cell),
     Paragraph("$13/mese", style_table_cell),
     Paragraph("Trial 14gg", style_table_cell)],
    [Paragraph("Output Arcade", style_table_cell),
     Paragraph("Subscription mensile/annuale", style_table_cell),
     Paragraph("$10-15/mese", style_table_cell),
     Paragraph("Trial 30gg", style_table_cell)],
    [Paragraph("Beatport Link", style_table_cell),
     Paragraph("Subscription mensile", style_table_cell),
     Paragraph("$7-15/mese", style_table_cell),
     Paragraph("Trial 14gg", style_table_cell)],
    [Paragraph("TuneCore", style_table_cell),
     Paragraph("Subscription annuale", style_table_cell),
     Paragraph("$20/anno", style_table_cell),
     Paragraph("No", style_table_cell)],
]
comp_tbl = Table(comp_data, colWidths=[35*mm, 45*mm, 45*mm, 45*mm])
comp_tbl.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), C_PRIMARY),
    ("TEXTCOLOR", (0,0), (-1,0), colors.white),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, C_BG_SOFT]),
    ("GRID", (0,0), (-1,-1), 0.4, C_BORDER),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("LEFTPADDING", (0,0), (-1,-1), 5),
    ("RIGHTPADDING", (0,0), (-1,-1), 5),
    ("TOPPADDING", (0,0), (-1,-1), 5),
    ("BOTTOMPADDING", (0,0), (-1,-1), 5),
]))
story.append(comp_tbl)

story.append(Spacer(1, 5*mm))
story.append(Paragraph(
    "<b>Opportunita LabelPulse:</b> SubmitHub e Groover costano ~$1-2 per ogni demo inviata. "
    "Un producer attivo che invia 50 demo/mese paga $50-100/mese solo per l'invio. Una subscription "
    "illimitata LabelPulse a €12-19/mese sarebbe 5-10x piu economica per questo segmento, "
    "mantenendo margini sani grazie alla automazione del pitch generation.",
    style_callout
))

# 4.2 Strategie
story.append(Paragraph("4.2 Tre strategie a confronto", style_h2))

strat_data = [
    [Paragraph("<b>Strategia</b>", style_table_header),
     Paragraph("<b>Struttura</b>", style_table_header),
     Paragraph("<b>Revenue @1000</b>", style_table_header),
     Paragraph("<b>Pro / Contro</b>", style_table_header)],
    [Paragraph("A. Freemium", style_table_cell),
     Paragraph("Free (5 demo/mese) + Pro €12/mese + Studio €29/mese", style_table_cell),
     Paragraph("€3.250/mese (mix 80/15/5)", style_table_cell),
     Paragraph("Top-of-funnel ampio, conversione bassa", style_table_cell)],
    [Paragraph("B. Trial 14gg", style_table_cell),
     Paragraph("Trial 14gg + €19/mese after", style_table_cell),
     Paragraph("€5.700/mese (30% conv)", style_table_cell),
     Paragraph("Revenue per user alto, funnel stretto", style_table_cell)],
    [Paragraph("C. Beta Lifetime", style_table_cell),
     Paragraph("Beta free 6 mesi + Lifetime Early Adopter €149", style_table_cell),
     Paragraph("€74.500 una tantum + €1.750/mese", style_table_cell),
     Paragraph("Cash upfront, gamification community", style_table_cell)],
]
strat_tbl = Table(strat_data, colWidths=[30*mm, 60*mm, 35*mm, 45*mm])
strat_tbl.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), C_PRIMARY),
    ("TEXTCOLOR", (0,0), (-1,0), colors.white),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, C_BG_SOFT]),
    ("GRID", (0,0), (-1,-1), 0.4, C_BORDER),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("LEFTPADDING", (0,0), (-1,-1), 5),
    ("RIGHTPADDING", (0,0), (-1,-1), 5),
    ("TOPPADDING", (0,0), (-1,-1), 5),
    ("BOTTOMPADDING", (0,0), (-1,-1), 5),
]))
story.append(strat_tbl)

# 4.3 Raccomandazione
story.append(Paragraph("4.3 Raccomandazione finale + revenue projection", style_h2))

story.append(Paragraph(
    "<b>Raccomandazione ibrida (C &rarr; A):</b> partire con Strategia C (beta free 6 mesi + lifetime "
    "Early Adopter a €149) per i primi 500 signup. Questo genera cash upfront (€74.500 una tantum) "
    "che copre i costi di infrastruttura (~$127/mese per 50 utenti) e permette di validare "
    "product-market fit senza pressione di conversione mensile. Al GA, transizione a Strategia A "
    "(freemium) mantenendo il lifetime EA come 'legacy tier' per i primi 500.",
    style_body
))

story.append(Paragraph(
    "<b>Evitare Strategia B</b> (trial 14gg + paid only) fino a 500 utenti paganti: il top-of-funnel "
    "e troppo stretto senza brand awareness. Producer che non conoscono LabelPulse non inseriscono "
    "carta di credito per provare. Meglio freemium con upgrade trigger basati su valore (es. dopo "
    "5 demo inviate nel mese gratuito, paywall Pro).",
    style_body
))

story.append(Paragraph(
    "<b>Revenue projection realistica (12 mesi):</b> "
    "Mese 1-3 (beta): 500 EA a €149 = €74.500 una tantum. "
    "Mese 4-6 (GA freemium): 200 free + 30 Pro a €12/mese = €360/mese + 10 Studio a €29/mese = €290/mese = €650/mese. "
    "Mese 7-12 (scaling): 1000 free + 150 Pro + 40 Studio = €1.800 + €1.160 = €2.960/mese. "
    "Annual run rate fine anno 1: ~€35K + €74.500 una tantum = €110K. "
    "Margine operativo stimato 70% (costo infrastruttura $127/mese + Stripe/LS fee 5% + 50¢).",
    style_callout
))

story.append(PageBreak())

# ===================================================================
# 5. FASE 4 - LEGALE
# ===================================================================
story.append(Paragraph("5. Fase 4: Conformita Legale EU/Italia", style_h1))

story.append(Paragraph(
    "Per vendere SaaS a utenti EU/italiani, LabelPulse deve rispettare 4 obblighi legali principali: "
    "GDPR (privacy policy + cookie consent + data processing records), Codice Consumo italiano "
    "(diritto di recesso 14gg per servizi digitali con checkbox esplicita di rinuncia), EULA/SaaS "
    "Agreement (termini di servizio), e VAT MOSS/OSS (gestito automaticamente da Lemon Squeezy come MoR). "
    "Lo stack consigliato e <b>iubenda Pro</b> (€29/mese) che copre privacy policy, cookie banner, "
    "termini di servizio, e consent records in un unico pacchetto, piu <b>wonder.legal</b> o "
    "<b>rocketlawyer.com</b> per NDA beta tester (template gratuiti).",
    style_body
))

legal_data = [
    [Paragraph("<b>Obbligo</b>", style_table_header),
     Paragraph("<b>Strumento</b>", style_table_header),
     Paragraph("<b>Costo</b>", style_table_header),
     Paragraph("<b>Stato LabelPulse</b>", style_table_header)],
    [Paragraph("Privacy policy GDPR", style_table_cell),
     Paragraph("iubenda Pro", style_table_cell),
     Paragraph("€29/mese", style_table_cell),
     Paragraph("Da implementare", style_table_cell)],
    [Paragraph("Cookie consent banner", style_table_cell),
     Paragraph("iubenda CookieYes / Osano", style_table_cell),
     Paragraph("Incluso iubenda Pro", style_table_cell),
     Paragraph("Da implementare", style_table_cell)],
    [Paragraph("Termini di servizio (SaaS Agreement)", style_table_cell),
     Paragraph("iubenda Pro + TermsFeed", style_table_cell),
     Paragraph("Incluso", style_table_cell),
     Paragraph("Da implementare", style_table_cell)],
    [Paragraph("Diritto recesso 14gg (art. 59 Codice Consumo)", style_table_cell),
     Paragraph("Checkbox esplicita rinuncia al checkout", style_table_cell),
     Paragraph("Free (dev)", style_table_cell),
     Paragraph("Da implementare entro 19/06/2026 (nuova legge EU)", style_table_cell)],
    [Paragraph("VAT MOSS/OSS EU", style_table_cell),
     Paragraph("Lemon Squeezy MoR (automatico)", style_table_cell),
     Paragraph("Incluso in 5% + 50¢", style_table_cell),
     Paragraph("Coperto da LS", style_table_cell)],
    [Paragraph("NDA beta tester (closed beta)", style_table_cell),
     Paragraph("wonder.legal / rocketlawyer", style_table_cell),
     Paragraph("Free template", style_table_cell),
     Paragraph("Da preparare se closed beta con NDA", style_table_cell)],
    [Paragraph("Data processing records (art. 30 GDPR)", style_table_cell),
     Paragraph("iubenda Pro + Supabase logs", style_table_cell),
     Paragraph("Incluso", style_table_cell),
     Paragraph("Da attivare", style_table_cell)],
]
legal_tbl = Table(legal_data, colWidths=[55*mm, 45*mm, 30*mm, 40*mm])
legal_tbl.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), C_PRIMARY),
    ("TEXTCOLOR", (0,0), (-1,0), colors.white),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, C_BG_SOFT]),
    ("GRID", (0,0), (-1,-1), 0.4, C_BORDER),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("LEFTPADDING", (0,0), (-1,-1), 5),
    ("RIGHTPADDING", (0,0), (-1,-1), 5),
    ("TOPPADDING", (0,0), (-1,-1), 5),
    ("BOTTOMPADDING", (0,0), (-1,-1), 5),
]))
story.append(legal_tbl)

story.append(Spacer(1, 5*mm))
story.append(Paragraph(
    "<b>Attenzione critica:</b> dal 19 giugno 2026 e obbligatorio in EU il pulsante di recesso "
    "elettronico per servizi digitali (fonte: potomaclaw.com). Per SaaS dove l'utente rinuncia al "
    "diritto di recesso (servizio digitale eseguito completamente), serve checkbox esplicita "
    "di rinuncia ai sensi dell'art. 59 lett. i del Codice del Consumo. iubenda gestisce questa "
    "checkbox automaticamente nel widget di consenso.",
    style_callout
))

story.append(PageBreak())

# ===================================================================
# 6. ROADMAP INTEGRATA
# ===================================================================
story.append(Paragraph("6. Roadmap integrata 30-60-90 giorni", style_h1))

roadmap_data = [
    [Paragraph("<b>Periodo</b>", style_table_header),
     Paragraph("<b>Azioni chiave</b>", style_table_header),
     Paragraph("<b>Output</b>", style_table_header)],
    [Paragraph("<b>Sett. 1<br/>(giorni 1-7)</b><br/>Setup tecnico", style_table_cell),
     Paragraph(
        "1. Installa Sentry (@sentry/nextjs), 2h<br/>"
        "2. Installa PostHog SDK, traccia 10 eventi chiave, abilita session replay + flag, 4h<br/>"
        "3. Crea Discord server privato + canali beta, 1h<br/>"
        "4. Canny board per feature request, 30min<br/>"
        "5. Verifica productionBrowserSourceMaps: false in next.config, 10min<br/>"
        "6. Sposta repo GitHub su privato, 5min<br/>"
        "7. Aggiungi tabella subscriptions + RLS Supabase, 2h<br/>"
        "8. Setup Lemon Squeezy account + webhook, 1h",
        style_table_cell),
     Paragraph(
        "Stack completo: error tracking + analytics + flag + community + billing ready",
        style_table_cell)],
    [Paragraph("<b>Sett. 2<br/>(giorni 8-14)</b><br/>Recruitment", style_table_cell),
     Paragraph(
        "1. Posta su BetaList (featured $129)<br/>"
        "2. Posta su r/WeAreTheMusicMakers + r/edmproduction (forma value-first)<br/>"
        "3. 20 DM mirate a producer su Reddit/Discord<br/>"
        "4. Apri screening questionnaire (Tally/Google Form)<br/>"
        "5. Setup iubenda Pro (privacy + cookie + terms)<br/>"
        "6. Prepara NDA template (wonder.legal) per closed beta<br/>"
        "7. Loom video 90s per onboarding",
        style_table_cell),
     Paragraph(
        "20-40 signup beta, screening completato, 15-25 tester selezionati, legale ready",
        style_table_cell)],
    [Paragraph("<b>Sett. 3-4<br/>(giorni 15-30)</b><br/>Closed Beta", style_table_cell),
     Paragraph(
        "1. Invita 15-25 tester selezionati<br/>"
        "2. Email welcome (template) + invito Discord<br/>"
        "3. Kickoff call collettiva 30min (record + share)<br/>"
        "4. Check-in settimanale email<br/>"
        "5. Traccia funnel + bug rate + NPS dopo 14gg<br/>"
        "6. Implementa API route /api/license/verify con JWT<br/>"
        "7. Watermarking build (hash user_id in bundle)",
        style_table_cell),
     Paragraph(
        "Beta attiva, primi feedback raccolti, sistema licensing funzionante",
        style_table_cell)],
    [Paragraph("<b>Sett. 5-8<br/>(giorni 31-60)</b><br/>Iterazione", style_table_cell),
     Paragraph(
        "1. Triage bug + feature request su Canny<br/>"
        "2. Implementa fix prioritari (P0/P1)<br/>"
        "3. Check-in biweekly email<br/>"
        "4. Wrap-up survey a 45gg<br/>"
        "5. Valida 5 metriche graduation (NPS, bug rate, retention)<br/>"
        "6. Se 4/5 verdi &rarr; apri open beta (50-200 tester)<br/>"
        "7. Apri BetaList featured + FB group posting",
        style_table_cell),
     Paragraph(
        "Decisione GO/NO-GO per GA, eventuale open beta launch",
        style_table_cell)],
    [Paragraph("<b>Sett. 9-12<br/>(giorni 61-90)</b><br/>GA + Monetizzazione", style_table_cell),
     Paragraph(
        "1. Setup Lemon Squeezy products: Pro €12/mese, Studio €29/mese, Lifetime EA €149<br/>"
        "2. Paywall UI: dopo 5 demo/mese nel free tier<br/>"
        "3. Email 500 early adopter per Lifetime EA<br/>"
        "4. Landing page pubblica con pricing<br/>"
        "5. Public launch su BetaList + Product Hunt<br/>"
        "6. Monitoraggio conversione + churn primi 30gg<br/>"
        "7. If MRR &gt;$5K &rarr; pianifica migrazione Stripe Billing",
        style_table_cell),
     Paragraph(
        "GA live, primi 500 paying users, revenue tracking attivo",
        style_table_cell)],
]
roadmap_tbl = Table(roadmap_data, colWidths=[30*mm, 100*mm, 40*mm])
roadmap_tbl.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), C_PRIMARY),
    ("TEXTCOLOR", (0,0), (-1,0), colors.white),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, C_BG_SOFT]),
    ("GRID", (0,0), (-1,-1), 0.4, C_BORDER),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("LEFTPADDING", (0,0), (-1,-1), 5),
    ("RIGHTPADDING", (0,0), (-1,-1), 5),
    ("TOPPADDING", (0,0), (-1,-1), 5),
    ("BOTTOMPADDING", (0,0), (-1,-1), 5),
]))
story.append(roadmap_tbl)

story.append(PageBreak())

# ===================================================================
# 7. CHECKLIST AZIONI IMMEDIATE
# ===================================================================
story.append(Paragraph("7. Checklist azioni immediate (settimana 1)", style_h1))

story.append(Paragraph(
    "Queste sono le 7 azioni concrete da eseguire entro la fine della prima settimana. "
    "Sono ordinate per priorita e tempo stimato. Tutte sono prerequisite per aprire la closed beta.",
    style_body
))

checklist_items = [
    ("REPO PRIVATO", "Sposta repo GitHub LabelPulse su privato (Settings &rarr; General &rarr; Change visibility). 5 minuti. Costo: $0.", C_OK),
    ("SENTRY INSTALL", "Installa @sentry/nextjs, configura sentry.{client,server,edge}.config.ts, setta SENTRY_DSN in Vercel env. 2 ore. Costo: $0 (free 5K errori/mese).", C_OK),
    ("POSTHOG INSTALL", "Installa posthog-js, traccia 10 eventi chiave (signed_up, onboarding_completed, profile_created, first_label_added, first_demo_added, first_pitch_generated, demo_sent, feedback_submitted, push_enabled, weekly_recap_received). 4 ore. Costo: $0 (free 1M eventi/mese).", C_OK),
    ("DISCORD SERVER", "Crea Discord server labelpulse-beta con canali #beta-announcements, #bug-reports, #feature-requests, #general. 1 ora. Costo: $0.", C_OK),
    ("CANNY BOARD", "Crea board Canny gratuita (labelpulse.canny.io) per feature request pubblica. 30 minuti. Costo: $0 (fino a 100 MAU).", C_OK),
    ("SUPABASE SUBSCRIPTIONS TABLE", "Aggiungi tabella subscriptions in Supabase con RLS (user_id match). Schema: user_id, plan, status, current_period_end, cancel_at_period_end, lemon_squeezy_id. 2 ore. Costo: $0.", C_OK),
    ("IUBENDA PRO", "Attiva iubenda Pro (€29/mese) per privacy policy + cookie banner + terms GDPR-compliant. Integra script in layout.tsx. 2 ore. Costo: €29/mese.", C_WARN),
]

for i, (title, desc, color) in enumerate(checklist_items, 1):
    item_data = [[
        Paragraph(f"<b><font color='white'>[{i}]</font></b>",
                  ParagraphStyle("C", parent=style_table_cell, alignment=TA_CENTER, fontName=BOLD_FONT)),
        Paragraph(f"<b>{title}</b><br/>{desc}", style_table_cell),
    ]]
    item_tbl = Table(item_data, colWidths=[12*mm, 158*mm])
    item_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (0,0), color),
        ("BACKGROUND", (1,0), (1,0), colors.white),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("ALIGN", (0,0), (0,0), "CENTER"),
        ("BOX", (0,0), (-1,-1), 0.4, C_BORDER),
        ("INNERGRID", (0,0), (-1,-1), 0.4, C_BORDER),
        ("LEFTPADDING", (1,0), (1,0), 8),
        ("RIGHTPADDING", (1,0), (1,0), 8),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]))
    story.append(item_tbl)
    story.append(Spacer(1, 3*mm))

story.append(Spacer(1, 8*mm))
story.append(Paragraph(
    "<b>Tempo totale stimato:</b> ~12 ore di lavoro full-time + €29/mese iubenda + $0 per Sentry/PostHog/Canny/Discord. "
    "Al termine di queste 7 azioni LabelPulse e tecnicamente pronto per aprire la closed beta con 15-25 tester selezionati.",
    style_callout
))

story.append(Spacer(1, 8*mm))
story.append(Paragraph(
    "Per dettagli completi su ogni sezione, riferimenti ai report integrali in: "
    "/home/z/my-project/research-output/report-beta-testing.md (383 righe), "
    "/home/z/my-project/research-output/licensing-security-report.md (541 righe), "
    "/home/z/my-project/research-output/pricing-models-report.md (competitor analysis).",
    style_small
))

# --- Build ---
doc.build(story)

# --- Stats ---
size = os.path.getsize(OUTPUT_PATH)
print(f"OK: {OUTPUT_PATH}")
print(f"Size: {size:,} bytes ({size/1024:.1f} KB)")
