/**
 * Shared Pitch Generation Utilities
 * Supports multiple languages and mailto: link generation
 */

export type PitchTone = "professional" | "confident" | "friendly" | "storytelling";
export type PitchLanguage = "en" | "it" | "es" | "fr" | "de" | "pt";

/**
 * Pitch shape — controls how the body template is structured.
 *  • "single"      — traditional single-track pitch (default).
 *  • "ep-single"   — whole EP with ONE SoundCloud link (album/private set).
 *  • "ep-multi"    — multi-track pitch where each track has its own SC link,
 *                    and the format is left open (EP / separate singles / label
 *                    picks the strongest track). Used when the user has NOT
 *                    created a single SC album URL yet.
 */
export type PitchShape = "single" | "ep-single" | "ep-multi";

export const PITCH_LANGUAGES: Record<PitchLanguage, string> = {
  en: "English",
  it: "Italiano",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
};

export type TrackStatus = "awaiting" | "reviewing" | "accepted" | "rejected" | "signed" | "declined";

/**
 * Represents a track entry in an EP pitch — used by ep-multi templates so
 * each track has its own name + SoundCloud link, properly attributed.
 */
export interface PitchTrackEntry {
  trackName: string;
  artistName: string;        // primary artist (+ collaborators, already joined)
  scLink: string;            // direct SoundCloud link to THIS track
  status?: TrackStatus;      // track status (granular track-by-track)
}

/**
 * Generate the email body text for a pitch in the specified language and tone.
 *
 * The `shape` parameter controls the overall structure:
 *  • "single"    — single-track pitch (trackName + scLink + customNote)
 *  • "ep-single" — whole-EP pitch with a single SoundCloud album URL.
 *                  `trackName` is the EP title, `scLink` is the album URL,
 *                  `customNote` typically contains the tracklist (names only).
 *  • "ep-multi"  — multi-track pitch where each track has its own SC link.
 *                  `trackName` is the EP title (or "EP (N tracks)"),
 *                  `epTracks` carries the per-track entries, `customNote`
 *                  is a free-form user note. The body lists every track
 *                  with its own link, and explicitly leaves the format
 *                  open ("EP, separate singles, or whichever track
 *                  resonates — we're open to discussing it").
 *
 * For backward compatibility, `shape` defaults to "single" and `epTracks`
 * is optional — existing callers that don't pass them keep working.
 */
