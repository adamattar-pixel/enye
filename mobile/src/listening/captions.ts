import type { CaptionStatus } from './types';

/**
 * Récupération des sous-titres YouTube — méthode NON OFFICIELLE, voir
 * PLAN.md/AUDIT.md pour le détail complet. Deux étapes distinctes,
 * documentées séparément parce qu'elles n'ont pas le même statut de
 * fiabilité vérifiée :
 *
 * 1. **Liste des pistes disponibles** — extraite du JSON
 *    `ytInitialPlayerResponse` embarqué dans le HTML de la page
 *    `watch?v=...`. Testé fonctionnel pendant cette session
 *    (20/08/2026) : le JSON est bien présent et parsable.
 * 2. **Contenu d'une piste** (le texte + horodatages) — récupéré à
 *    l'URL `baseUrl` fournie par l'étape 1. **Testé pendant cette
 *    session et le résultat a été une réponse HTTP 200 avec un corps
 *    VIDE**, y compris en reproduisant les cookies de session et
 *    différents paramètres de format (`fmt=json3`). Cause exacte non
 *    identifiée avec certitude — hypothèse la plus probable : YouTube a
 *    renforcé la détection de requêtes non-navigateur sur cet endpoint
 *    depuis que cette méthode a été documentée par la communauté (une
 *    tentative avec l'API interne InnerTube, utilisée par des outils à
 *    jour comme yt-dlp, a aussi échoué avec une erreur
 *    "Precondition check failed"). **Il est possible que ça fonctionne
 *    différemment depuis le contexte réseau réel d'un iPhone (IP
 *    résidentielle plutôt que le réseau de ce bac à sable de
 *    développement, souvent plus agressivement filtré) — à vérifier en
 *    priorité sur device avant de considérer cette fonctionnalité
 *    fiable.** Voir AUDIT.md pour le détail exact des tests faits.
 *
 * En cas d'échec à n'importe quelle étape, retourne un statut
 * `unavailable` plutôt que de lever une exception — cohérent avec la
 * dégradation silencieuse demandée explicitement : une vidéo dont les
 * sous-titres ne peuvent pas être récupérés reste ajoutable à la
 * bibliothèque, juste non exploitable pour les exercices.
 */

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string; // "asr" = auto-généré ; absent = piste humaine
}

interface CaptionCue {
  startTime: number;
  endTime: number;
  transcript: string;
}

export interface VideoCaptionsResult {
  status: CaptionStatus;
  language: string;
  segments: CaptionCue[];
}

// Exporté pour être réutilisé par `listening/search.ts` — même technique de
// base (page HTML publique de youtube.com avec un User-Agent de navigateur),
// pas de raison d'avoir deux chaînes identiques à maintenir séparément.
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

async function fetchCaptionTrackList(videoId: string): Promise<CaptionTrack[]> {
  const res = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
    headers: { 'User-Agent': BROWSER_USER_AGENT },
  });
  if (!res.ok) return [];

  const html = await res.text();
  const match = html.match(/"captionTracks":(\[.*?\])(?=,"audioTracks"|,"translationLanguages")/);
  if (!match) return [];

  try {
    return JSON.parse(match[1]) as CaptionTrack[];
  } catch {
    return [];
  }
}

/** Préfère une piste espagnole humaine ; à défaut, la piste
 * auto-générée (`kind: 'asr'`) si c'est la seule disponible — accepter
 * les deux plutôt que rejeter l'ASR, avec `captionStatus` qui distingue
 * les deux pour l'UI (voir AUDIT.md, "Segmentation"). */
function pickSpanishTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  const spanish = tracks.filter((t) => t.languageCode.toLowerCase().startsWith('es'));
  if (spanish.length === 0) return null;
  const manual = spanish.find((t) => t.kind !== 'asr');
  return manual ?? spanish[0];
}

/** Entités HTML les plus courantes dans les sous-titres YouTube —
 * décodage minimal, pas un décodeur HTML complet (pas de bibliothèque
 * XML/HTML disponible sans nouvelle dépendance pour ce seul besoin). */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

/** Parse le format XML par défaut de `timedtext` (pas de `fmt=` dans
 * l'URL) : `<text start="1.23" dur="2.5">contenu</text>` répétés. Par
 * regex plutôt qu'un vrai parseur XML (aucun disponible sans nouvelle
 * dépendance) — suffisant pour ce format simple et plat, pas robuste à
 * un XML imbriqué ou malformé. */
function parseTimedTextXml(xml: string): CaptionCue[] {
  const cues: CaptionCue[] = [];
  const pattern = /<text start="([\d.]+)" dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    const startTime = parseFloat(match[1]);
    const duration = parseFloat(match[2]);
    const transcript = decodeHtmlEntities(match[3].trim());
    if (transcript.length === 0) continue;
    cues.push({ startTime, endTime: startTime + duration, transcript });
  }
  return cues;
}

/** Point d'entrée unique : récupère et segmente les sous-titres
 * espagnols d'une vidéo, ou renvoie `unavailable` si quoi que ce soit
 * échoue à n'importe quelle étape (jamais d'exception). */
export async function fetchVideoCaptions(videoId: string): Promise<VideoCaptionsResult> {
  try {
    const tracks = await fetchCaptionTrackList(videoId);
    const track = pickSpanishTrack(tracks);
    if (!track) return { status: 'unavailable', language: 'es', segments: [] };

    const res = await fetch(track.baseUrl, { headers: { 'User-Agent': BROWSER_USER_AGENT } });
    if (!res.ok) return { status: 'unavailable', language: track.languageCode, segments: [] };

    const xml = await res.text();
    const segments = parseTimedTextXml(xml);
    if (segments.length === 0) return { status: 'unavailable', language: track.languageCode, segments: [] };

    return {
      status: track.kind === 'asr' ? 'auto_generated' : 'available',
      language: track.languageCode,
      segments,
    };
  } catch {
    return { status: 'unavailable', language: 'es', segments: [] };
  }
}
