import JSZip from 'jszip';
import type { BookFormat } from '../books/types';
import {
  splitTxtIntoChapters,
  splitHtmlIntoChapters,
  extractTitleFromHtml,
  stripHtmlTags,
  findOpfPath,
  parseOpfManifestAndSpine,
  extractTitleAndAuthorFromOpf,
  resolveOpfRelativePath,
  type ParsedChapter,
} from '../books/parsing';

/**
 * Téléchargement + parsing d'un livre — orchestration réseau/JSZip,
 * s'appuie sur `books/parsing.ts` (pur, testé séparément) pour tout le
 * texte une fois extrait. PDF volontairement absent (voir
 * docs/DECISIONS.md, 21/08/2026) : aucune extraction fiable identifiée
 * sans dépendance native, qui casserait la contrainte Expo Go de
 * CLAUDE.md — EPUB/TXT/HTML seulement.
 */

export interface ParsedBook {
  title: string;
  author: string | null;
  format: BookFormat;
  chapters: ParsedChapter[];
}

export function detectFormatFromUrl(url: string): BookFormat {
  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.epub')) return 'epub';
  if (clean.endsWith('.html') || clean.endsWith('.htm')) return 'html';
  return 'txt';
}

/** EPUB est un zip contenant du XHTML — JSZip (pur JS, aucune
 * dépendance native, voir mobile/scripts/generate-expressions n'a pas
 * cet enjeu mais même principe que Decision 014 : confirmé
 * native-dependency-free avant ajout) pour décompresser, `parsing.ts`
 * pour le XML/XHTML une fois extrait. Le spine du fichier OPF (pas une
 * table des matières nav/NCX, optionnelle) est la seule source utilisée
 * pour l'ordre des chapitres — voir `parseOpfManifestAndSpine`. */
async function parseEpub(buffer: ArrayBuffer): Promise<ParsedBook> {
  const zip = await JSZip.loadAsync(buffer);

  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) throw new Error('EPUB invalide : META-INF/container.xml introuvable.');
  const containerXml = await containerFile.async('string');

  const opfPath = findOpfPath(containerXml);
  if (!opfPath) throw new Error('EPUB invalide : chemin du fichier OPF introuvable dans container.xml.');

  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error(`EPUB invalide : fichier OPF introuvable (${opfPath}).`);
  const opfXml = await opfFile.async('string');

  const { manifest, spineIds } = parseOpfManifestAndSpine(opfXml);
  const { title, author } = extractTitleAndAuthorFromOpf(opfXml);

  const chapters: ParsedChapter[] = [];
  for (const spineId of spineIds) {
    const href = manifest.get(spineId);
    if (!href) continue;
    const fullPath = resolveOpfRelativePath(opfPath, href);
    const entry = zip.file(fullPath) ?? zip.file(decodeURIComponent(fullPath));
    if (!entry) continue;

    const html = await entry.async('string');
    const content = stripHtmlTags(html);
    if (!content) continue;

    chapters.push({ title: extractTitleFromHtml(html) ?? `Chapitre ${chapters.length + 1}`, content });
  }

  if (chapters.length === 0) {
    throw new Error('EPUB invalide : aucun chapitre exploitable trouvé dans le spine.');
  }

  return { title: title ?? 'Sans titre', author, format: 'epub', chapters };
}

/** Dégradation volontairement bruyante (lève une exception), contrairement
 * au reste du projet (captions, écoute) qui dégrade silencieusement —
 * ici, un échec doit être visible immédiatement dans le formulaire
 * d'ajout de BooksScreen.tsx plutôt que de créer silencieusement un
 * livre vide. */
export async function downloadAndParseBook(url: string): Promise<ParsedBook> {
  const format = detectFormatFromUrl(url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Téléchargement échoué (HTTP ${response.status}).`);
  }

  if (format === 'epub') {
    const buffer = await response.arrayBuffer();
    return parseEpub(buffer);
  }

  const text = await response.text();
  if (!text.trim()) {
    throw new Error('Le fichier téléchargé est vide.');
  }

  if (format === 'html') {
    const chapters = splitHtmlIntoChapters(text);
    return { title: extractTitleFromHtml(text) ?? 'Sans titre', author: null, format, chapters };
  }

  const chapters = splitTxtIntoChapters(text);
  const fileName = decodeURIComponent(url.split('/').pop() ?? 'Sans titre').replace(/\.(txt|html?)$/i, '');
  return { title: fileName || 'Sans titre', author: null, format, chapters };
}

export interface BookSearchResult {
  title: string;
  author: string | null;
  downloadUrl: string;
}

/** Recherche par titre via l'API publique Open Library (aucune clé
 * requise) — ne garde que les résultats liés à un identifiant Internet
 * Archive (`doc.ia`), seule source qui garantit un fichier téléchargeable
 * exploitable ici. URL construite directement vers le texte OCR brut
 * (`{id}_djvu.txt`, format public documenté d'IA, toujours présent pour
 * un livre scanné) plutôt que de chercher un éventuel EPUB dans les
 * métadonnées du item — simplification assumée pour cette v1 : qualité
 * "best effort" (OCR), mais garantie de fonctionner pour tout résultat
 * IA sans appel réseau supplémentaire. Dégradation silencieuse vers `[]`
 * en cas d'échec, même principe que `listening/search.ts`. */
export async function searchBooks(query: string): Promise<BookSearchResult[]> {
  try {
    const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=30`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { docs?: unknown[] };
    const docs = Array.isArray(json.docs) ? json.docs : [];

    const results: BookSearchResult[] = [];
    for (const doc of docs) {
      if (!doc || typeof doc !== 'object') continue;
      const d = doc as { title?: unknown; author_name?: unknown; ia?: unknown };
      const iaIds = Array.isArray(d.ia) ? d.ia : typeof d.ia === 'string' ? [d.ia] : [];
      const ia = iaIds.find((id): id is string => typeof id === 'string' && id.length > 0);
      if (!ia) continue;

      results.push({
        title: typeof d.title === 'string' ? d.title : 'Sans titre',
        author: Array.isArray(d.author_name) ? d.author_name.filter((a): a is string => typeof a === 'string').join(', ') : null,
        downloadUrl: `https://archive.org/download/${encodeURIComponent(ia)}/${encodeURIComponent(ia)}_djvu.txt`,
      });
      if (results.length >= 15) break;
    }
    return results;
  } catch {
    return [];
  }
}
