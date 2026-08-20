import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { CaptionStatus } from './types';

export interface TranscriptFetchResult {
  status: CaptionStatus;
  language: string;
  segments: { startTime: number; endTime: number; transcript: string }[];
}

type WebViewMessage =
  | { type: 'debug'; step: string; [key: string]: unknown }
  | { type: 'result'; status: CaptionStatus; language: string; segments: TranscriptFetchResult['segments'] };

/**
 * Script injecté dans une vraie page `youtube.com/watch` chargée en
 * arrière-plan. Contrairement à `captions.ts` (requête HTTP nue, sans
 * contexte navigateur — confirmé cassé à 100% le 20/08/2026, voir ce
 * fichier et AUDIT.md), le `fetch()` ici est émis DEPUIS le JS de la page
 * elle-même : même origine (`https://www.youtube.com`), vrais cookies du
 * moteur WebKit/Chromium de la WebView, vrai fingerprint de navigateur —
 * la requête est indiscernable de celle d'un utilisateur réel qui aurait
 * ouvert cette page. C'est précisément ce que la requête HTTP nue ne
 * pouvait pas offrir.
 *
 * Ne dépend d'aucune hydratation complète de la SPA React/Polymer de
 * YouTube : `captionTracks` est déjà présent dans le HTML initial
 * (rendu côté serveur), donc une simple boucle d'attente sur
 * `document.documentElement.outerHTML` suffit — pas besoin de simuler un
 * clic sur le bouton "Afficher la transcription" ni de dépendre de la
 * structure interne (fragile, change souvent) des composants `ytd-*`.
 */
const INJECTED_SCRIPT = `
(function () {
  function post(msg) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }

  function decodeEntities(s) {
    return s
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#(\\d+);/g, function (_, code) { return String.fromCharCode(parseInt(code, 10)); });
  }

  function parseTimedText(xml) {
    var segments = [];
    var re = /<text start="([\\d.]+)" dur="([\\d.]+)"[^>]*>([\\s\\S]*?)<\\/text>/g;
    var m;
    while ((m = re.exec(xml)) !== null) {
      var start = parseFloat(m[1]);
      var dur = parseFloat(m[2]);
      var text = decodeEntities(m[3].trim());
      if (text.length > 0) segments.push({ startTime: start, endTime: start + dur, transcript: text });
    }
    return segments;
  }

  function pickSpanishTrack(tracks) {
    var spanish = tracks.filter(function (t) { return (t.languageCode || '').toLowerCase().indexOf('es') === 0; });
    if (spanish.length === 0) return null;
    var manual = spanish.filter(function (t) { return t.kind !== 'asr'; })[0];
    return manual || spanish[0];
  }

  function tryExtractAndFetch() {
    var html = document.documentElement.outerHTML;
    var match = html.match(/"captionTracks":(\\[.*?\\])(?=,"audioTracks"|,"translationLanguages")/);
    if (!match) return false;

    var tracks;
    try { tracks = JSON.parse(match[1]); } catch (e) { return false; }
    post({ type: 'debug', step: 'track_list', count: tracks.length, spanishCount: tracks.filter(function(t){return (t.languageCode||'').indexOf('es')===0;}).length });

    var track = pickSpanishTrack(tracks);
    if (!track) {
      post({ type: 'result', status: 'unavailable', language: 'es', segments: [] });
      return true;
    }
    post({ type: 'debug', step: 'track_chosen', language: track.languageCode, kind: track.kind || 'manual' });

    fetch(track.baseUrl, { credentials: 'include' })
      .then(function (res) {
        return res.text().then(function (text) { return { httpStatus: res.status, text: text }; });
      })
      .then(function (r) {
        post({ type: 'debug', step: 'timedtext_fetch', httpStatus: r.httpStatus, length: r.text.length, sample: r.text.slice(0, 150) });
        var segments = r.text.length > 0 ? parseTimedText(r.text) : [];
        post({
          type: 'result',
          status: segments.length > 0 ? (track.kind === 'asr' ? 'auto_generated' : 'available') : 'unavailable',
          language: track.languageCode,
          segments: segments,
        });
      })
      .catch(function (err) {
        post({ type: 'debug', step: 'timedtext_fetch_error', message: String(err) });
        post({ type: 'result', status: 'unavailable', language: track.languageCode, segments: [] });
      });
    return true;
  }

  var attempts = 0;
  var interval = setInterval(function () {
    attempts++;
    if (tryExtractAndFetch()) {
      clearInterval(interval);
    } else if (attempts > 20) {
      clearInterval(interval);
      post({ type: 'debug', step: 'timeout_waiting_for_caption_tracks' });
      post({ type: 'result', status: 'unavailable', language: 'es', segments: [] });
    }
  }, 400);

  true;
})();
`;

/**
 * Hook exposant `fetchTranscript(videoId)` (une promesse) et `node` (à
 * monter quelque part dans l'arbre du composant appelant tant qu'une
 * requête est en cours — une seule requête à la fois, suffisant pour le
 * flux d'ajout de vidéo qui est déjà séquentiel). La `WebView` est
 * démontée dès que le résultat arrive, pas gardée en permanence.
 */
export function useTranscriptFetcher() {
  const [pendingVideoId, setPendingVideoId] = useState<string | null>(null);
  const resolverRef = useRef<((result: TranscriptFetchResult) => void) | null>(null);

  const fetchTranscript = useCallback((videoId: string): Promise<TranscriptFetchResult> => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setPendingVideoId(videoId);
    });
  }, []);

  const settle = useCallback((result: TranscriptFetchResult) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setPendingVideoId(null);
  }, []);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let data: WebViewMessage;
      try {
        data = JSON.parse(event.nativeEvent.data) as WebViewMessage;
      } catch {
        return;
      }
      if (data.type === 'debug') {
        // Logs de diagnostic temporaires demandés explicitement — jamais
        // de cookie/jeton dans les messages postés par le script injecté.
        console.log('[TranscriptFetcher]', data.step, JSON.stringify(data));
        return;
      }
      settle({ status: data.status, language: data.language, segments: data.segments });
    },
    [settle]
  );

  const node =
    pendingVideoId !== null ? (
      <View style={{ width: 1, height: 1, opacity: 0, position: 'absolute', top: -2000 }}>
        <WebView
          source={{ uri: `https://www.youtube.com/watch?v=${pendingVideoId}&hl=es` }}
          injectedJavaScript={INJECTED_SCRIPT}
          javaScriptEnabled
          onMessage={handleMessage}
          onError={() => settle({ status: 'unavailable', language: 'es', segments: [] })}
        />
      </View>
    ) : null;

  return { node, fetchTranscript };
}