function generateBody(
  labelName: string,
  trackName: string,
  artistName: string,
  scLink: string,
  tone: PitchTone,
  customNote: string,
  lang: PitchLanguage,
  shape: PitchShape = "single",
  epTracks?: PitchTrackEntry[]
): string {
  const artist = artistName.trim();
  const isEpSingle = shape === "ep-single";
  const isEpMulti = shape === "ep-multi";

  // === EP single-link (album URL on SoundCloud) ===
  // The whole EP is one continuous album/private set; the label listens
  // to it as a single piece. The body uses "my latest EP" language and
  // references one link. If epTracks is provided, we add a "Tracklist:"
  // section with just the names (no per-track links — redundant with the
  // album URL).
  if (isEpSingle) {
    const epLink = scLink.trim() || (lang === "it" ? "[Il tuo link EP SoundCloud]" : lang === "es" ? "[Tu enlace EP de SoundCloud]" : lang === "fr" ? "[Votre lien EP SoundCloud]" : lang === "de" ? "[Ihr EP SoundCloud-Link]" : lang === "pt" ? "[Seu link EP do SoundCloud]" : "[Your EP SoundCloud link]");
    const tracklistText = (epTracks && epTracks.length > 0)
      ? epTracks.map((t, i) => `${i + 1}. ${t.trackName}${t.artistName && t.artistName !== artist ? ` — ${t.artistName}` : ""}`).join("\n")
      : "";
    if (lang === "it") {
      const opening = tone === "confident"
        ? `Hey Team ${labelName},\n\nVi mando il mio EP "${trackName}" perché credo sia esattamente ciò di cui ${labelName} ha bisogno in questo momento.`
        : tone === "friendly"
          ? `Ehi ${labelName}!\n\nHo un EP fresco per voi — "${trackName}" — e penso davvero che vi piacerà.`
          : tone === "storytelling"
            ? `Gentile Team ${labelName},\n\nAlcuni EP nascono in studio — altri vengono da un posto più profondo. "${trackName}" è di quelli.`
            : `Gentile Team ${labelName},\n\nVi contatto per sottoporre alla vostra attenzione il mio EP "${trackName}" per una possibile pubblicazione su ${labelName}.`;
      const middle = `${artist ? `Produco con il nome d'arte ${artist}, e ` : ""}credo che questo lavoro si allinei perfettamente all'identità sonora e alla direzione artistica della label. L'EP è pensato come un viaggio continuo, da ascoltare nella sua interezza.`;
      const closing = `${customNote.trim() ? `Contesto aggiuntivo: ${customNote.trim()}\n\n` : ""}Sarei davvero grato per l'opportunità di discuterne. Grazie per il vostro tempo.\n\nCordiali saluti,\n${artist || "Produttore Indipendente"}`;
      return `${opening}\n\n${middle}\n\nPotete ascoltare l'EP completo al seguente link:\n${epLink}${tracklistText ? `\n\nTracklist:\n${tracklistText}` : ""}\n\n${closing}`;
    }
    // English fallback (also covers es/fr/de/pt with translated link placeholder above)
    const opening = tone === "confident"
      ? `Hey ${labelName} Team,\n\nI'm sending you my EP "${trackName}" because I believe this is exactly what ${labelName} needs right now.`
      : tone === "friendly"
        ? `Hey ${labelName}!\n\nI've got a fresh EP for you — "${trackName}" — and I genuinely think you're going to dig it.`
        : tone === "storytelling"
          ? `Dear ${labelName} Team,\n\nSome EPs come from the studio — others come from somewhere deeper. "${trackName}" is the latter.`
          : `Dear ${labelName} Team,\n\nI'm reaching out to submit my EP "${trackName}" for your consideration at ${labelName}.`;
    const middle = `${artist ? `I produce under the name ${artist}, and ` : ""}I believe this work aligns closely with the sonic identity and artistic direction of the label. The EP is built as a continuous journey, meant to be heard in full.`;
    const closing = `${customNote.trim() ? `Additional context: ${customNote.trim()}\n\n` : ""}I would greatly appreciate the opportunity to discuss this submission further. Thank you for your time and consideration.\n\nBest regards,\n${artist || "Independent Producer"}`;
    return `${opening}\n\n${middle}\n\nYou can listen to the full EP here:\n${epLink}${tracklistText ? `\n\nTracklist:\n${tracklistText}` : ""}\n\n${closing}`;
  }

  // === EP multi-link (each track has its own SC URL, format open) ===
  // The user has 2+ tracks but no single SC album URL yet. The body lists
  // every track with its own link, and explicitly invites the label to
  // choose the format (EP, separate singles, or just the strongest track).
  // This is the most flexible pitch — no commitment to a specific format
  // until the label shows interest.
  if (isEpMulti && epTracks && epTracks.length > 0) {
    const trackCount = epTracks.length;
    const primaryArtist = artist || (epTracks[0]?.artistName || "");
    // Build the per-track list with explicit attribution: each line shows
    // the track name + (if different from primary artist) the artist credit
    // + the direct SC link. Numbers make it easy for the A&R to reference
    // a specific track in their reply.
    const trackList = epTracks
      .map((t, i) => {
        const credit = t.artistName && t.artistName !== primaryArtist
          ? ` (${t.artistName})`
          : "";
        const link = t.scLink.trim()
          ? t.scLink.trim()
          : (lang === "it" ? "[link SoundCloud]" : "[SoundCloud link]");
        return `${i + 1}. ${t.trackName}${credit}\n   ${link}`;
      })
      .join("\n\n");

    if (lang === "it") {
      const opening = tone === "confident"
        ? `Hey Team ${labelName},\n\nVi mando una selezione di ${trackCount} tracce perché credo che tra queste ci sia esattamente ciò di cui ${labelName} ha bisogno in questo momento.`
        : tone === "friendly"
          ? `Ehi ${labelName}!\n\nHo una selezione di ${trackCount} tracce fresche per voi — e penso davvero che vi piaceranno.`
          : tone === "storytelling"
            ? `Gentile Team ${labelName},\n\nAlcune tracce nascono in studio — altre vengono da un posto più profondo. Questa selezione è di quelle.`
            : `Gentile Team ${labelName},\n\nVi contatto per sottoporre alla vostra attenzione una selezione di ${trackCount} tracce per una possibile pubblicazione su ${labelName}.`;
      const middle = `${primaryArtist ? `Produco con il nome d'arte ${primaryArtist}, e ` : ""}credendo che queste produzioni si allineino all'identità sonora della label. Le tracce sono pensate per funzionare sia come EP sia come singoli separati — vi lascio la libertà di scegliere il formato che preferite, o anche solo la traccia che vi risuona di più.`;
      const closing = `${customNote.trim() ? `Contesto aggiuntivo: ${customNote.trim()}\n\n` : ""}Sarei davvero grato per l'opportunità di discuterne. Grazie per il vostro tempo.\n\nCordiali saluti,\n${primaryArtist || "Produttore Indipendente"}`;
      return `${opening}\n\n${middle}\n\nPotete ascoltare le tracce ai seguenti link:\n\n${trackList}\n\n${closing}`;
    }
    // English fallback
    const opening = tone === "confident"
      ? `Hey ${labelName} Team,\n\nI'm sending you a selection of ${trackCount} tracks because I believe among these is exactly what ${labelName} needs right now.`
      : tone === "friendly"
        ? `Hey ${labelName}!\n\nI've got a fresh selection of ${trackCount} tracks for you — and I genuinely think you're going to dig them.`
        : tone === "storytelling"
          ? `Dear ${labelName} Team,\n\nSome tracks come from the studio — others come from somewhere deeper. This selection is the latter.`
          : `Dear ${labelName} Team,\n\nI'm reaching out to submit a selection of ${trackCount} tracks for your consideration at ${labelName}.`;
    const middle = `${primaryArtist ? `I produce under the name ${primaryArtist}, and ` : ""}I believe these productions align closely with the sonic identity of the label. The tracks work both as an EP and as separate singles — I'm leaving the format open to your preference, or you can simply pick the track that resonates most.`;
    const closing = `${customNote.trim() ? `Additional context: ${customNote.trim()}\n\n` : ""}I would greatly appreciate the opportunity to discuss this submission further. Thank you for your time and consideration.\n\nBest regards,\n${primaryArtist || "Independent Producer"}`;
    return `${opening}\n\n${middle}\n\nYou can listen to the tracks at the following links:\n\n${trackList}\n\n${closing}`;
  }

  // === Standard single-track pitch (legacy behavior) ===
  const link = scLink.trim() || (lang === "it" ? "[Il tuo link privato SoundCloud]" : lang === "es" ? "[Tu enlace privado de SoundCloud]" : lang === "fr" ? "[Votre lien SoundCloud privé]" : lang === "de" ? "[Ihr privater SoundCloud-Link]" : lang === "pt" ? "[Seu link privado do SoundCloud]" : "[Your private SoundCloud link]");

  // English templates
  if (lang === "en") {
    switch (tone) {
      case "professional":
        return `Dear ${labelName} Team,\n\nI'm reaching out to submit my latest track "${trackName}" for your consideration at ${labelName}.\n\n${artist ? `I produce under the name ${artist}, and ` : ""}I believe this production aligns closely with the sonic identity and artistic direction of the label. Having followed your recent releases closely, I'm confident this could resonate with your audience.\n\nYou can listen to the full track here:\n${link}\n\n${customNote.trim() ? `Additional context: ${customNote.trim()}\n\n` : ""}I would greatly appreciate the opportunity to discuss this submission further. Thank you for your time and consideration.\n\nBest regards,\n${artist || "Independent Producer"}`;
      case "confident":
        return `Hey ${labelName} Team,\n\nI'm sending you "${trackName}" because I believe this track is exactly what ${labelName} needs right now.\n\n${artist ? `I'm ${artist}, and I've ` : "I've "}been studying your recent catalog closely — this production sits perfectly in your lane. The energy, the groove, the arrangement — it's built for your label's sound and your audience's taste.\n\nHit play here:\n${link}\n\n${customNote.trim() ? `One more thing: ${customNote.trim()}\n\n` : ""}I'm ready to move fast if this resonates. Let's make it happen.\n\n${artist || "Independent Producer"}`;
      case "friendly":
        return `Hey ${labelName}!\n\nHope you're doing great! I've got a fresh one for you — "${trackName}" — and I genuinely think you're going to dig it.\n\n${artist ? `I produce as ${artist}, and I've ` : "I've "}been a big fan of what ${labelName} has been putting out lately. I made this track with your vibe in mind.\n\nGive it a spin:\n${link}\n\n${customNote.trim() ? `Also — ${customNote.trim()}\n\n` : ""}No pressure at all — if it's not the right fit, I totally understand. But if it sparks something, I'd love to chat!\n\nCheers,\n${artist || "Independent Producer"}`;
      case "storytelling":
        return `Dear ${labelName} Team,\n\nSome tracks come from the studio — others come from somewhere deeper. "${trackName}" is the latter.\n\n${artist ? `I'm ${artist}, and this ` : "This "}track was born from a moment I couldn't ignore: that feeling when the beat drops and everything else fades away. I poured that raw energy into every bar, every transition, every breath of silence.\n\nI'm sending this to ${labelName} specifically because your label has always told stories through sound — and this is mine. The journey this track takes mirrors the kind of emotional arc I've heard in your best releases.\n\nExperience it here:\n${link}\n\n${customNote.trim() ? `A note from the heart: ${customNote.trim()}\n\n` : ""}I'd love to hear what you feel when you listen. Sometimes the right track finds the right home.\n\nWith passion and respect,\n${artist || "Independent Producer"}`;
    }
  }

  // Italian templates
  if (lang === "it") {
    switch (tone) {
      case "professional":
        return `Gentile Team ${labelName},\n\nVi contatto per sottoporre alla vostra attenzione il mio nuovo brano "${trackName}" per una possibile pubblicazione su ${labelName}.\n\n${artist ? `Produco con il nome d'arte ${artist}, e ` : ""}credo che questa produzione si allinei perfettamente all'identità sonora e alla direzione artistica della label. Seguendo da vicino le vostre recenti release, sono convinto che questo brano possa risuonare con il vostro pubblico.\n\nPotete ascoltare il brano completo al seguente link:\n${link}\n\n${customNote.trim() ? `Contesto aggiuntivo: ${customNote.trim()}\n\n` : ""}Sarei davvero grato per l'opportunità di discutere ulteriormente di questa proposta. Grazie per il vostro tempo e la vostra attenzione.\n\nCordiali saluti,\n${artist || "Produttore Indipendente"}`;
      case "confident":
        return `Hey Team ${labelName},\n\nVi mando "${trackName}" perché credo che questo brano sia esattamente ciò di cui ${labelName} ha bisogno in questo momento.\n\n${artist ? `Sono ${artist}, e ho ` : "Ho "}studiato attentamente il vostro catalogo recente — questa produzione si inserisce perfettamente nel vostro stile. L'energia, il groove, l'arrangiamento — è tutto pensato per il sound della vostra label.\n\nAscoltatelo qui:\n${link}\n\n${customNote.trim() ? `Un'ultima cosa: ${customNote.trim()}\n\n` : ""}Sono pronto a muovermi velocemente se questo brano vi convince. Facciamolo succedere.\n\n${artist || "Produttore Indipendente"}`;
      case "friendly":
        return `Ehi ${labelName}!\n\nSpero tutto bene! Ho un brano fresco per voi — "${trackName}" — e penso davvero che vi piacerà.\n\n${artist ? `Produco come ${artist}, e sono ` : "Sono "}un grande fan di quello che ${labelName} sta pubblicando ultimamente. Ho fatto questo brano pensando al vostro vibe.\n\nDategli un ascolto:\n${link}\n\n${customNote.trim() ? `Ah — ${customNote.trim()}\n\n` : ""}Nessuna pressione — se non è il fit giusto, capisco benissimo. Ma se vi ispira qualcosa, mi piacerebbe sentirci!\n\nUn saluto,\n${artist || "Produttore Indipendente"}`;
      case "storytelling":
        return `Gentile Team ${labelName},\n\nAlcuni brani nascono in studio — altri vengono da un posto più profondo. "${trackName}" è di quelli.\n\n${artist ? `Sono ${artist}, e questo ` : "Questo "}brano è nato da un momento che non potevo ignorare: quella sensazione quando il beat drop e tutto il resto svanisce. Ho riversato quell'energia grezza in ogni battuta, in ogni transizione, in ogni respiro di silenzio.\n\nLo mando a ${labelName} proprio perché la vostra label ha sempre raccontato storie attraverso il suono — e questa è la mia. Il viaggio di questo brano rispecchia il tipo di arco emotivo che ho sentito nelle vostre migliori release.\n\nVivetelo qui:\n${link}\n\n${customNote.trim() ? `Una nota dal cuore: ${customNote.trim()}\n\n` : ""}Mi piacerebbe sapere cosa provate ascoltandolo. A volte il brano giusto trova la casa giusta.\n\nCon passione e rispetto,\n${artist || "Produttore Indipendente"}`;
    }
  }

  // Spanish templates
  if (lang === "es") {
    switch (tone) {
      case "professional":
        return `Estimado equipo de ${labelName},\n\nMe pongo en contacto para presentarles mi último track "${trackName}" para su consideración en ${labelName}.\n\n${artist ? `Produzco bajo el nombre ${artist}, y ` : ""}creo que esta producción se alinea estrechamente con la identidad sonora y la dirección artística del sello. Tras seguir de cerca sus recientes lanzamientos, estoy convencido de que podría resonar con su público.\n\nPueden escuchar el track completo aquí:\n${link}\n\n${customNote.trim() ? `Contexto adicional: ${customNote.trim()}\n\n` : ""}Agradecería enormemente la oportunidad de discutir esta propuesta más a fondo. Gracias por su tiempo y consideración.\n\nAtentamente,\n${artist || "Productor Independiente"}`;
      case "confident":
        return `Hey equipo de ${labelName},\n\nLes envío "${trackName}" porque creo que este track es exactamente lo que ${labelName} necesita ahora mismo.\n\n${artist ? `Soy ${artist}, y he ` : "He "}estado estudiando su catálogo reciente de cerca — esta producción encaja perfectamente en su estilo. La energía, el groove, el arreglo — está construido para el sonido de su sello.\n\nEscúchenlo aquí:\n${link}\n\n${customNote.trim() ? `Una cosa más: ${customNote.trim()}\n\n` : ""}Estoy listo para moverme rápido si esto les convence. Hagámoslo posible.\n\n${artist || "Productor Independiente"}`;
      case "friendly":
        return `¡Hey ${labelName}!\n\n¡Espero que todo vaya genial! Tengo algo fresco para ustedes — "${trackName}" — y creo de verdad que les va a encantar.\n\n${artist ? `Produzco como ${artist}, y he ` : "He "}sido un gran fan de lo que ${labelName} ha estado publicando últimamente. Hice este track pensando en su vibra.\n\nDenle una escucha:\n${link}\n\n${customNote.trim() ? `También — ${customNote.trim()}\n\n` : ""}Sin presión — si no es el fit adecuado, lo entiendo perfectamente. ¡Pero si les inspira algo, me encantaría charlar!\n\nUn saludo,\n${artist || "Productor Independiente"}`;
      case "storytelling":
        return `Estimado equipo de ${labelName},\n\nAlgunos tracks vienen del estudio — otros vienen de un lugar más profundo. "${trackName}" es de los segundos.\n\n${artist ? `Soy ${artist}, y este ` : "Este "}track nació de un momento que no podía ignorar: esa sensación cuando el beat cae y todo lo demás desaparece. Vertí esa energía cruda en cada compás, cada transición, cada suspiro de silencio.\n\nSe lo envío a ${labelName} porque su sello siempre ha contado historias a través del sonido — y esta es la mía.\n\nEscúchenlo aquí:\n${link}\n\n${customNote.trim() ? `Una nota del corazón: ${customNote.trim()}\n\n` : ""}Me encantaría saber qué sienten al escucharlo. A veces el track correcto encuentra el hogar correcto.\n\nCon pasión y respeto,\n${artist || "Productor Independiente"}`;
    }
  }

  // French templates
  if (lang === "fr") {
    switch (tone) {
      case "professional":
        return `Chère équipe ${labelName},\n\nJe vous contacte pour vous soumettre mon dernier titre "${trackName}" pour une possible publication sur ${labelName}.\n\n${artist ? `Je produis sous le nom ${artist}, et ` : ""}je crois que cette production s'aligne parfaitement avec l'identité sonore et la direction artistique du label. En suivant vos récentes sorties de près, je suis convaincu que ce titre pourrait résonner avec votre public.\n\nVous pouvez écouter le titre complet ici :\n${link}\n\n${customNote.trim() ? `Contexte supplémentaire : ${customNote.trim()}\n\n` : ""}Je serais très reconnaissant de l'opportunité de discuter davantage de cette soumission. Merci pour votre temps et votre considération.\n\nCordialement,\n${artist || "Producteur Indépendant"}`;
      case "confident":
        return `Hey équipe ${labelName},\n\nJe vous envoie "${trackName}" car je crois que ce titre est exactement ce dont ${labelName} a besoin en ce moment.\n\n${artist ? `Je suis ${artist}, et j'ai ` : "J'ai "}étudié votre catalogue récent de près — cette production s'intègre parfaitement dans votre style. L'énergie, le groove, l'arrangement — tout est pensé pour le son de votre label.\n\nÉcoutez-le ici :\n${link}\n\n${customNote.trim() ? `Encore une chose : ${customNote.trim()}\n\n` : ""}Je suis prêt à agir vite si ça vous convainc. Faisons-le arriver.\n\n${artist || "Producteur Indépendant"}`;
      case "friendly":
        return `Hey ${labelName} !\n\nJ'espère que tout va bien ! J'ai un titre frais pour vous — "${trackName}" — et je pense vraiment que ça va vous plaire.\n\n${artist ? `Je produis sous le nom ${artist}, et je suis ` : "Je suis "}un grand fan de ce que ${labelName} sort en ce moment. J'ai fait ce titre avec votre vibe en tête.\n\nÉcoutez-le ici :\n${link}\n\n${customNote.trim() ? `Aussi — ${customNote.trim()}\n\n` : ""}Sans aucune pression — si ce n'est pas le bon fit, je comprends totalement. Mais si ça vous inspire, j'adorerais en discuter !\n\nÀ bientôt,\n${artist || "Producteur Indépendant"}`;
      case "storytelling":
        return `Chère équipe ${labelName},\n\nCertains titres viennent du studio — d'autres viennent d'un endroit plus profond. "${trackName}" est de ceux-là.\n\n${artist ? `Je suis ${artist}, et ce ` : "Ce "}titre est né d'un moment que je ne pouvais ignorer : cette sensation quand le beat tombe et tout le reste s'efface. J'ai versé cette énergie brute dans chaque mesure, chaque transition, chaque souffle de silence.\n\nJe l'envoie à ${labelName} parce que votre label a toujours raconté des histoires à travers le son — et celle-ci est la mienne.\n\nVivez-la ici :\n${link}\n\n${customNote.trim() ? `Une note du cœur : ${customNote.trim()}\n\n` : ""}J'adorerais savoir ce que vous ressentez en l'écoutant. Parfois le bon titre trouve le bon foyer.\n\nAvec passion et respect,\n${artist || "Producteur Indépendant"}`;
    }
  }

  // German templates
  if (lang === "de") {
    switch (tone) {
      case "professional":
        return `Liebes ${labelName}-Team,\n\nich melde mich bei Ihnen, um Ihnen meinen neuesten Track "${trackName}" für eine Veröffentlichung auf ${labelName} vorzuschlagen.\n\n${artist ? `Ich produziere unter dem Namen ${artist} und ` : ""}ich glaube, dass diese Produktion perfekt zur klanglichen Identität und künstlerischen Ausrichtung des Labels passt. Nachdem ich Ihre letzten Veröffentlichungen aufmerksam verfolgt habe, bin ich überzeugt, dass dieser Track bei Ihrem Publikum Anklang finden könnte.\n\nSie können den kompletten Track hier anhören:\n${link}\n\n${customNote.trim() ? `Zusätzlicher Kontext: ${customNote.trim()}\n\n` : ""}Ich wäre Ihnen sehr dankbar für die Gelegenheit, diese Einreichung weiter zu besprechen. Vielen Dank für Ihre Zeit und Aufmerksamkeit.\n\nMit freundlichen Grüßen,\n${artist || "Unabhängiger Produzent"}`;
      case "confident":
        return `Hey ${labelName}-Team,\n\nich sende Ihnen "${trackName}", weil ich glaube, dass dieser Track genau das ist, was ${labelName} gerade braucht.\n\n${artist ? `Ich bin ${artist} und habe ` : "Ich habe "}Ihren aktuellen Katalog genau studiert — diese Produktion passt perfekt zu Ihrem Stil. Die Energie, der Groove, das Arrangement — alles ist auf den Sound Ihres Labels zugeschnitten.\n\nHören Sie hier rein:\n${link}\n\n${customNote.trim() ? `Noch eins: ${customNote.trim()}\n\n` : ""}Ich bin bereit, schnell zu handeln, wenn es Sie überzeugt. Lassen Sie es uns möglich machen.\n\n${artist || "Unabhängiger Produzent"}`;
      case "friendly":
        return `Hey ${labelName}!\n\nHoffe, alles ist gut bei euch! Ich hab was Frisches für euch — "${trackName}" — und ich glaube wirklich, dass es euch gefallen wird.\n\n${artist ? `Ich produziere als ${artist} und bin ` : "Ich bin "}ein großer Fan davon, was ${labelName} in letzter Zeit veröffentlicht. Ich habe diesen Track mit eurem Vibe im Kopf gemacht.\n\nGebt ihm einen Spin:\n${link}\n\n${customNote.trim() ? `Übrigens — ${customNote.trim()}\n\n` : ""}Gar kein Druck — wenn's nicht der richtige Fit ist, verstehe ich das vollkommen. Aber wenn's was auslöst, würde ich mich über einen Austausch freuen!\n\nCheers,\n${artist || "Unabhängiger Produzent"}`;
      case "storytelling":
        return `Liebes ${labelName}-Team,\n\nManche Tracks kommen aus dem Studio — andere kommen von irgendwo tiefer. "${trackName}" ist von der letzteren Sorte.\n\n${artist ? `Ich bin ${artist}, und dieser ` : "Dieser "}Track wurde aus einem Moment geboren, den ich nicht ignorieren konnte: dieses Gefühl, wenn der Beat droppt und alles andere verschwindet. Ich habe diese rohe Energie in jeden Takt, jeden Übergang, jeden Atemzug Stille gegossen.\n\nIch sende dies an ${labelName}, weil euer Label immer Geschichten durch Sound erzählt hat — und das hier ist meine.\n\nErlebt es hier:\n${link}\n\n${customNote.trim() ? `Eine Notiz aus dem Herzen: ${customNote.trim()}\n\n` : ""}Ich würde gerne hören, was ihr dabei fühlt. Manchmal findet der richtige Track das richtige Zuhause.\n\nMit Leidenschaft und Respekt,\n${artist || "Unabhängiger Produzent"}`;
    }
  }

  // Portuguese templates
  if (lang === "pt") {
    switch (tone) {
      case "professional":
        return `Caro time da ${labelName},\n\nEntro em contato para submeter meu mais recente track "${trackName}" para consideração na ${labelName}.\n\n${artist ? `Produzo sob o nome ${artist}, e ` : ""}acredito que esta produção se alinha estreitamente com a identidade sonora e a direção artística do selo. Acompanhando de perto seus lançamentos recentes, estou convicto de que este track poderia ressoar com seu público.\n\nVocê pode ouvir o track completo aqui:\n${link}\n\n${customNote.trim() ? `Contexto adicional: ${customNote.trim()}\n\n` : ""}Agradeço muito a oportunidade de discutir esta submissão mais a fundo. Obrigado pelo seu tempo e consideração.\n\nAtenciosamente,\n${artist || "Produtor Independente"}`;
      case "confident":
        return `Hey time da ${labelName},\n\nEstou enviando "${trackName}" porque acredito que este track é exatamente o que a ${labelName} precisa agora.\n\n${artist ? `Sou ${artist}, e tenho ` : "Tenho "}estudado seu catálogo recente de perto — esta produção se encaixa perfeitamente no seu estilo. A energia, o groove, o arranjo — tudo foi construído para o som do seu selo.\n\nOuça aqui:\n${link}\n\n${customNote.trim() ? `Mais uma coisa: ${customNote.trim()}\n\n` : ""}Estou pronto para me mover rápido se isso convencer. Vamos fazer acontecer.\n\n${artist || "Produtor Independente"}`;
      case "friendly":
        return `Ei ${labelName}!\n\nEspero que tudo esteja ótimo! Tenho algo fresco pra vocês — "${trackName}" — e acho que vão curtir demais.\n\n${artist ? `Produzo como ${artist}, e sou ` : "Sou "}um grande fã do que a ${labelName} tem lançado ultimamente. Fiz este track pensando na vibe de vocês.\n\nDê uma escutada:\n${link}\n\n${customNote.trim() ? `Ah — ${customNote.trim()}\n\n` : ""}Sem pressão — se não for o fit certo, entendo perfeitamente. Mas se inspirar algo, adoraria conversar!\n\nUm abraço,\n${artist || "Produtor Independente"}`;
      case "storytelling":
        return `Caro time da ${labelName},\n\nAlguns tracks vêm do estúdio — outros vêm de um lugar mais profundo. "${trackName}" é destes.\n\n${artist ? `Sou ${artist}, e este ` : "Este "}track nasceu de um momento que não podia ignorar: aquela sensação quando o beat cai e todo o resto desaparece. Derramei essa energia crua em cada compasso, cada transição, cada respiração de silêncio.\n\nEnvio isto para a ${labelName} porque seu selo sempre contou histórias através do som — e esta é a minha.\n\nViva aqui:\n${link}\n\n${customNote.trim() ? `Uma nota do coração: ${customNote.trim()}\n\n` : ""}Gostaria de saber o que sentem ao ouvir. Às vezes o track certo encontra o lar certo.\n\nCom paixão e respeito,\n${artist || "Produtor Independente"}`;
    }
  }

  // Fallback to English
  return generateBody(labelName, trackName, artistName, scLink, tone, customNote, "en");
}

