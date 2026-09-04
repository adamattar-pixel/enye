import type { TranscriptFetchResult } from './types';

/**
 * Remplace `TranscriptFetcher.tsx` (hook React monté dans l'arbre,
 * `react-native-webview`) — la fenêtre cachée qui charge la vraie page
 * YouTube vit maintenant entièrement dans le process principal Electron
 * (voir `electron/captionsFetcher.ts`), donc plus besoin de monter quoi
 * que ce soit côté renderer : un simple appel IPC asynchrone suffit.
 */
export function fetchTranscriptViaDesktop(videoId: string): Promise<TranscriptFetchResult> {
  if (!window.lexisDesktop) {
    return Promise.resolve({ status: 'unavailable', language: 'es', segments: [] });
  }
  return window.lexisDesktop.captions.fetch(videoId);
}
