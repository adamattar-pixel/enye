import type { YoutubeSearchResult } from './search';
import type { VideoMetadata } from './metadata';

export type { YoutubeSearchResult, VideoMetadata };

/**
 * Remplace l'appel direct à `search.ts`/`metadata.ts` côté renderer —
 * confirmé le 11/09/2026 (en-têtes de réponse `curl`) qu'aucun des deux
 * endpoints YouTube utilisés (`youtube.com/results`, `youtube.com/oembed`)
 * n'envoie d'en-tête CORS, donc bloqués depuis un contexte navigateur —
 * même famille de problème que DeepL/Open Library (Decision 016). La
 * recherche dégradait silencieusement vers `[]` (pas d'exception), d'où
 * "aucun résultat" sans erreur visible côté utilisateur. Les fonctions
 * originales tournent maintenant dans le process principal Electron (voir
 * `electron/main.ts`), pas dupliquées, atteintes ici via IPC.
 */
export function searchYoutubeVideos(query: string): Promise<YoutubeSearchResult[]> {
  return window.lexisDesktop?.youtube.search(query) ?? Promise.resolve([]);
}

export function fetchVideoMetadata(videoId: string): Promise<VideoMetadata | null> {
  return window.lexisDesktop?.youtube.metadata(videoId) ?? Promise.resolve(null);
}
