/**
 * Parsing pur, sans aucun import réseau/JSZip/React Native — même
 * principe que `listening/transcriptParsing.ts` : reste testable en
 * isolation (voir docs/CONVENTIONS.md, "Pure logic separated from React
 * components"). L'orchestration réseau + décompression ZIP (EPUB) vit
 * dans `services/bookImport.ts`, qui appelle ces fonctions avec du texte
 * déjà extrait.
 */

export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

/** Retire les balises HTML pour ne garder que le texte — regex, pas un
 * vrai parseur DOM (aucun disponible côté React Native/Hermes sans
 * dépendance native). Suffisant pour du XHTML d'EPUB/HTML simple, pas
 * robuste à du HTML malformé complexe. */
export function stripHtmlTags(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<(br|p|div|h[1-6]|li|tr)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Cherche un `<h1>`/`<h2>` puis un `<title>`, dans cet ordre — best
 * effort, `null` si rien trouvé (l'appelant retombe alors sur un titre
 * générique type "Chapitre N"). */
export function extractTitleFromHtml(html: string): string | null {
  const headingMatch = html.match(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/i);
  if (headingMatch) {
    const text = stripHtmlTags(headingMatch[1]).trim();
    if (text) return text;
  }
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    const text = stripHtmlTags(titleMatch[1]).trim();
    if (text) return text;
  }
  return null;
}

export interface ParsedChapter {
  title: string;
  content: string;
}

// Choisi pour donner des chapitres d'une taille de lecture raisonnable
// (repli de dernier recours, pas la structure réelle du livre) — pas
// mesuré empiriquement contre un vrai usage, ajustable si trop long/court.
const CHUNK_SIZE = 6000;

/** Repli de dernier recours : découpe un texte déjà nettoyé en morceaux
 * d'environ `chunkSize` caractères, sans jamais couper un paragraphe en
 * deux. Utilisé quand aucune structure de chapitres n'a été trouvée. */
export function splitByLength(text: string, chunkSize = CHUNK_SIZE): ParsedChapter[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: ParsedChapter[] = [];
  let current: string[] = [];
  let currentLength = 0;
  let partNumber = 1;

  const flush = () => {
    if (current.length === 0) return;
    chunks.push({ title: `Partie ${partNumber}`, content: current.join('\n\n') });
    partNumber += 1;
    current = [];
    currentLength = 0;
  };

  for (const paragraph of paragraphs) {
    if (currentLength > 0 && currentLength + paragraph.length > chunkSize) flush();
    current.push(paragraph);
    currentLength += paragraph.length;
  }
  flush();

  return chunks.length > 0 ? chunks : [{ title: 'Partie 1', content: text.trim() }];
}

// "Chapter 12", "Capítulo IV", "Chapitre 3" — les trois langues déjà
// présentes dans l'app (chrome français, contenu espagnol, traductions
// anglaises), reconnues comme marqueurs de chapitre dans un fichier TXT.
const CHAPTER_MARKER = /^\s*(chapter|cap[ií]tulo|chapitre)\s+([0-9]+|[ivxlcdm]+)\b/i;

/** Découpage heuristique d'un texte brut (TXT) en chapitres — cherche des
 * lignes marqueurs ("Chapter N" etc.) ; à défaut de trouver AU MOINS deux
 * marqueurs (un seul pourrait être un faux positif ailleurs dans le
 * texte), repli sur [splitByLength]. */
export function splitTxtIntoChapters(text: string): ParsedChapter[] {
  const lines = text.split(/\r?\n/);
  const markers: { lineIndex: number; title: string }[] = [];
  lines.forEach((line, i) => {
    if (CHAPTER_MARKER.test(line.trim())) {
      markers.push({ lineIndex: i, title: line.trim() });
    }
  });

  if (markers.length < 2) return splitByLength(text);

  const chapters: ParsedChapter[] = [];
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].lineIndex;
    const end = i + 1 < markers.length ? markers[i + 1].lineIndex : lines.length;
    const content = lines.slice(start + 1, end).join('\n').trim();
    if (content) chapters.push({ title: markers[i].title, content });
  }
  return chapters.length > 0 ? chapters : splitByLength(text);
}

