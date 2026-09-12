import { decodeHtmlEntities, parseTimedTextXml, type CaptionCue } from './captions';

/**
 * Parsing pur, sans aucun import React/React Native — extrait de
 * `TranscriptFetcher.tsx` le 21/08/2026 spécifiquement pour rester
 * testable : `TranscriptFetcher.tsx` importe `react-native-webview`, qui
 * lève une exception au chargement du module sous Jest ("TurboModuleRegistry
 * ... RNCWebViewModule could not be found", aucun module natif enregistré
 * dans l'environnement de test) — impossible d'y tester quoi que ce soit,
 * même une fonction 100% pure, tant qu'elle vit dans ce fichier. Même
 * principe déjà en place ailleurs dans `listening/` (voir
 * `docs/CONVENTIONS.md`, "Pure logic separated from React components").
 */

/** Extrait le paramètre `lang=` de l'URL `timedtext` interceptée — c'est
 * la langue réellement servie par YouTube pour cette requête (peut être
 * une piste manuelle, auto-générée, OU une traduction automatique vers
 * une autre langue). Sert à ne plus étiqueter les résultats `language:
 * 'es'` en dur sans vérifier ce qui a réellement été capturé (bug trouvé
 * le 21/08/2026 : la chanson "Nuevayol" importée avec des paroles en
 * anglais alors que la chanson est en espagnol — causé par un en-tête
 * `Accept-Language: en-US` biaisant la piste par défaut proposée par
 * YouTube ; corrigé séparément dans `TranscriptFetcher.tsx`, mais le
 * champ `language` restait de toute façon faux même avant ce correctif). */
export function extractLangFromUrl(url: string): string {
  const match = url.match(/[?&]lang=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : 'es';
}

/** Le corps intercepté peut être du XML `timedtext` classique, du JSON
 * `fmt=json3` (confirmé le 21/08/2026 par un vrai payload intercepté en
 * conditions réelles — voir plus bas), ou du JSON `get_transcript` —
 * détecté par le premier caractère non-blanc plutôt que supposé. */
export function parseInterceptedBody(body: string): CaptionCue[] {
  const trimmed = body.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('<')) return parseTimedTextXml(trimmed);
  try {
    const json = JSON.parse(trimmed);
    const json3Segments = parseJson3Captions(json);
    if (json3Segments.length > 0) return json3Segments;
    const panelSegments = extractPanelTranscriptSegments(json);
    if (panelSegments.length > 0) return panelSegments;
    return extractJsonTranscriptSegments(json);
  } catch {
    return [];
  }
}

/** Format `get_panel` (nouvelle architecture "ViewModel" de YouTube,
 * remplace `get_transcript` — voir `captionsPreload.ts`) — **confirmé
 * le 12/09/2026 par un vrai payload intercepté** via le débogueur Chrome
 * DevTools Protocol : chaque ligne du panneau est un
 * `macroMarkersPanelItemViewModel` (texte dans
 * `item.timelineItemViewModel.contentItems[].transcriptSegmentViewModel.
 * simpleText`, début en secondes dans
 * `onTap.innertubeCommand.watchEndpoint.startTimeSeconds` — ou, à défaut,
 * la chaîne `item.timelineItemViewModel.timestamp` du type `"0:18"` à
 * parser). Parcours récursif (comme `extractJsonTranscriptSegments`)
 * plutôt qu'un chemin fixe : structure interne non documentée, sujette à
 * changer sans préavis. Le panneau n'affiche qu'un timestamp de DÉBUT par
 * ligne, d'où `pairDomSegments` pour déduire les fins (même logique que
 * pour le repli DOM). */