/**
 * Generate the complete pitch text with subject line
 *
 * `shape` and `epTracks` are optional and default to a single-track pitch.
 * Pass `shape: "ep-single"` for whole-EP pitches with one SoundCloud album
 * URL, or `shape: "ep-multi"` with `epTracks` for multi-track pitches where
 * each track keeps its individual SC link.
 */
export function generatePitch(
  labelName: string,
  trackName: string,
  artistName: string,
  scLink: string,
  tone: PitchTone,
  customNote: string,
  emails: string[],
  submissionType: string,
  lang: PitchLanguage = "en",
  shape: PitchShape = "single",
  epTracks?: PitchTrackEntry[]
): string {
  const artist = artistName.trim();
  // Subject line adapts to the shape: "EP" for ep-single (whole EP),
  // "selection of N tracks" for ep-multi, plain trackName for single.
  const subjectLabel = shape === "ep-single"
    ? (lang === "it" ? `EP "${trackName}"` : `EP "${trackName}"`)
    : shape === "ep-multi" && epTracks && epTracks.length > 1
      ? (lang === "it"
          ? `Selezione di ${epTracks.length} tracce`
          : `Selection of ${epTracks.length} tracks`)
      : `"${trackName}"`;
  const subject = `Demo Submission: ${subjectLabel} — ${artist || (lang === "it" ? "Produttore Indipendente" : "Independent Producer")}`;
  const isEmail = submissionType === "email";
  const firstEmail = emails.length > 0 ? emails[0] : "";
  const body = generateBody(labelName, trackName, artistName, scLink, tone, customNote, lang, shape, epTracks);

  return isEmail
    ? `Subject: ${subject}\nTo: ${firstEmail}\n${emails.length > 1 ? `CC: ${emails.slice(1).join(", ")}\n` : ""}\n${body}`
    : `Subject: ${subject}\n\n${body}`;
}

