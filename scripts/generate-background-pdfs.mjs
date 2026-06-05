// Generates one placeholder "Background Guide" PDF per committee in
// src/data/comites.json, written to public/backgrounds/[id]-background.pdf.
//
// No PDF library is installed in this project, so this script hand-builds
// minimal-but-valid PDF 1.4 byte streams: a Catalog, a Pages tree, one
// Page + Content stream per page, and the standard (non-embedded) Helvetica
// / Helvetica-Bold fonts with WinAnsiEncoding (covers Spanish/German
// accented characters without embedding font programs).
//
// Run with: node scripts/generate-background-pdfs.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import comites from '../src/data/comites.json' with { type: 'json' };

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'backgrounds');

/* ────────────────────────────────────────────────────────────────
   Minimal PDF builder
──────────────────────────────────────────────────────────────── */
const PAGE_W = 612;   // US Letter, points
const PAGE_H = 792;
const MARGIN = 72;
const CONTENT_W = PAGE_W - MARGIN * 2;
const LINE_H = 14.5;
const SIZE_BODY = 10.5;
const SIZE_H1 = 19;
const SIZE_H2 = 13;
const SIZE_META = 11;

// Approximate glyph-width factors for core-14 metrics (good enough for wrapping)
function textWidth(text, size, bold) {
  return text.length * size * (bold ? 0.56 : 0.50);
}

function wrapText(text, maxWidth, size, bold) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (cur && textWidth(test, size, bold) > maxWidth) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function escapePdfText(str) {
  return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

// ── WinAnsiEncoding (≈ Windows-1252) byte encoder ──
// The copy below uses real typographic punctuation (em dashes, curly
// apostrophes/quotes) plus Spanish/German accents. Plain `latin1` would
// truncate code points above 0xFF to garbage bytes, so we map the
// CP1252-specific punctuation block (0x80-0x9F) explicitly; everything
// else with a code point <= 0xFF passes straight through (Latin-1
// Supplement === CP1252 in that range, which is what /WinAnsiEncoding
// expects PDF viewers to use).
const CP1252_EXTRA = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};

function enc(str) {
  const bytes = [];
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (cp <= 0xff) bytes.push(cp);
    else if (CP1252_EXTRA[cp] !== undefined) bytes.push(CP1252_EXTRA[cp]);
    else bytes.push(0x3f); // '?' fallback for anything truly unmappable
  }
  return Buffer.from(bytes);
}

// Lay out an array of blocks -> array of pages, each an array of draw items
function layout(blocks) {
  const pages = [];
  let page = [];
  let y = PAGE_H - MARGIN;

  const breakPage = () => {
    if (page.length) pages.push(page);
    page = [];
    y = PAGE_H - MARGIN;
  };

  for (const block of blocks) {
    if (block.type === 'space') {
      y -= LINE_H * 0.55;
      continue;
    }
    if (block.type === 'rule') {
      if (y < MARGIN + LINE_H) breakPage();
      page.push({ rule: true, x: MARGIN, y, w: CONTENT_W });
      y -= LINE_H * 0.9;
      continue;
    }

    const isH1 = block.type === 'h1';
    const isH2 = block.type === 'h2';
    const isMeta = block.type === 'meta';
    const isBullet = block.type === 'bullet';
    const isNum = block.type === 'num';

    const size = isH1 ? SIZE_H1 : isH2 ? SIZE_H2 : isMeta ? SIZE_META : SIZE_BODY;
    const bold = isH1 || isH2;
    const font = bold ? 'F2' : 'F1';
    const indent = (isBullet || isNum) ? 16 : 0;
    const prefix = isBullet ? '-  ' : isNum ? `${block.n}.  ` : '';
    const wrapWidth = CONTENT_W - indent;

    const rawLines = wrapText(prefix + block.text, wrapWidth, size, bold);
    rawLines.forEach((line, i) => {
      if (y < MARGIN + LINE_H) breakPage();
      page.push({ text: line, size, font, x: MARGIN + (i === 0 ? 0 : indent), y });
      y -= isH1 ? LINE_H * 1.55 : isH2 ? LINE_H * 1.25 : LINE_H;
    });

    if (isH1 || isH2) y -= LINE_H * 0.45;
    else if (isMeta) y -= LINE_H * 0.15;
    else y -= LINE_H * 0.35;

    if (y < MARGIN) breakPage();
  }
  if (page.length) pages.push(page);
  return pages;
}

function buildContentStream(items) {
  let s = '';
  for (const it of items) {
    if (it.rule) {
      s += `q 0.722 0.663 0.416 RG 0.8 w ${it.x} ${it.y.toFixed(2)} m ${(it.x + it.w).toFixed(2)} ${it.y.toFixed(2)} l S Q\n`;
      continue;
    }
    s += `BT /${it.font} ${it.size} Tf ${it.x} ${it.y.toFixed(2)} Td (${escapePdfText(it.text)}) Tj ET\n`;
  }
  return s;
}

