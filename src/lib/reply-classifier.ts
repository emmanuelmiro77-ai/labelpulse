/**
 * Reply classifier — multi-language (EN/IT/DE/FR/ES) detection of label
 * response types from email subject + body.
 *
 * Categories:
 *  - ack       : Auto-acknowledgement ("we received your demo", "vielen dank für
 *                deine demo", "grazie per l'invio"). No human review yet.
 *  - info      : Label asks for more info / different format ("can you send a
 *                WAV?", "potresti mandare il file in alta qualità?").
 *  - positive  : Genuine interest / accept ("we love it", "we'd like to sign",
 *                "ci piace molto").
 *  - rejected  : Polite or direct rejection ("unfortunately not for us",
 *                "leider keine passend", "non è quello che cerchiamo").
 *  - none      : Cannot classify (probably keep status as-is and surface the
 *                raw text to the user).
 *
 * The classifier uses tiered scoring: each pattern contributes points to one
 * or more categories, the highest-scoring category wins, with a minimum
 * threshold to avoid false positives.
 *
 * Patterns are designed to be **recall-biased** (catch as many real replies
 * as possible) and then **precision-filtered** (require at least 2 distinct
 * pattern hits OR a very strong single hit).
 */

export type ReplyClassification =
  | "ack"
  | "info"
  | "positive"
  | "rejected"
  | "none";

export interface ClassificationResult {
  category: ReplyClassification;
  confidence: number; // 0..1
  matchedPatterns: string[]; // for debugging / surfacing to the user
  detectedLanguage: "en" | "it" | "de" | "fr" | "es" | "unknown";
}

interface Pattern {
  regex: RegExp;
  category: Exclude<ReplyClassification, "none">;
  weight: number; // 1 = weak signal, 2 = medium, 3 = strong
  label: string; // human-readable, for matchedPatterns
}

// ----- Language detection (cheap heuristic) -----