/**
 * Generate just the subject line for the pitch.
 * Adapts the subject to the pitch shape (EP / multi-track / single).
 */
export function generateSubject(
  trackName: string,
  artistName: string,
  lang: PitchLanguage = "en",
  shape: PitchShape = "single",
  trackCount?: number
): string {
  const artist = artistName.trim();
  const subjectLabel = shape === "ep-single"
    ? `EP "${trackName}"`
    : shape === "ep-multi" && trackCount && trackCount > 1
      ? (lang === "it"
          ? `Selezione di ${trackCount} tracce`
          : `Selection of ${trackCount} tracks`)
      : `"${trackName}"`;
  return `Demo Submission: ${subjectLabel} — ${artist || (lang === "it" ? "Produttore Indipendente" : "Independent Producer")}`;
}

/**
 * Generate just the body for the pitch (without subject/To/CC headers).
 * Pass `shape` and `epTracks` to select the EP single-link or EP multi-link
 * templates; omit them (or pass shape="single") for the legacy single-track
 * template.
 */
export function generatePitchBody(
  labelName: string,
  trackName: string,
  artistName: string,
  scLink: string,
  tone: PitchTone,
  customNote: string,
  lang: PitchLanguage = "en",
  shape: PitchShape = "single",
  epTracks?: PitchTrackEntry[]
): string {
  return generateBody(labelName, trackName, artistName, scLink, tone, customNote, lang, shape, epTracks);
}