function buildPdf(pagesItems, title, author) {
  const FONT_REGULAR = 3;
  const FONT_BOLD = 4;
  const PAGES_OBJ = 2;
  const CATALOG_OBJ = 1;

  let next = 5;
  const objects = {}; // num -> { dict } | { stream }
  const pageNums = [];

  for (const items of pagesItems) {
    const pageNum = next++;
    const contentNum = next++;
    pageNums.push(pageNum);
    objects[pageNum] = {
      dict:
        `<< /Type /Page /Parent ${PAGES_OBJ} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 ${FONT_REGULAR} 0 R /F2 ${FONT_BOLD} 0 R >> >> /Contents ${contentNum} 0 R >>`,
    };
    objects[contentNum] = { stream: buildContentStream(items) };
  }

  const infoNum = next++;

  objects[CATALOG_OBJ] = { dict: `<< /Type /Catalog /Pages ${PAGES_OBJ} 0 R >>` };
  objects[PAGES_OBJ] = { dict: `<< /Type /Pages /Kids [${pageNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageNums.length} >>` };
  objects[FONT_REGULAR] = { dict: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>` };
  objects[FONT_BOLD] = { dict: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>` };
  objects[infoNum] = { dict: `<< /Title (${escapePdfText(title)}) /Author (${escapePdfText(author)}) /Producer (MUNBOLDT 2027 site generator) >>` };

  const totalObjs = next; // object numbers run 1..next-1, so xref size = next
  const offsets = new Array(totalObjs).fill(null);

  const chunks = [enc('%PDF-1.4\n%âãÏÓ\n')];
  let pos = chunks[0].length;

  for (let num = 1; num < totalObjs; num++) {
    const obj = objects[num];
    if (obj === undefined) continue;
    offsets[num] = pos;
    let buf;
    if (obj.stream !== undefined) {
      const streamBytes = enc(obj.stream);
      const head = enc(`${num} 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n`);
      const tail = enc(`endstream\nendobj\n`);
      buf = Buffer.concat([head, streamBytes, tail]);
    } else {
      buf = enc(`${num} 0 obj\n${obj.dict}\nendobj\n`);
    }
    chunks.push(buf);
    pos += buf.length;
  }

  const xrefStart = pos;
  let xref = `xref\n0 ${totalObjs}\n0000000000 65535 f \n`;
  for (let num = 1; num < totalObjs; num++) {
    if (offsets[num] !== null) {
      xref += `${String(offsets[num]).padStart(10, '0')} 00000 n \n`;
    } else {
      xref += `0000000000 00000 f \n`;
    }
  }
  const trailer =
    `trailer\n<< /Size ${totalObjs} /Root ${CATALOG_OBJ} 0 R /Info ${infoNum} 0 R >>\n` +
    `startxref\n${xrefStart}\n%%EOF`;
  chunks.push(enc(xref + trailer));

  return Buffer.concat(chunks);
}