export function extractPanelTranscriptSegments(root: unknown): CaptionCue[] {
  const raw: { startTime: number; text: string }[] = [];
  function walk(node: unknown, level: number): void {
    if (level > 60 || !node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    const panelItem = obj.macroMarkersPanelItemViewModel;
    if (panelItem && typeof panelItem === 'object') {
      const segment = extractPanelItemSegment(panelItem as Record<string, unknown>);
      if (segment) raw.push(segment);
    }
    for (const key of Object.keys(obj)) walk(obj[key], level + 1);
  }
  walk(root, 0);
  return raw.length > 0 ? pairDomSegments(raw) : [];
}

function extractPanelItemSegment(panelItem: Record<string, unknown>): { startTime: number; text: string } | null {
  const item = panelItem.item as Record<string, unknown> | undefined;
  const timelineItem = item?.timelineItemViewModel as Record<string, unknown> | undefined;
  const contentItems = timelineItem?.contentItems;
  if (!Array.isArray(contentItems)) return null;

  const text = contentItems
    .map((contentItem) => {
      const segmentViewModel = (contentItem as Record<string, unknown> | null)?.transcriptSegmentViewModel as
        | Record<string, unknown>
        | undefined;
      return typeof segmentViewModel?.simpleText === 'string' ? segmentViewModel.simpleText : '';
    })
    .join(' ')
    .trim();
  if (!text) return null;

  const onTap = panelItem.onTap as Record<string, unknown> | undefined;
  const innertubeCommand = onTap?.innertubeCommand as Record<string, unknown> | undefined;
  const watchEndpoint = innertubeCommand?.watchEndpoint as Record<string, unknown> | undefined;
  const startTimeSeconds = watchEndpoint?.startTimeSeconds;
  if (typeof startTimeSeconds === 'number') {
    return { startTime: startTimeSeconds, text: decodeHtmlEntities(text) };
  }

  const timestamp = typeof timelineItem?.timestamp === 'string' ? timelineItem.timestamp : null;
  const parsedTimestamp = timestamp ? parseTimestampString(timestamp) : null;
  if (parsedTimestamp === null) return null;
  return { startTime: parsedTimestamp, text: decodeHtmlEntities(text) };
}

function parseTimestampString(text: string): number | null {
  const parts = text.trim().split(':');
  let seconds = 0;
  for (const part of parts) {
    const n = parseInt(part, 10);
    if (Number.isNaN(n)) return null;
    seconds = seconds * 60 + n;
  }
  return seconds;
}

/** Format `timedtext?...&fmt=json3` — **confirmé réellement par un test
 * sur device le 21/08/2026** : l'interception réseau a capturé un corps
 * JSON de 858 225 caractères pour une vraie requête `timedtext` (avec un
 * paramètre `pot=...&potc=1` — le "PoToken" généré correctement par le
 * propre code de la page, exactement l'hypothèse retenue dans
 * docs/AUDIT.md), mais 0 segments en sortaient : ce fichier ne reconnaissait
 * que la forme `get_transcript` (`startMs`/`endMs`/`snippet`), pas cette
 * forme-ci (`events[].tStartMs`/`dDurationMs`/`segs[].utf8`) — d'où le
 * "0 segments" alors que le contenu était en réalité récupéré avec
 * succès. Format documenté publiquement (pas une structure interne
 * jamais vue) : `{ events: [{ tStartMs, dDurationMs, segs: [{ utf8 }] }] }`,
 * certains événements n'ont pas de `segs` (positionnement seul) et sont
 * ignorés. */
export function parseJson3Captions(json: unknown): CaptionCue[] {
  if (!json || typeof json !== 'object') return [];
  const events = (json as { events?: unknown }).events;
  if (!Array.isArray(events)) return [];

  const cues: CaptionCue[] = [];
  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    const e = event as { tStartMs?: unknown; dDurationMs?: unknown; segs?: unknown };
    if (typeof e.tStartMs !== 'number' || !Array.isArray(e.segs)) continue;

    const text = e.segs
      .map((seg) => (seg && typeof seg === 'object' && typeof (seg as { utf8?: unknown }).utf8 === 'string' ? (seg as { utf8: string }).utf8 : ''))
      .join('')
      .replace(/\n/g, ' ')
      .trim();
    if (!text) continue;

    const startTime = e.tStartMs / 1000;
    const duration = typeof e.dDurationMs === 'number' ? e.dDurationMs / 1000 : 4;
    cues.push({ startTime, endTime: startTime + duration, transcript: decodeHtmlEntities(text) });
  }
  return cues;
}

/** Parcourt récursivement le JSON de `get_transcript` à la recherche de
 * tout objet portant `startMs`/`endMs` — pas un chemin fixe dans
 * l'arborescence (structure interne non officielle, jamais observée
 * directement dans cette session puisque l'endpoint renvoyait
 * systématiquement une erreur depuis ce réseau, voir docs/AUDIT.md) : une
 * recherche en profondeur est la seule approche raisonnable sans avoir
 * pu inspecter un vrai payload. Repli seulement — `fmt=json3`
 * (`parseJson3Captions` ci-dessus) est la forme réellement observée. */
export function extractJsonTranscriptSegments(root: unknown, depth = 0): CaptionCue[] {
  const out: CaptionCue[] = [];
  function walk(node: unknown, level: number) {
    if (level > 60 || !node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    const startMs = obj.startMs;
    const endMs = obj.endMs;
    if ((typeof startMs === 'string' || typeof startMs === 'number') && (typeof endMs === 'string' || typeof endMs === 'number')) {
      const text = extractSnippetText(obj.snippet);
      if (text) {
        out.push({ startTime: Number(startMs) / 1000, endTime: Number(endMs) / 1000, transcript: text });
      }
    }
    for (const key of Object.keys(obj)) walk(obj[key], level + 1);
  }
  walk(root, depth);
  return out;
}

function extractSnippetText(snippet: unknown): string | null {
  if (!snippet || typeof snippet !== 'object') return null;
  const s = snippet as { simpleText?: unknown; runs?: unknown };
  if (typeof s.simpleText === 'string') return decodeHtmlEntities(s.simpleText.trim());
  if (Array.isArray(s.runs)) {
    const text = s.runs
      .map((r) => (r && typeof r === 'object' && typeof (r as { text?: unknown }).text === 'string' ? (r as { text: string }).text : ''))
      .join('')
      .trim();
    return text.length > 0 ? decodeHtmlEntities(text) : null;
  }
  return null;
}

/** Le panneau de transcription n'affiche qu'un timestamp de DÉBUT par
 * ligne (pas de fin) — la fin de chaque segment est déduite du début du
 * suivant ; le dernier segment reçoit une durée par défaut de 4s (durée
 * plausible pour une ligne de dictée, cohérent avec ce qui est utilisé
 * ailleurs dans `listening/` comme hypothèse non mesurée). */
export function pairDomSegments(raw: { startTime: number; text: string }[]): CaptionCue[] {
  const sorted = [...raw].sort((a, b) => a.startTime - b.startTime);
  return sorted.map((seg, index) => ({
    startTime: seg.startTime,
    endTime: index < sorted.length - 1 ? sorted[index + 1].startTime : seg.startTime + 4,
    transcript: seg.text,
  }));
}