/**
 * Generate a mailto: link that opens the user's email client with pre-filled fields
 * This works with Gmail, Outlook, Apple Mail, and any default email client
 */
export function generateMailtoLink(
  emails: string[],
  subject: string,
  body: string
): string {
  const to = emails[0] || "";
  const cc = emails.slice(1).join(",");
  const params: string[] = [];
  if (cc) params.push(`cc=${encodeURIComponent(cc)}`);
  params.push(`subject=${encodeURIComponent(subject)}`);
  params.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${encodeURIComponent(to)}?${params.join("&")}`;
}

/**
 * Generate a Gmail web link that opens Gmail in the browser with pre-filled fields
 * No special permissions needed — just opens Gmail compose with subject & body pre-filled
 * The user must be logged into Gmail in their browser
 */
export function generateGmailLink(
  emails: string[],
  subject: string,
  body: string
): string {
  const to = emails[0] || "";
  const cc = emails.slice(1).join(",");
  const params: string[] = [];
  params.push("view=cm");
  params.push("fs=1");
  if (to) params.push(`to=${encodeURIComponent(to)}`);
  if (cc) params.push(`cc=${encodeURIComponent(cc)}`);
  params.push(`su=${encodeURIComponent(subject)}`);
  params.push(`body=${encodeURIComponent(body)}`);
  return `https://mail.google.com/mail/?${params.join("&")}`;
}