/* ────────────────────────────────────────────────────────────────
   Per-language section copy (generic dais voice, parametrised by
   committee name / acronym / generated topic). Spanish and German
   use full accented orthography — WinAnsiEncoding (≈ CP1252/Latin-1)
   covers every character used here, so they render correctly without
   embedding font programs.
──────────────────────────────────────────────────────────────── */
const COPY = {
  en: {
    docTitle: () => `MUNBOLDT 2027 — Background Guide`,
    committeeLine: (c) => `Committee: ${c.nombre} (${c.siglas})`,
    topicLine: (topic) => `Topic: ${topic}`,
    sections: [
      'I. Letter from the Dais',
      'II. Introduction to the Committee',
      'III. Background and History of the Topic',
      'IV. Current Situation and Key Issues',
      'V. Past International Action',
      'VI. Bloc Positions',
      'VII. Questions a Resolution Must Answer (QARMAs)',
      'VIII. Suggestions for Further Research',
    ],
    closingTitle: 'Closing Remarks from the Dais',
    letter: (c, topic) => [
      `Dear Delegates,`,
      `It is with great pleasure that we welcome you to ${c.nombre} (${c.siglas}) at MUNBOLDT 2027. Over the course of this conference, you will be asked to step into the shoes of representatives entrusted with shaping real solutions to one of today's most pressing global challenges: ${topic}.`,
      `This background guide is meant to give you a starting point for your research — it is not a substitute for your own investigation. We encourage you to read widely, consult primary sources whenever possible, and arrive at committee ready to defend your delegation's position with evidence and conviction.`,
      `Debate in ${c.siglas} can move quickly, and the issues you will discuss do not have easy answers. We expect creativity, respectful disagreement, and a genuine willingness to listen to perspectives different from your own. Diplomacy is not about winning an argument; it is about finding workable solutions that a diverse group of stakeholders can stand behind.`,
      `We look forward to seeing the resolutions, communiqués, and ideas you bring to the table. Should any questions arise before or during the conference, please do not hesitate to reach out to the dais.`,
      `Sincerely,`,
      `The ${c.siglas} Dais — MUNBOLDT 2027`,
    ],
    intro: (c) => [
      c.mandate,
      `As you prepare for ${c.siglas}, take time to understand not only what this body can formally decide, but also how it operates in practice: how proposals move from an idea to a vote, what level of consensus is realistically required, and what happens after a decision is adopted. Understanding these mechanics will make your strategy — and your speeches — far more convincing.`,
    ],
    history: (topic) => [
      `While this guide cannot cover every historical development relevant to ${topic}, delegates should keep in mind that this issue did not emerge overnight. It is the product of decades of political, economic, and social developments whose consequences continue to shape the positions that Member States and delegations hold today.`,
      `Your research should trace how the issue has evolved over time: which events first brought it to international attention, which agreements or frameworks have already attempted to address it, and why — despite those efforts — it remains unresolved. Understanding this history matters, because many of the proposals you will hear in committee are simply updated versions of ideas that have been tried before, with varying degrees of success.`,
    ],
    issuesIntro: (topic) =>
      `Although every delegation will bring its own perspective to the table, most discussions on ${topic} tend to revolve around a shared set of underlying tensions. As you prepare, consider how your delegation would respond to each of the following:`,
    issuesOutro:
      `These issues are not exhaustive. You are encouraged to identify additional angles that are particularly relevant to the country, organisation, or actor your delegation represents.`,
    pastAction: (c, topic) =>
      `The international community has not been silent on ${topic}. Earlier resolutions, conferences, and frameworks have laid important groundwork, even if implementation has often fallen short of what was promised. Research which instruments are most relevant to ${c.siglas} — including any prior actions taken by this committee or the bodies it answers to — and consider honestly why those efforts succeeded, stalled, or failed outright. A strong proposal builds on this record rather than ignoring it.`,
    blocs:
      `Delegations facing this topic generally fall into broader groupings shaped by geography, level of development, historical experience, and strategic interest. Rather than memorising a fixed list of blocs, ask yourself: what does my country gain or risk under each possible outcome? Who are my natural allies, and where might I find unexpected common ground with delegations I would not normally agree with? The strongest speeches and position papers reflect this kind of authentic, country-specific reasoning — not generic talking points.`,
    qarmas: (c, topicLower) => [
      `How can ${c.siglas} balance the urgency of addressing ${topicLower} with the sovereignty and real capacities of individual Member States?`,
      `What mechanisms should be created — or strengthened — to monitor compliance with any agreement reached on this issue?`,
      `How should the international community distribute the financial and technical resources needed to implement the proposed solutions?`,
      `What safeguards should be included so that the resolution does not place a disproportionate burden on the states or communities least responsible for the problem?`,
    ],
    research: (topic) => [
      `Review your country's official statements, voting record, and relevant domestic policy on ${topic}.`,
      `Read recent reports from relevant international organisations, research institutes, and reputable news outlets.`,
      `Identify two or three countries whose positions are likely to be closest to — and furthest from — your own, and think through why.`,
      `Draft a one-page position paper outlining your delegation's stance, priorities, and possible areas of compromise before the conference begins.`,
    ],
    closing: (c) => [
      `We hope this guide sparks your curiosity rather than satisfies it. The real work begins now — with your own questions, your own reading, and your own ideas about how the world could work better. We cannot wait to see what you bring to ${c.siglas}.`,
      `See you in committee,`,
      `The Dais`,
    ],
  },

  es: {
    docTitle: () => `MUNBOLDT 2027 — Guía de Trabajo`,
    committeeLine: (c) => `Comité: ${c.nombre} (${c.siglas})`,
    topicLine: (topic) => `Tema: ${topic}`,
    sections: [
      'I. Carta de la Mesa Directiva',
      'II. Introducción al Comité',
      'III. Antecedentes e Historia del Tema',
      'IV. Situación Actual y Problemas Clave',
      'V. Acciones Internacionales Previas',
      'VI. Posiciones de los Bloques',
      'VII. Preguntas que una Resolución Debe Responder (QARMAs)',
      'VIII. Sugerencias para Investigación Adicional',
    ],
    closingTitle: 'Palabras Finales de la Mesa',
    letter: (c, topic) => [
      `Estimadas y estimados delegados,`,
      `Es un placer darles la bienvenida al comité ${c.nombre} (${c.siglas}) en MUNBOLDT 2027. A lo largo de esta conferencia se les pedirá que se pongan en el lugar de representantes encargados de construir soluciones reales a uno de los retos más apremiantes de nuestro tiempo: ${topic}.`,
      `Esta guía de trabajo busca ofrecerles un punto de partida para su investigación; no sustituye su propio análisis. Les invitamos a leer con amplitud, consultar fuentes primarias siempre que sea posible y llegar al comité listos para defender la postura de su delegación con argumentos sólidos y evidencia.`,
      `El debate en ${c.siglas} puede avanzar con rapidez, y los temas que discutiremos no tienen respuestas sencillas. Esperamos creatividad, desacuerdos respetuosos y una disposición genuina a escuchar perspectivas distintas a la propia. La diplomacia no consiste en ganar una discusión, sino en encontrar soluciones viables que un grupo diverso de actores pueda respaldar.`,
      `Esperamos con entusiasmo las resoluciones, comunicados e ideas que traerán a la mesa. Si tienen alguna duda antes o durante la conferencia, no duden en acercarse a la mesa directiva.`,
      `Atentamente,`,
      `La Mesa Directiva de ${c.siglas} — MUNBOLDT 2027`,
    ],
    intro: (c) => [
      c.mandate,
      `Al prepararse para ${c.siglas}, tómense el tiempo de entender no sólo lo que este órgano puede decidir formalmente, sino también cómo opera en la práctica: cómo una propuesta pasa de ser una idea a someterse a votación, qué nivel de consenso se requiere realmente y qué ocurre después de que se adopta una decisión. Entender esta mecánica hará su estrategia —y sus discursos— mucho más convincentes.`,
    ],
    history: (topic) => [
      `Aunque esta guía no puede abarcar todos los antecedentes relevantes para ${topic}, las y los delegados deben tener presente que este tema no surgió de un día para otro. Es el resultado de décadas de procesos políticos, económicos y sociales cuyas consecuencias siguen moldeando las posturas que hoy sostienen los Estados y las delegaciones.`,
      `Su investigación debe rastrear cómo ha evolucionado el problema: qué acontecimientos lo llevaron a la atención internacional, qué acuerdos o marcos se han intentado para atenderlo y por qué, a pesar de esos esfuerzos, sigue sin resolverse. Comprender esta historia es esencial, pues muchas de las propuestas que escucharán en comité son, en realidad, versiones actualizadas de ideas que ya se han probado antes, con distintos resultados.`,
    ],
    issuesIntro: (topic) =>
      `Aunque cada delegación llegará con su propia perspectiva, la mayoría de las discusiones sobre ${topic} giran en torno a un conjunto de tensiones compartidas. Al prepararse, piensen cómo respondería su delegación a cada uno de los siguientes puntos:`,
    issuesOutro:
      `Estos temas no agotan el debate: les animamos a identificar otros ángulos que sean particularmente relevantes para el país, organismo o actor que representan.`,
    pastAction: (c, topic) =>
      `La comunidad internacional no ha permanecido al margen de ${topic}. Resoluciones, conferencias y marcos normativos anteriores han sentado bases importantes, aunque su implementación con frecuencia no ha estado a la altura de lo prometido. Investiguen qué instrumentos son más relevantes para ${c.siglas} —incluidas acciones previas de este comité o de los organismos de los que depende— y reflexionen con honestidad sobre por qué esos esfuerzos avanzaron, se estancaron o fracasaron. Una propuesta sólida se construye sobre ese historial, no lo ignora.`,
    blocs:
      `Frente a este tema, las delegaciones suelen agruparse según su geografía, su nivel de desarrollo, su experiencia histórica y sus intereses estratégicos. Más que memorizar una lista fija de bloques, pregúntense: ¿qué gana o arriesga mi país con cada posible desenlace? ¿Quiénes son mis aliados naturales y dónde podría encontrar puntos en común con delegaciones con las que normalmente no coincido? Los discursos y documentos de posición más sólidos reflejan este tipo de razonamiento auténtico y específico, no discursos genéricos.`,
    qarmas: (c, topicLower) => [
      `¿Cómo puede ${c.siglas} equilibrar la urgencia de atender ${topicLower} con la soberanía y las capacidades reales de cada Estado Miembro?`,
      `¿Qué mecanismos deberían crearse —o fortalecerse— para dar seguimiento al cumplimiento de cualquier acuerdo alcanzado sobre este tema?`,
      `¿Cómo debería la comunidad internacional distribuir los recursos financieros y técnicos necesarios para implementar las soluciones propuestas?`,
      `¿Qué garantías deberían incluirse para que la resolución no recaiga de manera desproporcionada sobre los Estados o comunidades menos responsables del problema?`,
    ],
    research: (topic) => [
      `Revisar las declaraciones oficiales, el historial de votación y la política interna de su país relacionados con ${topic}.`,
      `Consultar informes recientes de organismos internacionales, centros de investigación y medios de comunicación confiables.`,
      `Identificar dos o tres países cuya postura probablemente sea más cercana —y más distante— de la suya, y reflexionar sobre por qué.`,
      `Redactar, antes de que inicie la conferencia, un documento de posición de una página que resuma la postura, las prioridades y los posibles puntos de acuerdo de su delegación.`,
    ],
    closing: (c) => [
      `Esperamos que esta guía despierte su curiosidad, más que satisfacerla. El verdadero trabajo comienza ahora, con sus propias preguntas, sus propias lecturas y sus propias ideas sobre cómo podría funcionar mejor el mundo. Estamos ansiosos por ver lo que traerán a ${c.siglas}.`,
      `Nos vemos en comité,`,
      `La Mesa Directiva`,
    ],
  },

  de: {
    docTitle: () => `MUNBOLDT 2027 — Hintergrundleitfaden`,
    committeeLine: (c) => `Komitee: ${c.nombre} (${c.siglas})`,
    topicLine: (topic) => `Thema: ${topic}`,
    sections: [
      'I. Brief des Vorsitzes',
      'II. Einführung in das Komitee',
      'III. Hintergrund und Geschichte des Themas',
      'IV. Aktuelle Lage und zentrale Streitfragen',
      'V. Bisherige internationale Maßnahmen',
      'VI. Positionen der Staatengruppen',
      'VII. Fragen, die eine Resolution beantworten muss (QARMAs)',
      'VIII. Vorschläge für die weitere Recherche',
    ],
    closingTitle: 'Abschließende Worte des Vorsitzes',
    letter: (c, topic) => [
      `Liebe Delegierte,`,
      `mit großer Freude heißen wir Sie im Komitee ${c.nombre} (${c.siglas}) bei MUNBOLDT 2027 willkommen. Im Verlauf dieser Konferenz werden Sie gebeten, in die Rolle von Vertreterinnen und Vertretern zu schlüpfen, die echte Lösungen für eine der drängendsten globalen Herausforderungen unserer Zeit erarbeiten sollen: ${topic}.`,
      `Dieser Hintergrundleitfaden soll Ihnen einen Ausgangspunkt für Ihre Recherche bieten — er ersetzt jedoch nicht Ihre eigene Arbeit. Wir ermutigen Sie, breit zu lesen, wo möglich Primärquellen heranzuziehen und gut vorbereitet ins Komitee zu kommen, um die Position Ihrer Delegation mit Argumenten und Belegen zu vertreten.`,
      `Die Debatten in ${c.siglas} können sich schnell entwickeln, und die behandelten Fragen haben keine einfachen Antworten. Wir erwarten Kreativität, respektvolle Meinungsverschiedenheiten und die echte Bereitschaft, anderen Sichtweisen zuzuhören. Diplomatie bedeutet nicht, eine Debatte zu gewinnen, sondern tragfähige Lösungen zu finden, die eine vielfältige Gruppe von Akteuren mittragen kann.`,
      `Wir freuen uns auf die Resolutionen, Erklärungen und Ideen, die Sie einbringen werden. Sollten vor oder während der Konferenz Fragen aufkommen, wenden Sie sich gerne jederzeit an den Vorsitz.`,
      `Mit freundlichen Grüßen,`,
      `Der Vorsitz von ${c.siglas} — MUNBOLDT 2027`,
    ],
    intro: (c) => [
      c.mandate,
      `Nehmen Sie sich bei der Vorbereitung auf ${c.siglas} die Zeit zu verstehen, was dieses Gremium nicht nur formal entscheiden kann, sondern auch, wie es in der Praxis arbeitet: wie ein Vorschlag von einer Idee zu einer Abstimmung gelangt, welches Maß an Konsens realistisch erforderlich ist und was nach der Verabschiedung einer Entscheidung geschieht. Dieses Verständnis macht Ihre Strategie — und Ihre Reden — deutlich überzeugender.`,
    ],
    history: (topic) => [
      `Auch wenn dieser Leitfaden nicht jede historische Entwicklung rund um ${topic} abdecken kann, sollten die Delegierten sich bewusst machen, dass dieses Thema nicht über Nacht entstanden ist. Es ist das Ergebnis jahrzehntelanger politischer, wirtschaftlicher und gesellschaftlicher Entwicklungen, deren Folgen die heutigen Positionen von Staaten und Delegationen weiterhin prägen.`,
      `Ihre Recherche sollte nachzeichnen, wie sich das Thema entwickelt hat: welche Ereignisse es in den Mittelpunkt der internationalen Aufmerksamkeit rückten, welche Abkommen oder Rahmenwerke bereits versucht haben, es anzugehen, und warum es trotz dieser Bemühungen bis heute ungelöst bleibt. Dieses Verständnis ist entscheidend, denn viele der Vorschläge, die Sie im Komitee hören werden, sind letztlich aktualisierte Versionen von Ideen, die bereits zuvor erprobt wurden — mit unterschiedlichem Erfolg.`,
    ],
    issuesIntro: (topic) =>
      `Auch wenn jede Delegation ihre eigene Perspektive einbringt, drehen sich die meisten Debatten über ${topic} um eine Reihe gemeinsamer Spannungsfelder. Überlegen Sie bei Ihrer Vorbereitung, wie Ihre Delegation auf jeden der folgenden Punkte reagieren würde:`,
    issuesOutro:
      `Diese Punkte sind nicht abschließend — wir ermutigen Sie, weitere Aspekte zu identifizieren, die für das Land, die Organisation oder den Akteur, den Sie vertreten, besonders relevant sind.`,
    pastAction: (c, topic) =>
      `Die internationale Gemeinschaft hat sich dem Thema ${topic} nicht verschlossen. Frühere Resolutionen, Konferenzen und Rahmenwerke haben wichtige Grundlagen geschaffen, auch wenn deren Umsetzung den Erwartungen oft nicht gerecht wurde. Recherchieren Sie, welche Instrumente für ${c.siglas} am relevantesten sind — einschließlich früherer Maßnahmen dieses Komitees oder seiner übergeordneten Organe — und überlegen Sie ehrlich, warum frühere Bemühungen erfolgreich waren, ins Stocken gerieten oder scheiterten. Ein überzeugender Vorschlag baut auf dieser Geschichte auf, anstatt sie zu ignorieren.`,
    blocs:
      `Delegationen lassen sich bei diesem Thema meist in größere Gruppen einteilen, die durch Geografie, Entwicklungsstand, historische Erfahrung und strategische Interessen geprägt sind. Anstatt eine feste Liste von Gruppen auswendig zu lernen, fragen Sie sich: Was gewinnt oder riskiert mein Land bei jedem möglichen Ausgang? Wer sind meine natürlichen Verbündeten, und wo könnte ich unerwartete Gemeinsamkeiten mit Delegationen finden, mit denen ich normalerweise nicht übereinstimme? Überzeugende Reden und Positionspapiere spiegeln diese Art von authentischer, länderspezifischer Argumentation wider — keine allgemeinen Phrasen.`,
    qarmas: (c, topicLower) => [
      `Wie kann ${c.siglas} die Dringlichkeit von ${topicLower} mit der Souveränität und den tatsächlichen Kapazitäten der einzelnen Mitgliedstaaten in Einklang bringen?`,
      `Welche Mechanismen sollten geschaffen — oder gestärkt — werden, um die Einhaltung einer erzielten Vereinbarung zu überwachen?`,
      `Wie sollte die internationale Gemeinschaft die finanziellen und technischen Mittel verteilen, die zur Umsetzung der vorgeschlagenen Lösungen nötig sind?`,
      `Welche Schutzmechanismen sollten vorgesehen werden, damit eine verabschiedete Resolution nicht unverhältnismäßig die Staaten oder Gemeinschaften belastet, die am wenigsten für das Problem verantwortlich sind?`,
    ],
    research: (topic) => [
      `Die offiziellen Erklärungen, das Abstimmungsverhalten und die innenpolitischen Maßnahmen Ihres Landes zu ${topic} zu recherchieren.`,
      `Aktuelle Berichte internationaler Organisationen, Forschungsinstitute und seriöser Medien zu lesen.`,
      `Zwei oder drei Länder zu identifizieren, deren Position der eigenen voraussichtlich am nächsten — beziehungsweise am fernsten — steht, und zu überlegen, warum.`,
      `Vor Konferenzbeginn ein einseitiges Positionspapier zu verfassen, das Haltung, Prioritäten und mögliche Kompromissbereiche Ihrer Delegation zusammenfasst.`,
    ],
    closing: (c) => [
      `Wir hoffen, dass dieser Leitfaden Ihre Neugier weckt, anstatt sie zu stillen. Die eigentliche Arbeit beginnt jetzt — mit Ihren eigenen Fragen, Ihrer eigenen Recherche und Ihren eigenen Ideen, wie die Welt besser funktionieren könnte. Wir freuen uns sehr darauf zu sehen, was Sie ins Komitee ${c.siglas} einbringen werden.`,
      `Wir sehen uns im Komitee,`,
      `Der Vorsitz`,
    ],
  },
};

