// Generates a single placeholder "Position Paper" example PDF, written to
// public/sample-position-paper.pdf — embedded on the new /preparacion page
// as a worked example for delegates learning how to write their own.
//
// Reuses the same hand-built PDF 1.4 byte-builder approach as
// generate-background-pdfs.mjs (no PDF library is installed in this
// project): a Catalog, a Pages tree, Page + Content stream objects, and
// the standard non-embedded Helvetica / Helvetica-Bold fonts with
// /WinAnsiEncoding (covers Spanish accented characters without embedding
// font programs). See that script for a fuller explanation of the
// technique and the CP1252 byte-encoding fix for Unicode punctuation.
//
// Run with: node scripts/generate-position-paper-pdf.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '..', 'public', 'sample-position-paper.pdf');

/* ────────────────────────────────────────────────────────────────
   Minimal PDF builder (identical approach to generate-background-pdfs.mjs)
──────────────────────────────────────────────────────────────── */
const PAGE_W = 612;   // US Letter, points
const PAGE_H = 792;
const MARGIN = 72;
const CONTENT_W = PAGE_W - MARGIN * 2;
const LINE_H = 14.5;
const SIZE_BODY = 10.5;
const SIZE_H1 = 20;
const SIZE_H2 = 13;
const SIZE_META = 11;

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