/** Découpage heuristique d'un fichier HTML brut (pas un EPUB) — cherche
 * des limites `<h1>`/`<h2>` AVANT de retirer les balises (pour garder les
 * titres), repli sur [splitByLength] si moins de deux titres trouvés. */
export function splitHtmlIntoChapters(html: string): ParsedChapter[] {
  const parts = html.split(/(?=<h[12]\b[^>]*>)/i).filter((p) => p.trim());
  if (parts.length < 2) return splitByLength(stripHtmlTags(html));

  return parts
    .map((part) => {
      const title = extractTitleFromHtml(part) ?? 'Chapitre';
      const content = stripHtmlTags(part.replace(/<h[12]\b[^>]*>[\s\S]*?<\/h[12]>/i, ''));
      return { title, content };
    })
    .filter((c) => c.content.length > 0);
}

/** Découpe un paragraphe en phrases — pour le "tap sur une phrase pour
 * traduire" de ReaderScreen.tsx. Split après un signe de ponctuation
 * final suivi d'espace(s) (lookbehind, supporté par Hermes) — heuristique
 * simple, pas robuste aux abréviations ("Sr.", "etc.") qui produiront des
 * coupures supplémentaires ; acceptable ici car chaque "phrase" reste
 * traduisible individuellement même coupée un peu tôt. */
export function splitIntoSentences(paragraph: string): string[] {
  const parts = paragraph
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [paragraph];
}

// MARK: - EPUB (XML du conteneur/OPF — le dézippage lui-même vit dans
// services/bookImport.ts via JSZip, ce module ne reçoit que du texte déjà
// extrait des entrées du zip)

/** Lit `META-INF/container.xml` pour trouver le chemin du fichier OPF
 * (le manifeste principal d'un EPUB) — structure standard EPUB2/EPUB3,
 * un seul `<rootfile>` géré (le cas quasi-universel en pratique). */
export function findOpfPath(containerXml: string): string | null {
  const match = containerXml.match(/full-path="([^"]+)"/);
  return match ? match[1] : null;
}

/** Parse le manifeste (id → chemin de fichier) et l'ordre de lecture
 * (`<spine>`, liste d'ids) du fichier OPF — le spine est la SEULE source
 * fiable pour l'ordre des chapitres (contrairement à une table des
 * matières nav/NCX, optionnelle et pas toujours présente). */
export function parseOpfManifestAndSpine(opfXml: string): { manifest: Map<string, string>; spineIds: string[] } {
  const manifest = new Map<string, string>();
  const itemRegex = /<item\b[^>]*\/?>/gi;
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itemRegex.exec(opfXml))) {
    const tag = itemMatch[0];
    const idMatch = tag.match(/\bid="([^"]+)"/);
    const hrefMatch = tag.match(/\bhref="([^"]+)"/);
    if (idMatch && hrefMatch) manifest.set(idMatch[1], hrefMatch[1]);
  }

  const spineIds: string[] = [];
  const spineBlockMatch = opfXml.match(/<spine\b[\s\S]*?<\/spine>/i);
  if (spineBlockMatch) {
    const itemrefRegex = /<itemref\b[^>]*\bidref="([^"]+)"/gi;
    let refMatch: RegExpExecArray | null;
    while ((refMatch = itemrefRegex.exec(spineBlockMatch[0]))) {
      spineIds.push(refMatch[1]);
    }
  }

  return { manifest, spineIds };
}

export function extractTitleAndAuthorFromOpf(opfXml: string): { title: string | null; author: string | null } {
  const titleMatch = opfXml.match(/<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/i);
  const authorMatch = opfXml.match(/<dc:creator\b[^>]*>([\s\S]*?)<\/dc:creator>/i);
  return {
    title: titleMatch ? stripHtmlTags(titleMatch[1]).trim() || null : null,
    author: authorMatch ? stripHtmlTags(authorMatch[1]).trim() || null : null,
  };
}

/** Résout un `href` de manifeste (relatif au dossier du fichier OPF)
 * en chemin complet dans l'archive zip. */
export function resolveOpfRelativePath(opfPath: string, href: string): string {
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  return opfDir + href;
}
