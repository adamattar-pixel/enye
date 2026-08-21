/** Métadonnées minimales via l'endpoint officiel oEmbed de YouTube — pas
 * de clé API requise, testé fonctionnel pendant cette session (voir
 * docs/AUDIT.md, 20/08/2026). Ne fournit pas la durée de la vidéo (aucune
 * source officielle sans clé API — `durationSeconds` reste `null`,
 * voir `listening/types.ts`). */
export interface VideoMetadata {
  title: string;
  channel: string;
  thumbnailUrl: string;
}

/** `null` en cas d'échec réseau ou de réponse inattendue — jamais
 * d'exception qui remonterait jusqu'à l'UI (dégradation silencieuse,
 * demandé explicitement pour toute cette fonctionnalité). */
export async function fetchVideoMetadata(videoId: string): Promise<VideoMetadata | null> {
  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`
    )}&format=json`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const json = (await res.json()) as { title?: unknown; author_name?: unknown; thumbnail_url?: unknown };
    if (typeof json.title !== 'string' || typeof json.author_name !== 'string' || typeof json.thumbnail_url !== 'string') {
      return null;
    }

    return { title: json.title, channel: json.author_name, thumbnailUrl: json.thumbnail_url };
  } catch {
    return null;
  }
}