function detectLanguage(text: string): ClassificationResult["detectedLanguage"] {
  const lower = text.toLowerCase();
  // Sample first 400 chars — greetings + first paragraph usually enough
  const sample = lower.slice(0, 400);

  const langScores: Record<string, number> = { en: 0, it: 0, de: 0, fr: 0, es: 0 };

  // Italian markers
  if (/\bgrazie\b/.test(sample)) langScores.it += 2;
  if (/\bciao\b/.test(sample)) langScores.it += 2;
  if (/\bsalve\b/.test(sample)) langScores.it += 2;
  if (/\bper il tuo invio\b/.test(sample)) langScores.it += 3;
  if (/\bnon è quello che cerchiamo\b/.test(sample)) langScores.it += 3;
  if (/\bti faremo sapere\b/.test(sample)) langScores.it += 3;
  if (/\bpurtroppo\b/.test(sample)) langScores.it += 1;

  // German markers
  if (/\bvielen dank\b/.test(sample)) langScores.de += 3;
  if (/\bhallo\b/.test(sample)) langScores.de += 1;
  if (/\bliebe[rn]?\b/.test(sample)) langScores.de += 2;
  if (/\bfür (deine|ihre) demo\b/.test(sample)) langScores.de += 3;
  if (/\bwir (werden|müssen)\b/.test(sample)) langScores.de += 2;
  if (/\bleider\b/.test(sample)) langScores.de += 2;
  if (/\bmit freundlichen grüßen\b/.test(sample)) langScores.de += 2;

  // French markers
  if (/\bmerci (beaucoup|pour)\b/.test(sample)) langScores.fr += 3;
  if (/\bbonjour\b/.test(sample)) langScores.fr += 2;
  if (/\bcordialement\b/.test(sample)) langScores.fr += 1;
  if (/\bmalheureusement\b/.test(sample)) langScores.fr += 3;
  if (/\bnous (allons|allons)\b/.test(sample)) langScores.fr += 1;

  // Spanish markers
  if (/\bgracias (por|por tu)\b/.test(sample)) langScores.es += 3;
  if (/\bhola\b/.test(sample)) langScores.es += 2;
  if (/\bal Saludo\b/.test(sample)) langScores.es += 1;
  if (/\blamentablemente\b/.test(sample)) langScores.es += 3;
  if (/\bvamos a\b/.test(sample)) langScores.es += 1;

  // English markers (last so we don't double-count)
  if (/\bthank you (for|so much)\b/.test(sample)) langScores.en += 3;
  if (/\bthanks (for|again)\b/.test(sample)) langScores.en += 2;
  if (/\bdear\b/.test(sample)) langScores.en += 1;
  if (/\bregards\b/.test(sample)) langScores.en += 1;
  if (/\bkind regards\b/.test(sample)) langScores.en += 2;
  if (/\bunfortunately\b/.test(sample)) langScores.en += 2;
  if (/\bwe'll get back to you\b/.test(sample)) langScores.en += 3;
  if (/\bwe received your (demo|submission)\b/.test(sample)) langScores.en += 3;

  // Pick top language
  const sorted = Object.entries(langScores).sort((a, b) => b[1] - a[1]);
  if (sorted[0][1] === 0) return "unknown";
  return sorted[0][0] as ClassificationResult["detectedLanguage"];
}

// ----- Pattern catalogue -----

const PATTERNS: Pattern[] = [
  // ===== ACK patterns (auto-acknowledgement, no human review yet) =====
  {
    regex: /we have received (your|the) (demo|submission|track)/i,
    category: "ack",
    weight: 3,
    label: "EN: we have received your demo",
  },
  {
    regex: /we received your (demo|submission|track)/i,
    category: "ack",
    weight: 3,
    label: "EN: we received your demo",
  },
  {
    regex: /thank you for (sending|submitting) your (demo|track|music)/i,
    category: "ack",
    weight: 3,
    label: "EN: thank you for sending your demo",
  },
  {
    regex: /thanks for (your|reaching out|sending) your (demo|track|music)/i,
    category: "ack",
    weight: 2,
    label: "EN: thanks for your demo",
  },
  {
    regex: /we'?ll get back to you (within|in|as soon as)/i,
    category: "ack",
    weight: 3,
    label: "EN: we'll get back to you within",
  },
  {
    regex: /we will (review|listen to) (your|the) (demo|track|submission)/i,
    category: "ack",
    weight: 2,
    label: "EN: we will review your demo",
  },
  {
    regex: /our (a&?r|team) will (review|listen)/i,
    category: "ack",
    weight: 2,
    label: "EN: our A&R will review",
  },
  {
    regex: /this is an? (auto|automated) (reply|response|confirmation)/i,
    category: "ack",
    weight: 3,
    label: "EN: automated response",
  },
  {
    regex: /please do not reply to this (automated|email)/i,
    category: "ack",
    weight: 3,
    label: "EN: do not reply (automated)",
  },
  // Italian ACK
  {
    regex: /grazie per (l'?invio|aver inviato|la tua demo|il tuo invio)/i,
    category: "ack",
    weight: 3,
    label: "IT: grazie per l'invio",
  },
  {
    regex: /abbiamo ricevuto la tua demo/i,
    category: "ack",
    weight: 3,
    label: "IT: abbiamo ricevuto la tua demo",
  },
  {
    regex: /ti faremo sapere (entro|il prima possibile)/i,
    category: "ack",
    weight: 3,
    label: "IT: ti faremo sapere entro",
  },
  {
    regex: /il nostro team (valuterà|ascolterà)/i,
    category: "ack",
    weight: 2,
    label: "IT: il nostro team valuterà",
  },
  // German ACK
  {
    regex: /vielen dank (für|fuer) (deine|ihre|ihre) demo/i,
    category: "ack",
    weight: 3,
    label: "DE: vielen dank für deine demo",
  },
  {
    regex: /vielen dank für (deine|ihre) einsendung/i,
    category: "ack",
    weight: 3,
    label: "DE: vielen dank für einsendung",
  },
  {
    regex: /wir haben deine demo erhalten/i,
    category: "ack",
    weight: 3,
    label: "DE: wir haben deine demo erhalten",
  },
  {
    regex: /wir (werden|müssen) (deine|ihre) demo (anhören|bewerten|prüfen)/i,
    category: "ack",
    weight: 2,
    label: "DE: wir werden deine demo anhören",
  },
  {
    regex: /wir melden uns (bei dir|innerhalb)/i,
    category: "ack",
    weight: 3,
    label: "DE: wir melden uns bei dir",
  },
  {
    regex: /dies ist eine (automatische|automatisierte) (antwort|bestätigung)/i,
    category: "ack",
    weight: 3,
    label: "DE: dies ist eine automatische antwort",
  },
  // French ACK
  {
    regex: /merci (beaucoup )?pour (ton|votre) (demo|envoi|submission)/i,
    category: "ack",
    weight: 3,
    label: "FR: merci pour ton demo",
  },
  {
    regex: /nous avons bien reçu (ton|votre) demo/i,
    category: "ack",
    weight: 3,
    label: "FR: nous avons bien reçu ton demo",
  },
  {
    regex: /nous reviendrons vers vous/i,
    category: "ack",
    weight: 3,
    label: "FR: nous reviendrons vers vous",
  },
  // Spanish ACK
  {
    regex: /gracias por (tu|enviar|su) demo/i,
    category: "ack",
    weight: 3,
    label: "ES: gracias por tu demo",
  },
  {
    regex: /hemos recibido (tu|su) demo/i,
    category: "ack",
    weight: 3,
    label: "ES: hemos recibido tu demo",
  },
  {
    regex: /nos pondremos en contacto contigo/i,
    category: "ack",
    weight: 3,
    label: "ES: nos pondremos en contacto",
  },

  // ===== INFO request patterns (label asking for more info / format change) =====
  {
    regex: /can you (send|provide|share) (us )?(a |the )?(wav|lossless|high.quality|stems)/i,
    category: "info",
    weight: 3,
    label: "EN: can you send a WAV/lossless",
  },
  {
    regex: /could you (send|provide|share) (us )?(more|additional) (info|details)/i,
    category: "info",
    weight: 3,
    label: "EN: could you provide more info",
  },
  {
    regex: /we (need|would like|would love) (more|additional) (info|details|information)/i,
    category: "info",
    weight: 2,
    label: "EN: we need more info",
  },
  {
    regex: /please (send|provide|share) (us )?(the )?(stems|wav|project file)/i,
    category: "info",
    weight: 3,
    label: "EN: please send stems/wav",
  },
  {
    regex: /what'?s your (price|budget|asking price)/i,
    category: "info",
    weight: 2,
    label: "EN: what's your price",
  },
  {
    regex: /are you (available|open) for (an exclusive|a remix)/i,
    category: "info",
    weight: 2,
    label: "EN: are you available for exclusive/remix",
  },
  // Italian INFO
  {
    regex: /potresti (inviarci|mandarci|mandare) (il |un )?(file in alta qualità|wav|stems|progetto)/i,
    category: "info",
    weight: 3,
    label: "IT: potresti mandare il WAV/stems",
  },
  {
    regex: /avremo bisogno di (più|ulteriori) (informazioni|dettagli)/i,
    category: "info",
    weight: 3,
    label: "IT: avremo bisogno di più info",
  },
  {
    regex: /potresti dirci (di più|qualcosa in più)/i,
    category: "info",
    weight: 2,
    label: "IT: potresti dirci di più",
  },
  // German INFO
  {
    regex: /kannst du uns (bitte )?(eine wav|die stems|das projekt)/i,
    category: "info",
    weight: 3,
    label: "DE: kannst du uns eine wav senden",
  },
  {
    regex: /wir (brauchen|benötigen) (mehr|weitere) (informationen|details)/i,
    category: "info",
    weight: 3,
    label: "DE: wir brauchen mehr informationen",
  },
  // French INFO
  {
    regex: /peux.tu (nous envoyer|nous fournir) (un wav|les stems)/i,
    category: "info",
    weight: 3,
    label: "FR: peux-tu nous envoyer un wav",
  },
  {
    regex: /nous (aurions besoin|voudrions) de plus d'informations/i,
    category: "info",
    weight: 3,
    label: "FR: nous aurions besoin de plus d'infos",
  },

  // ===== POSITIVE patterns (genuine interest / signing intent) =====
  {
    regex: /we (love|really like|are loving) (it|this|your (track|demo))/i,
    category: "positive",
    weight: 3,
    label: "EN: we love it",
  },
  {
    regex: /we'?d (like|love) to (sign|release|put out) (it|this|your (track|demo))/i,
    category: "positive",
    weight: 3,
    label: "EN: we'd like to sign it",
  },
  {
    regex: /we (want|would love) to (sign|release|put out)/i,
    category: "positive",
    weight: 3,
    label: "EN: we want to sign",
  },
  {
    regex: /great (track|demo|work|production)/i,
    category: "positive",
    weight: 2,
    label: "EN: great track",
  },
  {
    regex: /this is (excellent|amazing|incredible|fantastic|fire)/i,
    category: "positive",
    weight: 2,
    label: "EN: this is amazing",
  },
  {
    regex: /let'?s (schedule|set up) (a|the) call/i,
    category: "positive",
    weight: 3,
    label: "EN: let's schedule a call",
  },
  {
    regex: /can we (jump on|set up) a (quick )?call/i,
    category: "positive",
    weight: 3,
    label: "EN: can we jump on a call",
  },
  {
    regex: /we are interested (in signing|in releasing|in your music)/i,
    category: "positive",
    weight: 3,
    label: "EN: we are interested in signing",
  },
  {
    regex: /forwarding this to (our|the) (a&?r|label head)/i,
    category: "positive",
    weight: 2,
    label: "EN: forwarding to A&R",
  },
  {
    regex: /we'?d love to (hear more|see what else you have)/i,
    category: "positive",
    weight: 2,
    label: "EN: we'd love to hear more",
  },
  // Italian POSITIVE
  {
    regex: /ci piace (molto|davvero|tanto) (il|questo) (brano|demo|traccia)/i,
    category: "positive",
    weight: 3,
    label: "IT: ci piace molto il brano",
  },
  {
    regex: /vorremmo (firmarlo|pubblicarlo|rilasciarlo)/i,
    category: "positive",
    weight: 3,
    label: "IT: vorremmo firmarlo",
  },
  {
    regex: /siamo interessati a (firmare|pubblicare)/i,
    category: "positive",
    weight: 3,
    label: "IT: siamo interessati a firmare",
  },
  {
    regex: /ottimo (lavoro|brano|demo)/i,
    category: "positive",
    weight: 2,
    label: "IT: ottimo lavoro",
  },
  {
    regex: /facciamo una (chiamata|call)/i,
    category: "positive",
    weight: 3,
    label: "IT: facciamo una chiamata",
  },
  // German POSITIVE
  {
    regex: /wir (lieben|mögen sehr) (dein|ihren) (track|demo)/i,
    category: "positive",
    weight: 3,
    label: "DE: wir lieben deinen track",
  },
  {
    regex: /wir (möchten|würden gerne) (deinen|ihren) track (veröffentlichen|signen|bringen)/i,
    category: "positive",
    weight: 3,
    label: "DE: wir möchten deinen track veröffentlichen",
  },
  {
    regex: /großartige (arbeit|track|demo)/i,
    category: "positive",
    weight: 2,
    label: "DE: großartige arbeit",
  },
  {
    regex: /lass uns (einen call|telefonieren)/i,
    category: "positive",
    weight: 3,
    label: "DE: lass uns einen call",
  },

  // ===== REJECTED patterns (polite or direct rejection) =====
  {
    regex: /unfortunately (it|this|your demo) (is|was|'?s)? ?(not|n't) (for us|what we'?re looking for|a (good )?fit)/i,
    category: "rejected",
    weight: 3,
    label: "EN: unfortunately not for us",
  },
  {
    regex: /unfortunately (we|'?i)? ?(can|will)'?t (be able to )?(sign|release|take)/i,
    category: "rejected",
    weight: 3,
    label: "EN: unfortunately we can't sign",
  },
  {
    regex: /not (quite )?(what we'?re looking for|the right fit|for us)/i,
    category: "rejected",
    weight: 3,
    label: "EN: not what we're looking for",
  },
  {
    regex: /we (are|'?re) (going to|gonna) (pass|decline)/i,
    category: "rejected",
    weight: 3,
    label: "EN: we're going to pass",
  },
  {
    regex: /we (cannot|can'?t|won'?t) (sign|release|take on|accept) (it|this|your (demo|track))/i,
    category: "rejected",
    weight: 3,
    label: "EN: we can't sign",
  },
  {
    regex: /decline your (demo|submission|track)/i,
    category: "rejected",
    weight: 3,
    label: "EN: decline your demo",
  },
  {
    regex: /doesn'?t (fit|match) our (current )?(roster|catalog|sound|style)/i,
    category: "rejected",
    weight: 3,
    label: "EN: doesn't fit our roster",
  },
  {
    regex: /we receive(d)? (a lot of|too many) (demos|submissions)/i,
    category: "rejected",
    weight: 2,
    label: "EN: we receive too many demos (often in rejections)",
  },
  // Italian REJECTED
  {
    regex: /purtroppo non è (quello che|il (genere|tipo) di) (musica|brano) (che|che stiamo) cercando/i,
    category: "rejected",
    weight: 3,
    label: "IT: purtroppo non è quello che cerchiamo",
  },
  {
    regex: /non è (adatto|in linea) con il nostro (catalogo|stile)/i,
    category: "rejected",
    weight: 3,
    label: "IT: non è adatto al nostro catalogo",
  },
  {
    regex: /non siamo interessati a (firmarlo|pubblicarlo)/i,
    category: "rejected",
    weight: 3,
    label: "IT: non siamo interessati",
  },
  {
    regex: /non possiamo (firmare|pubblicare|accettare)/i,
    category: "rejected",
    weight: 3,
    label: "IT: non possiamo firmare",
  },
  {
    regex: /dobbiamo (passare|declinare)/i,
    category: "rejected",
    weight: 2,
    label: "IT: dobbiamo passare",
  },
  // German REJECTED
  {
    regex: /leider (ist|ist es|nicht) (nicht )?(das was wir suchen|passt (es|nicht) (nicht )?zu uns)/i,
    category: "rejected",
    weight: 3,
    label: "DE: leider nicht das was wir suchen",
  },
  {
    regex: /leider (keine|nicht) passend/i,
    category: "rejected",
    weight: 3,
    label: "DE: leider keine passend",
  },
  {
    regex: /leider (können|passen) wir (deinen|ihren) track (nicht|nicht (signen|veröffentlichen))/i,
    category: "rejected",
    weight: 3,
    label: "DE: leider können wir deinen track nicht",
  },
  {
    regex: /passt (leider )?nicht zu (unserem|uns)/i,
    category: "rejected",
    weight: 3,
    label: "DE: passt nicht zu uns",
  },
  {
    regex: /wir müssen (leider )?(absagen|ablehnen)/i,
    category: "rejected",
    weight: 2,
    label: "DE: wir müssen leider absagen",
  },
  // French REJECTED
  {
    regex: /malheureusement (ce n'est|n'est) pas (ce que|le genre)/i,
    category: "rejected",
    weight: 3,
    label: "FR: malheureusement ce n'est pas",
  },
  {
    regex: /malheureusement (nous ne|ne) pouvons (pas )?(signer|publier)/i,
    category: "rejected",
    weight: 3,
    label: "FR: malheureusement nous ne pouvons signer",
  },
  // Spanish REJECTED
  {
    regex: /lamentablemente no es (lo que|el tipo)/i,
    category: "rejected",
    weight: 3,
    label: "ES: lamentablemente no es lo que buscamos",
  },
  {
    regex: /no podemos (firmar|publicar|aceptar)/i,
    category: "rejected",
    weight: 3,
    label: "ES: no podemos firmar",
  },
];

// ----- Main classifier -----

/**
 * Classify a label reply. Pass both subject and body — subject often
 * carries "Re:" + original subject, body carries the actual response.
 *
 * Returns the highest-scoring category, plus matched patterns for transparency.
 */
export function classifyReply(subject: string, body: string): ClassificationResult {
  const combined = `${subject}\n${body}`;
  const language = detectLanguage(combined);

  const scores: Record<Exclude<ReplyClassification, "none">, number> = {
    ack: 0,
    info: 0,
    positive: 0,
    rejected: 0,
  };
  const matchedByCategory: Record<Exclude<ReplyClassification, "none">, string[]> = {
    ack: [],
    info: [],
    positive: [],
    rejected: [],
  };

  for (const p of PATTERNS) {
    if (p.regex.test(combined)) {
      scores[p.category] += p.weight;
      matchedByCategory[p.category].push(p.label);
    }
  }

  // Pick top category
  const entries = Object.entries(scores) as [Exclude<ReplyClassification, "none">, number][];
  entries.sort((a, b) => b[1] - a[1]);
  const [topCategory, topScore] = entries[0];

  // Need at least 2 points to commit to a classification
  if (topScore < 2) {
    return {
      category: "none",
      confidence: 0,
      matchedPatterns: [],
      detectedLanguage: language,
    };
  }

  // Confidence: 0..1 based on score gap vs second-best
  const secondScore = entries[1][1];
  const gap = topScore - secondScore;
  const confidence = Math.min(1, topScore / 5 + gap * 0.15);

  // Dedupe matched patterns
  const uniqueMatches = Array.from(new Set(matchedByCategory[topCategory]));

  return {
    category: topCategory,
    confidence,
    matchedPatterns: uniqueMatches,
    detectedLanguage: language,
  };
}

// ----- Helpers for surfacing to the user -----

export const REPLY_CATEGORY_LABELS: Record<
  Exclude<ReplyClassification, "none">,
  { it: string; en: string; color: string }
> = {
  ack: {
    it: "ACK ricevuto",
    en: "ACK received",
    color: "text-blue-400",
  },
  info: {
    it: "Richiesta info",
    en: "Info request",
    color: "text-amber-400",
  },
  positive: {
    it: "Risposta positiva",
    en: "Positive reply",
    color: "text-emerald-400",
  },
  rejected: {
    it: "Rifiutata",
    en: "Rejected",
    color: "text-red-400",
  },
};
