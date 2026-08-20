import { BROWSER_USER_AGENT } from './captions';

/**
 * Recherche de vidéos YouTube par mots-clés — méthode NON OFFICIELLE,
 * même statut de fiabilité que la liste des pistes de sous-titres dans
 * `captions.ts` (extraction d'un JSON embarqué dans une page HTML
 * publique, pas un endpoint d'API séparé). **Testé fonctionnel en
 * direct pendant cette session (20/08/2026)** : `ytInitialData` est bien
 * présent et parsable sur `youtube.com/results`, contrairement au fetch
 * du CONTENU des sous-titres (`timedtext`) qui, lui, a échoué à trois
 * reprises — cette recherche utilise la même famille de technique que
 * l'extraction de `captionTracks` (qui, elle, avait fonctionné), pas
 * celle qui avait échoué. Reste non officiel : peut casser si YouTube
 * change la structure de cette page, sans préavis.
 */
export interface YoutubeSearchResult {
  videoId: string;
  title: string;
  channel: string;
  thumbnailUrl: string;
  /** Ex. "45:07", ou `null` si absent (ex. certains lives). */
  lengthText: string | null;
}

function extractRunsText(field: unknown): string | null {
  if (!field || typeof field !== 'object') return null;
  const runs = (field as { runs?: unknown }).runs;
  if (!Array.isArray(runs) || runs.length === 0) return null;
  return runs.map((r) => (typeof r === 'object' && r && typeof (r as { text?: unknown }).text === 'string' ? (r as { text: string }).text : '')).join('');
}

/** Parcourt récursivement le JSON de la page de résultats à la recherche
 * de tout objet `videoRenderer` — la page mélange des types de blocs
 * (vidéos, chaînes, playlists, filtres...) sans schéma global unique,
 * donc une recherche en profondeur est plus robuste qu'un chemin fixe
 * (`contents.twoColumn...`), qui casserait à la moindre réorganisation
 * de la mise en page par YouTube. */
function collectVideoRenderers(node: unknown, out: Record<string, unknown>[], depth: number): void {
  if (depth > 40 || !node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  if (obj.videoRenderer && typeof obj.videoRenderer === 'object') {
    out.push(obj.videoRenderer as Record<string, unknown>);
  }
  for (const key of Object.keys(obj)) {
    collectVideoRenderers(obj[key], out, depth + 1);
  }
}

function parseVideoRenderer(r: Record<string, unknown>): YoutubeSearchResult | null {
  const videoId = r.videoId;
  if (typeof videoId !== 'string') return null;

  const title = extractRunsText(r.title);
  if (!title) return null;

  const channel = extractRunsText(r.ownerText) ?? extractRunsText(r.longBylineText) ?? '';

  const thumbnails = (r.thumbnail as { thumbnails?: { url?: unknown }[] } | undefined)?.thumbnails;
  const lastThumbnail = thumbnails && thumbnails.length > 0 ? thumbnails[thumbnails.length - 1] : undefined;
  const thumbnailUrl = typeof lastThumbnail?.url === 'string' ? lastThumbnail.url : '';

  const lengthText = (r.lengthText as { simpleText?: unknown } | undefined)?.simpleText;

  return {
    videoId,
    title,
    channel,
    thumbnailUrl,
    lengthText: typeof lengthText === 'string' ? lengthText : null,
  };
}

/** `[]` en cas d'échec réseau/parsing plutôt qu'une exception — même
 * principe de dégradation silencieuse que le reste de `listening/`.
 * `hl=es` sur la requête pour privilégier des résultats en espagnol,
 * cohérent avec le but de l'app (pas une garantie stricte, YouTube reste
 * libre de renvoyer autre chose selon la requête tapée). */
export async function searchYoutubeVideos(query: string): Promise<YoutubeSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  try {
    const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(trimmed)}&hl=es`, {
      headers: { 'User-Agent': BROWSER_USER_AGENT },
    });
    if (!res.ok) return [];

    const html = await res.text();
    const match = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
    if (!match) return [];

    let data: unknown;
    try {
      data = JSON.parse(match[1]);
    } catch {
      return [];
    }

    const renderers: Record<string, unknown>[] = [];
    collectVideoRenderers(data, renderers, 0);

    const results: YoutubeSearchResult[] = [];
    const seen = new Set<string>();
    for (const renderer of renderers) {
      const parsed = parseVideoRenderer(renderer);
      if (parsed && !seen.has(parsed.videoId)) {
        seen.add(parsed.videoId);
        results.push(parsed);
      }
    }
    return results.slice(0, 15);
  } catch {
    return [];
  }
}