/**
 * Parse an edited pitch text (which may include "Subject:", "To:", "CC:"
 * header lines followed by a blank line and the body) back into
 * { subject, body } so the user's manual edits can flow through to
 * mailto:, Gmail web, and Gmail API.
 *
 * If the text doesn't follow the canonical format, subject falls back to
 * "" and body becomes the entire text — that's still safe to send.
 *
 * Used by both Label Finder (label-finder.tsx) and Demo Tracker
 * (demo-tracker.tsx) so the same editable-pitch logic works in both
 * places.
 */
export function parsePitchText(text: string): { subject: string; body: string } {
  if (!text) return { subject: "", body: "" };
  const lines = text.split("\n");
  let subject = "";
  let i = 0;
  // Optional Subject: line
  if (i < lines.length && lines[i].startsWith("Subject:")) {
    subject = lines[i].slice("Subject:".length).trim();
    i++;
  }
  // Skip optional To: / CC: header lines
  while (i < lines.length && (lines[i].startsWith("To:") || lines[i].startsWith("CC:"))) {
    i++;
  }
  // Skip exactly one blank line that separates headers from body
  if (i < lines.length && lines[i].trim() === "") {
    i++;
  }
  const body = lines.slice(i).join("\n").trim();
  return { subject, body };
}

/**
 * Best-effort extraction of multi-track entries from a pitchText body.
 *
 * Used as a fallback for demos that were saved BEFORE the structured
 * `Demo.pitchTracks` field existed — those demos only have the multi-track
 * info baked into the pitchText as plain text, so to render every track's
 * SoundCloud link in the demo detail dialog we parse it back out.
 *
 * Recognizes both formats emitted by generatePitchBody:
 *   • ep-multi  → "1. TrackName (Artist)\n   https://soundcloud.com/..."
 *   • ep-single → "1. TrackName — Artist" (no per-track URL — single EP link)
 *
 * Returns the parsed entries (possibly with empty scLink for ep-single
 * tracklist lines). Caller should only treat the result as "multi-track"
 * when length >= 2.
 */
