/**
 * Shared Pitch Generation Utilities
 * Supports multiple languages and mailto: link generation
 */

export type PitchTone = "professional" | "confident" | "friendly" | "storytelling";
export type PitchLanguage = "en" | "it" | "es" | "fr" | "de" | "pt";

export const PITCH_LANGUAGES: Record<PitchLanguage, string> = {
  en: "English",
  it: "Italiano",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
};

/**
 * Generate the email body text for a pitch in the specified language and tone
 */
function generateBody(
  labelName: string,
  trackName: string,
  artistName: string,
  scLink: string,
  tone: PitchTone,
  customNote: string,
  lang: PitchLanguage
): string {
  const link = scLink.trim() || (lang === "it" ? "[Il tuo link privato SoundCloud]" : lang === "es" ? "[Tu enlace privado de SoundCloud]" : lang === "fr" ? "[Votre lien SoundCloud privé]" : lang === "de" ? "[Ihr privater SoundCloud-Link]" : lang === "pt" ? "[Seu link privado do SoundCloud]" : "[Your private SoundCloud link]");
  const artist = artistName.trim();

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
  lang: PitchLanguage = "en"
): string {
  const artist = artistName.trim();
  const subject = `Demo Submission: "${trackName}" — ${artist || (lang === "it" ? "Produttore Indipendente" : "Independent Producer")}`;
  const isEmail = submissionType === "email";
  const firstEmail = emails.length > 0 ? emails[0] : "";
  const body = generateBody(labelName, trackName, artistName, scLink, tone, customNote, lang);

  return isEmail
    ? `Subject: ${subject}\nTo: ${firstEmail}\n${emails.length > 1 ? `CC: ${emails.slice(1).join(", ")}\n` : ""}\n${body}`
    : `Subject: ${subject}\n\n${body}`;
}

/**
 * Generate just the subject line for the pitch
 */
export function generateSubject(
  trackName: string,
  artistName: string,
  lang: PitchLanguage = "en"
): string {
  const artist = artistName.trim();
  return `Demo Submission: "${trackName}" — ${artist || (lang === "it" ? "Produttore Indipendente" : "Independent Producer")}`;
}

/**
 * Generate just the body for the pitch (without subject/To/CC headers)
 */
export function generatePitchBody(
  labelName: string,
  trackName: string,
  artistName: string,
  scLink: string,
  tone: PitchTone,
  customNote: string,
  lang: PitchLanguage = "en"
): string {
  return generateBody(labelName, trackName, artistName, scLink, tone, customNote, lang);
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
