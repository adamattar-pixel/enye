/** `unavailable` = pas de piste de sous-titres exploitable, vidéo jamais
 * sélectionnée pour un exercice (dégradation silencieuse, demandé
 * explicitement) ; `available` = piste humaine ; `auto_generated` =
 * piste ASR (auto-générée), acceptée mais signalée dans l'UI (qualité
 * de transcription/segmentation moins fiable, voir AUDIT.md). */
export type CaptionStatus = 'available' | 'auto_generated' | 'unavailable';

export interface ListeningVideo {
  id: string; // videoId YouTube (ex. "dQw4w9WgXcQ")
  title: string;
  channel: string;
  thumbnailUrl: string;
  durationSeconds: number | null; // best-effort, voir listening/metadata.ts
  language: string; // code de la piste de sous-titres utilisée (ex. "es")
  captionStatus: CaptionStatus;
  addedAt: string; // ISO
}

export interface ListeningSegment {
  id: string; // `${videoId}:${index}`
  videoId: string;
  index: number;
  startTime: number; // secondes, décimales autorisées
  endTime: number;
  transcript: string;
}