export function parseMultiTrackFromPitchText(text: string): PitchTrackEntry[] {
  if (!text) return [];
  const lines = text.split("\n");
  const tracks: PitchTrackEntry[] = [];
  let pending: { trackName: string; artistName: string } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip the "You can listen to..." / "Potete ascoltare..." preamble lines
    // — they precede the actual numbered track list but are not tracks.
    // (Cheap filter: only treat a line as a track header if it starts with a
    // digit + period + space + non-digit.)
    const headerMatch = trimmed.match(/^(\d+)\.\s+([^\d].+)$/);
    if (headerMatch) {
      const rest = headerMatch[2].trim();
      let trackName = rest;
      let artistName = "";

      // Format 1: "TrackName (Artist Credit)" — used by ep-multi template
      const parenMatch = rest.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
      if (parenMatch) {
        trackName = parenMatch[1].trim();
        artistName = parenMatch[2].trim();
      } else {
        // Format 2: "TrackName — Artist" or "TrackName - Artist" or
        // "TrackName – Artist" — used by ep-single tracklist
        const dashMatch = rest.match(/^(.+?)\s+[—–-]\s+(.+)$/);
        if (dashMatch) {
          trackName = dashMatch[1].trim();
          artistName = dashMatch[2].trim();
        }
      }

      // Flush any previous pending track (ep-single case: track header
      // with NO following URL line — just save it with empty scLink).
      if (pending) {
        tracks.push({ ...pending, scLink: "" });
      }
      pending = { trackName, artistName };
      continue;
    }

    // URL line — typically the line right after the track header, indented
    // with 3 spaces in the ep-multi template. Match any SC URL on the line.
    const urlMatch = trimmed.match(/(https?:\/\/(?:on\.|www\.)?soundcloud\.com\/[^\s)]+)/i);
    if (urlMatch) {
      if (pending) {
        tracks.push({
          trackName: pending.trackName,
          artistName: pending.artistName,
          scLink: urlMatch[1],
        });
        pending = null;
      }
      // If no pending track, the URL is a standalone (e.g. the single EP
      // album URL in ep-single mode) — we don't add it as a track entry.
    }
  }

  // Flush final pending track (ep-single case where the tracklist had no
  // per-track URLs — the only URL was the EP album URL at the top).
  if (pending) {
    tracks.push({ ...pending, scLink: "" });
  }

  return tracks;
}