// ── WinAnsiEncoding (≈ Windows-1252) byte encoder ── see generate-background-pdfs.mjs
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
    else bytes.push(0x3f);
  }
  return Buffer.from(bytes);
}

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
    if (block.type === 'pagebreak') {
      breakPage();
      continue;
    }
    if (block.type === 'rule') {
      if (y < MARGIN + LINE_H) breakPage();
      page.push({ rule: true, x: MARGIN, y, w: CONTENT_W });
      y -= LINE_H * 0.9;
      continue;
    }
    if (block.type === 'center') {
      const size = block.size ?? SIZE_BODY;
      const bold = !!block.bold;
      const font = bold ? 'F2' : 'F1';
      if (y < MARGIN + LINE_H) breakPage();
      const w = textWidth(block.text, size, bold);
      page.push({ text: block.text, size, font, x: MARGIN + (CONTENT_W - w) / 2, y });
      y -= LINE_H * 1.4;
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
  const objects = {};
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

  const totalObjs = next;
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
   Sample position paper content — Topic / Country / Committee are
   fictional placeholders chosen to read as a complete, realistic
   worked example a delegate could model their own paper on.
──────────────────────────────────────────────────────────────── */
const COMMITTEE = 'Asamblea General (GA)';
const TOPIC = 'El Fortalecimiento de la Cooperación Multilateral para Enfrentar Crisis Transfronterizas en el Siglo XXI';
const COUNTRY = 'República Federativa del Brasil';

const blocks = [
  // ── Title page ──
  { type: 'space' }, { type: 'space' }, { type: 'space' }, { type: 'space' },
  { type: 'center', text: 'MUNBOLDT 2027', size: 13, bold: true },
  { type: 'space' },
  { type: 'center', text: 'POSITION PAPER — EJEMPLO DE REFERENCIA', size: 19, bold: true },
  { type: 'space' }, { type: 'space' },
  { type: 'center', text: `Comité: ${COMMITTEE}`, size: 12 },
  { type: 'center', text: `Delegación: ${COUNTRY}`, size: 12 },
  { type: 'center', text: `Tema: ${TOPIC}`, size: 11 },
  { type: 'space' }, { type: 'space' }, { type: 'space' },
  { type: 'rule' },
  { type: 'space' },
  {
    type: 'meta',
    text:
      'Nota para delegados: este documento es un EJEMPLO ilustrativo generado para MUNBOLDT 2027. ' +
      'Su propósito es mostrar la estructura, el tono y la extensión esperados de un position paper — ' +
      'no es un modelo a copiar. Sustituye cada sección con tu propia investigación, postura y citas ' +
      'verificables sobre tu país y tu comité.',
  },
  { type: 'space' }, { type: 'space' },
  {
    type: 'meta',
    text:
      'Estructura recomendada de un position paper: (1) encabezado con país, comité y tema; ' +
      '(2) postura general del país; (3) introducción al problema; (4) argumentos centrales con ' +
      'evidencia; (5) propuestas de solución concretas; (6) conclusión que resuma la posición ' +
      'y el llamado a la acción. Procura que el documento completo ocupe entre una y dos cuartillas.',
  },
  { type: 'pagebreak' },

  // ── I. Postura del país ──
  { type: 'h1', text: 'I. Postura del País' },
  {
    type: 'p',
    text:
      `La delegación de ${COUNTRY} sostiene que ${TOPIC.toLowerCase()} exige, ante todo, ` +
      'un compromiso renovado con el multilateralismo y con los mecanismos de cooperación ' +
      'existentes dentro del sistema de las Naciones Unidas. Nuestro país considera que ninguna ' +
      'crisis transfronteriza —ya sea de naturaleza sanitaria, económica, ambiental o ' +
      'humanitaria— puede resolverse de manera unilateral, y que la fragmentación de los ' +
      'esfuerzos internacionales solamente profundiza las desigualdades entre Estados.',
  },
  {
    type: 'p',
    text:
      `${COUNTRY} ha participado activamente en foros regionales e internacionales orientados ` +
      'a fortalecer los marcos de respuesta conjunta, y reconoce que su propia experiencia ' +
      '—tanto en la gestión de emergencias internas como en la cooperación con países vecinos— ' +
      'ofrece lecciones valiosas para el diseño de mecanismos más resilientes y equitativos a ' +
      'escala global.',
  },
  { type: 'space' },

  // ── II. Introducción al problema ──
  { type: 'h1', text: 'II. Introducción al Problema' },
  {
    type: 'p',
    text:
      'En las últimas décadas, el número y la intensidad de las crisis que trascienden ' +
      'fronteras nacionales ha aumentado de manera sostenida: pandemias, desplazamientos ' +
      'masivos de población, choques económicos encadenados y desastres derivados del cambio ' +
      'climático son hoy fenómenos que ningún Estado, por poderoso que sea, puede contener ' +
      'por sí solo. Sin embargo, las instituciones multilaterales encargadas de coordinar la ' +
      'respuesta internacional con frecuencia carecen de los recursos, la rapidez de reacción ' +
      'o el respaldo político necesarios para actuar con eficacia.',
  },
  {
    type: 'p',
    text:
      'Esta brecha entre la magnitud de los desafíos y la capacidad de respuesta colectiva ' +
      'genera un círculo vicioso: cuando la cooperación multilateral falla o llega tarde, los ' +
      'Estados tienden a privilegiar respuestas unilaterales o bilaterales que, aunque ' +
      'comprensibles desde una lógica de supervivencia inmediata, debilitan aún más la ' +
      'confianza en el sistema internacional y dificultan la construcción de soluciones ' +
      'duraderas.',
  },
  { type: 'space' },

  // ── III. Argumentos centrales ──
  { type: 'h1', text: 'III. Argumentos Centrales' },
  {
    type: 'num', n: 1,
    text:
      'La cooperación multilateral reduce costos y duplicidades: cuando los Estados comparten ' +
      'información, capacidades técnicas e infraestructura logística desde el inicio de una ' +
      'crisis, la respuesta conjunta resulta más rápida y menos costosa que la suma de ' +
      'esfuerzos aislados y descoordinados.',
  },
  {
    type: 'num', n: 2,
    text:
      'Las crisis transfronterizas afectan de manera desproporcionada a los países en ' +
      'desarrollo, que con frecuencia cuentan con menos recursos para amortiguar sus efectos; ' +
      'fortalecer los mecanismos multilaterales es, por lo tanto, también una cuestión de ' +
      'justicia y equidad internacional.',
  },
  {
    type: 'num', n: 3,
    text:
      'La legitimidad de cualquier mecanismo de respuesta depende de que su gobernanza sea ' +
      'percibida como representativa e inclusiva; los marcos que excluyen a regiones enteras ' +
      'de la toma de decisiones tienden a generar resistencia política y a fracasar en el ' +
      'momento de mayor necesidad.',
  },
  {
    type: 'num', n: 4,
    text:
      'La prevención es más eficaz —y considerablemente más barata— que la reacción tardía: ' +
      'invertir en sistemas de alerta temprana, intercambio de datos y ejercicios conjuntos de ' +
      'preparación reduce de forma significativa el costo humano y económico de las crisis ' +
      'futuras.',
  },
  { type: 'space' },

  // ── IV. Propuestas de solución ──
  { type: 'h1', text: 'IV. Propuestas de Solución' },
  {
    type: 'bullet',
    text:
      'Establecer un fondo multilateral de respuesta rápida, financiado de forma proporcional ' +
      'y con reglas claras de acceso, que permita desembolsar recursos a los países afectados ' +
      'dentro de los primeros días de una crisis declarada.',
  },
  {
    type: 'bullet',
    text:
      'Crear una red permanente de intercambio de información entre agencias nacionales y ' +
      'organismos internacionales, con protocolos comunes de reporte que faciliten la ' +
      'detección temprana de amenazas transfronterizas.',
  },
  {
    type: 'bullet',
    text:
      'Promover ejercicios conjuntos de simulación y capacitación entre Estados de distintas ' +
      'regiones, de manera que los equipos de respuesta puedan coordinarse eficazmente cuando ' +
      'una crisis real lo exija.',
  },
  {
    type: 'bullet',
    text:
      'Garantizar la representación equitativa de los países en desarrollo en los órganos de ' +
      'decisión de los mecanismos multilaterales de respuesta, de modo que las soluciones ' +
      'adoptadas reflejen las realidades y capacidades de todas las regiones.',
  },
  {
    type: 'bullet',
    text:
      'Incentivar alianzas entre el sector público, la sociedad civil y organismos técnicos ' +
      'especializados para ampliar la capacidad operativa sin duplicar estructuras burocráticas ' +
      'existentes.',
  },
  { type: 'space' },

  // ── V. Conclusión ──
  { type: 'h1', text: 'V. Conclusión' },
  {
    type: 'p',
    text:
      `${COUNTRY} hace un llamado a esta ${COMMITTEE} para que avance hacia un marco de ` +
      'cooperación multilateral más ágil, inclusivo y mejor financiado, capaz de anticipar y ' +
      'amortiguar las crisis transfronterizas del siglo XXI. Nuestra delegación reitera su ' +
      'disposición a trabajar de manera constructiva con todas las demás delegaciones para ' +
      'construir consensos amplios y duraderos, convencidos de que solo mediante la acción ' +
      'conjunta —y no el aislamiento— podrán las naciones del mundo enfrentar con éxito los ' +
      'desafíos que hoy comparten.',
  },
  { type: 'space' }, { type: 'space' },
  { type: 'rule' },
  { type: 'space' },
  {
    type: 'meta',
    text:
      'Recordatorio final: cita siempre tus fuentes, manténte fiel a la postura real de tu país ' +
      '(no a tu opinión personal) y revisa la extensión y el formato solicitados por la mesa ' +
      'directiva de tu comité antes de la entrega.',
  },
];

// Re-map our `p` blocks (plain paragraphs) onto the existing layout types —
// the shared `layout()` treats anything without a recognised `type` as body
// text via the default branch, so plain paragraphs use `type: 'p'` mapped
// to the same metrics as body text by simply NOT special-casing it above
// (isH1/isH2/isMeta/isBullet/isNum all evaluate false → body style). No
// further transformation needed; `layout()` already handles `'p'` blocks
// through its default (body-text) path.

const pages = layout(blocks);
const pdf = buildPdf(pages, 'MUNBOLDT 2027 — Position Paper (Ejemplo)', 'MUNBOLDT 2027 — Colegio Humboldt Puebla');

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, pdf);
console.log(`[generate-position-paper-pdf] wrote ${OUT_PATH} (${pdf.length} bytes, ${pages.length} pages)`);
