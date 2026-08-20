/** Un videoId YouTube fait 11 caractères alphanumériques + `-`/`_`
 * (format documenté de longue date, stable). */
const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

/** Extrait le videoId d'une URL YouTube, ou `null` si l'URL n'est pas
 * reconnue. Parsing par regex plutôt que le global `URL` — évite une
 * dépendance à sa disponibilité/complétude sous Hermes (React Native),
 * non vérifiée dans cette session. Gère les formats les plus courants :
 * - https://www.youtube.com/watch?v=XXXXXXXXXXX (avec ou sans autres
 *   paramètres avant/après ?v=, ex. ?si=...&v=... ou ?v=...&t=30s)
 * - https://youtu.be/XXXXXXXXXXX
 * - https://www.youtube.com/embed/XXXXXXXXXXX
 * - https://www.youtube.com/shorts/XXXXXXXXXXX
 * - avec ou sans www., avec ou sans schéma http(s). */
export function extractVideoId(url: string): string | null {
  const trimmed = url.trim();

  const patterns = [
    // youtu.be/ID
    /(?:^|\/\/)(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})(?:[?&/]|$)/,
    // youtube.com/watch?...v=ID...
    /(?:^|\/\/)(?:www\.|m\.|music\.)?youtube\.com\/watch\?(?:[^#]*&)?v=([a-zA-Z0-9_-]{11})(?:[&#]|$)/,
    // youtube.com/embed/ID or /shorts/ID
    /(?:^|\/\/)(?:www\.|m\.)?youtube\.com\/(?:embed|shorts)\/([a-zA-Z0-9_-]{11})(?:[?&/]|$)/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match && VIDEO_ID_PATTERN.test(match[1])) return match[1];
  }

  return null;
}
