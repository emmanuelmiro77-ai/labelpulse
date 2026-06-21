# Pipeline Test Log

Questo file traccia i test della pipeline CI/CD GitHub Action → Vercel.

## 2026-06-21 — Test #1: pipeline end-to-end

Scope: verificare che un push qualsiasi su `main` triggeri automaticamente:
1. GitHub Action `Deploy to Vercel`
2. La Action chiami il Vercel Deploy Hook (HTTP 201 expected)
3. Vercel crei un nuovo deployment con stato Ready

Se tutto funziona, su https://github.com/emmanuelmiro77-ai/labelpulse/actions
vediamo l'ultima run con ✓ verde entro ~10 secondi dal push, e su
https://vercel.com/emmanuel-betquant/labelpulse/deployments vediamo un nuovo
deployment "Ready" entro ~1 minuto dal push.

Se invece vediamo la run rossa o il deployment non appare, la prima cosa da
controllare è il log della Action (HTTP code di Vercel) e poi il tab
Deployments su Vercel per vedere se ci sono errori di build.