/* ────────────────────────────────────────────────────────────────
   Per-committee profile: a plausible topic, a short mandate
   description, and four topic-specific key issues.
──────────────────────────────────────────────────────────────── */
const PROFILES = {
  ga: {
    topic: 'Strengthening Multilateral Cooperation to Address Cross-Border Crises in the 21st Century',
    mandate: 'The General Assembly is the main deliberative organ of the United Nations, bringing together every Member State on an equal footing to discuss the full range of issues covered by the UN Charter. While its resolutions are not legally binding, they carry significant political weight and often set the tone for the international agenda on peace, development, and human rights.',
    issues: [
      'The erosion of public trust in multilateral institutions amid rising nationalism and geopolitical rivalry',
      'Coordinating timely responses to overlapping humanitarian, climate, and economic emergencies',
      'Ensuring equitable representation of small and developing states in global decision-making processes',
      'Financing collective action without overburdening Member States with competing domestic priorities',
    ],
  },
  sc: {
    topic: 'Maintaining International Peace and Security in Regions Affected by Protracted Armed Conflict',
    mandate: 'The Security Council is the United Nations organ with primary responsibility for the maintenance of international peace and security. Composed of fifteen members, it is the only UN body whose decisions Member States are legally obligated to carry out, which gives its sessions a weight and urgency unlike any other committee.',
    issues: [
      'Protecting civilians and preserving humanitarian access in active conflict zones',
      'The proliferation of non-state armed groups and their effect on regional stability',
      'The role of peacekeeping operations in supporting durable political settlements',
      'Balancing the use of sanctions with the need to avoid worsening humanitarian conditions on the ground',
    ],
  },
  ecosoc: {
    topic: 'Promoting Inclusive Economic Recovery and Reducing Inequality in the Post-Pandemic Global Economy',
    mandate: 'The Economic and Social Council coordinates the economic, social, and environmental work of the United Nations and its specialised agencies, funds, and programmes. It serves as the central platform for reflection, debate, and policy recommendations on sustainable development and the implementation of internationally agreed development goals.',
    issues: [
      'Closing the widening gap in growth and resilience between high-income and low-income economies',
      "Expanding access to social protection systems for the world's most vulnerable communities",
      'Aligning national recovery plans with the 2030 Agenda for Sustainable Development',
      'Mobilising international financing for small and medium-sized enterprises in developing regions',
    ],
  },
  hsc: {
    topic: 'The Cuban Missile Crisis (October 1962): Charting a Path Away from Nuclear Confrontation',
    mandate: 'The Historical Security Council places delegates inside a defining moment of the past and asks them to debate using only the information, technology, and political constraints available at that time. Outcomes here are measured not against today’s hindsight, but against the realities the actual decision-makers of the era were facing.',
    issues: [
      'Verifying the presence and eventual removal of offensive weapons systems from the Western Hemisphere',
      'Preventing an escalation that could draw the two Cold War superpowers into direct military confrontation',
      'Assessing the legality and consequences of a naval quarantine under international law',
      'Preserving open channels of communication between rival blocs during a fast-moving crisis',
    ],
  },
  'us-senate': {
    topic: 'Deliberating Federal Legislation on Immigration Reform and Border Security',
    mandate: 'The United States Senate is the upper chamber of the U.S. Congress, responsible for debating and passing federal legislation, confirming high-level appointments, and ratifying international treaties. Its rules — including extended debate — often require senators to build broad coalitions across party lines before any measure can advance.',
    issues: [
      'Balancing border security measures with pathways to legal status for long-term residents',
      'The economic impact of immigration policy on the labour market and the federal budget',
      'Questions of jurisdiction and resource-sharing between federal and state authorities',
      'Building bipartisan support for a measure in a closely divided chamber',
    ],
  },
  'un-women': {
    topic: "Advancing Gender Equality and Women's Economic Empowerment in Fragile and Conflict-Affected Settings",
    mandate: 'UN Women is the United Nations entity dedicated to gender equality and the empowerment of women. It supports Member States in setting global standards for achieving gender equality and works alongside governments and civil society to design the laws, policies, programmes, and services needed to put those standards into practice.',
    issues: [
      "Closing persistent gaps in women's access to land, credit, and formal employment",
      'Protecting women human-rights defenders and survivors of gender-based violence',
      "Increasing women's participation in peace negotiations and post-conflict governance",
      'Translating international commitments such as the Beijing Platform for Action into domestic policy',
    ],
  },
  who: {
    topic: 'Strengthening Global Health Systems and Pandemic Preparedness for Future Health Emergencies',
    mandate: 'The World Health Organization is the United Nations specialised agency responsible for international public health. It directs and coordinates global health matters, sets technical norms and standards, monitors health trends, and provides direct support to countries facing health emergencies.',
    issues: [
      'Ensuring equitable distribution of vaccines, diagnostics, and treatments across regions',
      'Building resilient primary healthcare systems in low-resource settings',
      'Coordinating early-warning disease-surveillance networks across borders',
      'Financing long-term health infrastructure beyond emergency response cycles',
    ],
  },
  esc: {
    topic: 'Addressing the Security Implications of Climate-Induced Displacement and Resource Scarcity',
    mandate: 'The Environmental Security Council is a specialised body that examines the intersection of environmental change with international peace and security. Delegates are asked to consider how resource scarcity, displacement, and ecological degradation can act as drivers of instability — and how the international community might respond before tensions escalate into open conflict.',
    issues: [
      'Defining the legal status and protection needs of persons displaced by environmental change',
      'Preventing conflict over shared water basins and arable land in climate-stressed regions',
      'Integrating environmental risk assessment into existing conflict-prevention frameworks',
      'Financing adaptation measures in the regions most exposed to environmental security risks',
    ],
  },
  undrr: {
    topic: 'Building Community Resilience to Natural Hazards through Early-Warning Systems and Local Preparedness',
    mandate: 'The United Nations Office for Disaster Risk Reduction supports countries in lowering their exposure and vulnerability to natural hazards. As a junior committee, UNDRR is a welcoming space to practise the foundations of diplomacy — public speaking, negotiation, and resolution writing — while engaging with real and pressing global issues.',
    issues: [
      'Expanding access to early-warning systems in remote and under-resourced communities',
      'Strengthening schools and hospitals so that they can withstand natural hazards',
      'Encouraging youth participation in local disaster-preparedness planning',
      'Sharing lessons learned between regions that face very different hazard profiles',
    ],
  },
  unicef: {
    topic: "Protecting Children's Right to Education in Emergencies and Humanitarian Crises",
    mandate: "The United Nations Children's Fund works in more than 190 countries to protect the rights and wellbeing of children, especially the most vulnerable. As a junior committee, UNICEF gives new delegates a supportive environment in which to grow their research, debate, and negotiation skills.",
    issues: [
      'Keeping schools safe from attack and from military use during armed conflict',
      'Supporting the psychosocial wellbeing of children affected by displacement',
      'Closing the digital divide in access to remote and emergency learning',
      'Ensuring continuity of education for refugee and internally displaced children',
    ],
  },

  'camara-diputados': {
    topic: 'Análisis y Discusión de una Reforma Integral al Sistema de Movilidad y Transporte Público',
    mandate: 'La Cámara de Diputados es la cámara baja del Congreso de la Unión de los Estados Unidos Mexicanos. Sus integrantes representan a la ciudadanía y tienen la facultad de proponer, discutir y aprobar leyes, así como de aprobar el Presupuesto de Egresos de la Federación. Su trabajo exige negociar entre fuerzas políticas con visiones distintas para construir mayorías legislativas.',
    issues: [
      'El financiamiento sostenible de los sistemas de transporte público en zonas urbanas y rurales',
      'La reducción de emisiones contaminantes derivadas del transporte de pasajeros y de carga',
      'La coordinación entre los tres órdenes de gobierno para implementar la reforma de manera homogénea',
      'La protección de los derechos y la seguridad de las personas usuarias del transporte público',
    ],
  },
  cepal: {
    topic: 'Estrategias para Reducir la Desigualdad Estructural y Fortalecer la Integración Económica Regional',
    mandate: 'La Comisión Económica para América Latina y el Caribe es un organismo regional de las Naciones Unidas dedicado al análisis y la promoción del desarrollo económico y social de la región. A través de sus informes y recomendaciones busca fortalecer la cooperación entre los países latinoamericanos y caribeños frente a los retos del desarrollo.',
    issues: [
      'El cierre de las brechas de productividad entre las distintas economías de la región',
      'El fortalecimiento de las cadenas de valor regionales frente a la incertidumbre del comercio global',
      'La promoción de la inclusión financiera de las micro, pequeñas y medianas empresas',
      'La transición hacia modelos de desarrollo bajos en emisiones de carbono',
    ],
  },
  'onu-mujeres': {
    topic: 'Promoviendo la Autonomía Económica de las Mujeres y la Erradicación de la Violencia de Género',
    mandate: 'ONU Mujeres es la entidad de las Naciones Unidas dedicada a la igualdad de género y al empoderamiento de las mujeres. Apoya a los Estados Miembros en el establecimiento de estándares globales para alcanzar la igualdad de género y trabaja junto con gobiernos y sociedad civil para diseñar las leyes, políticas, programas y servicios necesarios para implementarlos.',
    issues: [
      'El acceso equitativo de las mujeres al empleo formal, al crédito y a la propiedad',
      'La prevención y la atención integral de la violencia de género en todas sus formas',
      'La participación política y el liderazgo de las mujeres en espacios de toma de decisiones',
      'La implementación efectiva de los compromisos asumidos en la Plataforma de Acción de Beijing',
    ],
  },
  unesco: {
    topic: 'Garantizando una Educación Inclusiva y de Calidad frente a la Transformación Digital',
    mandate: 'La Organización de las Naciones Unidas para la Educación, la Ciencia y la Cultura promueve la cooperación internacional en materia de educación, ciencia, cultura y comunicación. A través de sus programas busca construir la paz mediante el entendimiento mutuo entre los pueblos y la protección del patrimonio común de la humanidad.',
    issues: [
      'La reducción de la brecha digital en el acceso a herramientas y contenidos educativos',
      'La protección del patrimonio cultural y lingüístico en contextos de creciente globalización',
      'La formación docente para integrar nuevas tecnologías de manera pedagógicamente sólida',
      'El fortalecimiento de la cooperación científica internacional frente a retos globales compartidos',
    ],
  },

  bundestag: {
    topic: 'Beratung über die Modernisierung der Energieinfrastruktur und den Übergang zu erneuerbaren Energien',
    mandate: 'Der Bundestag ist das deutsche Parlament und das zentrale Gesetzgebungsorgan der Bundesrepublik Deutschland. Seine Mitglieder werden direkt vom Volk gewählt und sind für die Verabschiedung von Gesetzen, die Kontrolle der Bundesregierung und die Wahl der Bundeskanzlerin oder des Bundeskanzlers verantwortlich. Seine Beratungen erfordern oft die Bildung von Mehrheiten über Fraktionsgrenzen hinweg.',
    issues: [
      'Die Sicherstellung einer stabilen und bezahlbaren Energieversorgung während der Übergangsphase',
      'Die Förderung von Investitionen in erneuerbare Energien und Energiespeichertechnologien',
      'Der Ausgleich zwischen Klimazielen und den Interessen betroffener Regionen und Branchen',
      'Die Zusammenarbeit zwischen Bund, Ländern und Kommunen bei der Umsetzung der Energiewende',
    ],
  },
  'bundestag-historico': {
    topic: 'Die Debatte über die Deutsche Wiedervereinigung (1989–1990): Wege zu einem geeinten Deutschland',
    mandate: 'Das historische Bundestag-Komitee versetzt die Delegierten in einen entscheidenden Moment der deutschen Geschichte zurück und bittet sie, ausschließlich mit den Informationen, Mitteln und politischen Zwängen jener Zeit zu debattieren. Entscheidungen werden hier nicht aus heutiger Sicht bewertet, sondern an den Realitäten gemessen, mit denen die damaligen Entscheidungsträgerinnen und Entscheidungsträger tatsächlich konfrontiert waren.',
    issues: [
      'Die Gestaltung eines Fahrplans zur staatlichen Einheit unter Wahrung der Stabilität in Europa',
      'Die wirtschaftliche und soziale Angleichung der Lebensverhältnisse zwischen Ost und West',
      'Die internationalen Verhandlungen mit den Alliierten Mächten über die Souveränität Deutschlands',
      'Der Umgang mit den staatlichen Institutionen und Archiven der ehemaligen DDR',
    ],
  },
};

function buildBlocks(c, lang, profile) {
  const t = COPY[lang];
  const topic = profile.topic;
  const topicLower = topic.charAt(0).toLowerCase() + topic.slice(1);
  const c2 = { ...c, mandate: profile.mandate };
  const blocks = [];

  blocks.push({ type: 'h1', text: t.docTitle(c) });
  blocks.push({ type: 'meta', text: t.committeeLine(c) });
  blocks.push({ type: 'meta', text: t.topicLine(topic) });
  blocks.push({ type: 'rule' });
  blocks.push({ type: 'space' });

  const sectionBodies = [
    t.letter(c, topic),
    t.intro(c2),
    t.history(topic),
    null, // issues — handled specially
    [t.pastAction(c, topic)],
    [t.blocs],
    null, // qarmas — handled specially
    null, // research — handled specially
  ];

  t.sections.forEach((title, idx) => {
    blocks.push({ type: 'h2', text: title });
    if (idx === 3) {
      blocks.push({ type: 'body', text: t.issuesIntro(topic) });
      profile.issues.forEach((iss) => blocks.push({ type: 'bullet', text: iss }));
      blocks.push({ type: 'body', text: t.issuesOutro });
    } else if (idx === 6) {
      t.qarmas(c, topicLower).forEach((q, i) => blocks.push({ type: 'num', n: i + 1, text: q }));
    } else if (idx === 7) {
      t.research(topic).forEach((r) => blocks.push({ type: 'bullet', text: r }));
    } else {
      sectionBodies[idx].forEach((p) => blocks.push({ type: 'body', text: p }));
    }
    blocks.push({ type: 'space' });
  });

  blocks.push({ type: 'rule' });
  blocks.push({ type: 'h2', text: t.closingTitle });
  t.closing(c).forEach((p) => blocks.push({ type: 'body', text: p }));

  return blocks;
}

/* ────────────────────────────────────────────────────────────────
   Generate one PDF per committee
──────────────────────────────────────────────────────────────── */
mkdirSync(OUT_DIR, { recursive: true });

let count = 0;
for (const c of comites) {
  const profile = PROFILES[c.id];
  if (!profile) {
    console.warn(`[generate-background-pdfs] No profile for "${c.id}" — skipping`);
    continue;
  }
  const lang = COPY[c.idioma] ? c.idioma : 'en';
  const blocks = buildBlocks(c, lang, profile);
  const pages = layout(blocks);
  const title = `${c.nombre} (${c.siglas}) — MUNBOLDT 2027 Background Guide`;
  const pdf = buildPdf(pages, title, 'MUNBOLDT 2027 Academic Team');
  const outPath = join(OUT_DIR, `${c.id}-background.pdf`);
  writeFileSync(outPath, pdf);
  count++;
  console.log(`[generate-background-pdfs] wrote ${outPath} (${pages.length} page${pages.length === 1 ? '' : 's'}, ${pdf.length} bytes)`);
}

console.log(`[generate-background-pdfs] done — generated ${count}/${comites.length} PDFs`);
