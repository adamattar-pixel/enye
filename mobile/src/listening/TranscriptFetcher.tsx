import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { decodeHtmlEntities, parseTimedTextXml, type CaptionCue } from './captions';
import type { CaptionStatus } from './types';

export interface TranscriptFetchResult {
  status: CaptionStatus;
  language: string;
  segments: CaptionCue[];
}

/** Forcé sur la `WebView` ET dans l'URL (`&app=desktop` ci-dessous) —
 * hypothèse principale du retour de test du 20/08/2026 : sur iPhone, le
 * user-agent par défaut de la `WebView` ressemble à Safari mobile, et
 * YouTube sert alors `m.youtube.com` (DOM différent, pas de bouton
 * "Show transcript" à cet endroit) plutôt que la version desktop pour
 * laquelle `CLICK_SCRIPT`/`DOM_FALLBACK_SCRIPT` sont écrits. Les deux
 * leviers sont posés ensemble plutôt qu'un seul : la détection
 * serveur de YouTube peut se baser sur l'un ou l'autre selon le
 * contexte, pas garanti qu'un seul suffise. */
const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

/**
 * Deuxième méthode de récupération du CONTENU des sous-titres, en
 * secours de `captions.ts#fetchVideoCaptions` (requête HTTP nue) — voir
 * AUDIT.md, section "Débogage dédié de la récupération de captions"
 * (20/08/2026), pour le diagnostic complet : `timedtext` et l'API
 * InnerTube renvoient systématiquement un échec (corps vide / 400
 * "Precondition check failed"), y compris depuis une requête émise avec
 * un contexte client WEB authentique — signe probable d'une exigence de
 * "PoToken" (attestation générée par l'exécution réelle du script
 * BotGuard de Google) que notre requête, même émise depuis le contexte
 * JS d'une page `youtube.com` chargée dans une `WebView`, ne peut pas
 * produire toute seule.
 *
 * **Changement d'approche (20/08/2026, deuxième itération)** : plutôt
 * que d'émettre nous-mêmes une requête vers `timedtext`/`get_transcript`
 * (ce que faisait la première version de ce fichier, jamais vérifiée
 * comme fonctionnelle), on laisse la VRAIE page charger sa transcription
 * comme le ferait un utilisateur réel — clic sur "Show transcript" — et
 * on intercepte la requête que la page elle-même émet à ce moment-là
 * (celle-ci porte un PoToken valide généré par le propre code de
 * YouTube, contrairement à une requête que nous forgerions nous-mêmes).
 * Si l'interception réseau ne capture rien d'exploitable, repli sur une
 * lecture directe du panneau de transcription déjà affiché à l'écran
 * (le texte y est de toute façon rendu, qu'on ait pu intercepter la
 * requête réseau sous-jacente ou non).
 *
 * Séquence exacte : (1) patch de `fetch`/`XMLHttpRequest` installé AVANT
 * le chargement de la page (`injectedJavaScriptBeforeContentLoaded`) ;
 * (2) après le chargement + 2,5s de battement pour l'hydratation de la
 * page, recherche et clic du bouton "Show transcript" (page forcée en
 * anglais via l'en-tête `Accept-Language`, pour que ce libellé soit
 * prévisible) ; (3) si rien d'intercepté 5s après le clic, lecture du
 * DOM du panneau de transcription ouvert ; (4) délai global de sécurité
 * de 9s, au-delà duquel on renvoie `unavailable` plutôt que d'attendre
 * indéfiniment.
 *
 * **Non vérifié de bout en bout dans cette session** — aucun moteur de
 * WebView disponible dans les outils utilisés ici pour exécuter
 * réellement ce scénario. Ne pas présenter comme fonctionnel avant un
 * test réel sur device montrant un nombre de segments > 0 pour une
 * vraie vidéo.
 */

type WebViewMessage =
  | { type: 'debug'; step: string; [key: string]: unknown }
  | { type: 'network_capture'; url: string; body: string }
  | { type: 'dom_capture'; segments: { startTime: number; text: string }[] };

/** Installé via `injectedJavaScriptBeforeContentLoaded` — doit être en
 * place avant que le moindre script de la page ne s'exécute, pour ne
 * manquer aucune requête. Capture toute requête dont l'URL contient
 * `get_transcript` ou `timedtext` (les deux mécanismes possibles selon
 * la version du client YouTube servie), relaie le corps brut tel quel —
 * le parsing (XML `timedtext` ou JSON `get_transcript`) se fait côté
 * TypeScript, pas ici, pour rester simple et débogable. */
const NETWORK_PATCH_SCRIPT = `
(function () {
  function post(msg) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }

  function isTranscriptUrl(url) {
    return typeof url === 'string' && (url.indexOf('get_transcript') !== -1 || url.indexOf('timedtext') !== -1);
  }

  var originalFetch = window.fetch;
  if (originalFetch) {
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url);
      var isTarget = isTranscriptUrl(url);
      var result = originalFetch.apply(this, arguments);
      if (isTarget) {
        result.then(function (res) {
          res.clone().text().then(function (body) {
            post({ type: 'debug', step: 'fetch_intercepted', url: url, status: res.status, length: body.length });
            post({ type: 'network_capture', url: url, body: body });
          }).catch(function () {});
        }).catch(function () {});
      }
      return result;
    };
  }

  var OriginalOpen = XMLHttpRequest.prototype.open;
  var OriginalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__lexisUrl = url;
    this.__lexisIsTarget = isTranscriptUrl(url);
    return OriginalOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (this.__lexisIsTarget) {
      var xhr = this;
      xhr.addEventListener('load', function () {
        try {
          if (xhr.responseType === '' || xhr.responseType === 'text') {
            post({ type: 'debug', step: 'xhr_intercepted', url: xhr.__lexisUrl, status: xhr.status, length: (xhr.responseText || '').length });
            post({ type: 'network_capture', url: xhr.__lexisUrl, body: xhr.responseText || '' });
          }
        } catch (e) {}
      });
    }
    return OriginalSend.apply(this, arguments);
  };

  post({ type: 'debug', step: 'network_patch_installed' });
  true;
})();
`;

/** Injecté après le chargement + délai d'hydratation. Cherche le bouton
 * "Show transcript" (`aria-label` d'abord, repli sur une recherche par
 * texte — la page est chargée en anglais via `Accept-Language` pour que
 * ce libellé soit stable) et clique dessus si trouvé.
 *
 * **20/08/2026, sur retour de test réel sur iPhone** : `button_search`
 * ne trouvait jamais rien (`found: false`) et le repli DOM ne trouvait
 * aucune ligne non plus — le panneau de transcription ne s'ouvrait
 * probablement jamais. Deux hypothèses à départager, dans l'ordre :
 * (1) la WebView charge `m.youtube.com` (version mobile, DOM différent
 * de celui pour lequel ces sélecteurs ont été écrits) à cause du
 * user-agent par défaut d'iOS — combattu ci-dessous par `&app=desktop`
 * dans l'URL ET un `userAgent` desktop explicite sur la `WebView` (les
 * deux, un seul ne suffit pas forcément selon la détection côté
 * serveur) ; (2) un bandeau de consentement cookies (RGPD) bloque
 * l'interaction avant que le bouton n'apparaisse — une tentative de
 * fermeture est faite avant la recherche du bouton, sans certitude que
 * les sélecteurs ci-dessous couvrent la bonne variante régionale.
 *
 * Log de diagnostic `page_context` ajouté en tout premier, AVANT toute
 * tentative de correction — capture `location.href` et le début du DOM
 * pour confirmer concrètement laquelle de ces hypothèses est la bonne,
 * plutôt que de corriger à l'aveugle. **Non revérifié sur device après
 * ce changement** — voir AUDIT.md.
 */
const CLICK_SCRIPT = `
(function () {
  function post(msg) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }

  // Diagnostic en premier, avant toute tentative de correction — voir
  // le commentaire au-dessus de CLICK_SCRIPT côté TypeScript.
  post({
    type: 'debug',
    step: 'page_context',
    href: document.location.href,
    bodySample: (document.body ? document.body.innerHTML : '').slice(0, 500)
  });

  function tryDismissConsentBanner() {
    var textSelectors = ['accept all', 'i agree', 'reject all', 'agree to all'];
    var candidates = document.querySelectorAll('button, tp-yt-paper-button, yt-button-shape, ytd-button-renderer, form button');
    for (var i = 0; i < candidates.length; i++) {
      var text = (candidates[i].innerText || candidates[i].textContent || '').trim().toLowerCase();
      var aria = (candidates[i].getAttribute && candidates[i].getAttribute('aria-label') || '').toLowerCase();
      for (var j = 0; j < textSelectors.length; j++) {
        if (text.indexOf(textSelectors[j]) !== -1 || aria.indexOf(textSelectors[j]) !== -1) {
          return candidates[i];
        }
      }
    }
    return null;
  }

  var consentButton = tryDismissConsentBanner();
  post({ type: 'debug', step: 'consent_check', found: !!consentButton, onConsentDomain: document.location.href.indexOf('consent.youtube.com') !== -1 });
  if (consentButton) {
    consentButton.click();
    post({ type: 'debug', step: 'consent_dismissed' });
  }

  function findShowTranscriptButton() {
    var byAria = document.querySelector('button[aria-label="Show transcript"]');
    if (byAria) return { el: byAria, selector: 'aria-label' };
    var candidates = document.querySelectorAll('button, yt-button-shape, tp-yt-paper-button, a, ytd-button-renderer');
    for (var i = 0; i < candidates.length; i++) {
      var text = (candidates[i].innerText || candidates[i].textContent || '').trim();
      if (/show transcript/i.test(text)) return { el: candidates[i], selector: 'text-match' };
    }
    return null;
  }

  var found = findShowTranscriptButton();
  post({ type: 'debug', step: 'button_search', found: !!found, selector: found ? found.selector : null });
  if (found) {
    found.el.click();
    post({ type: 'debug', step: 'button_clicked' });
  }
  true;
})();
`;

/** Injecté seulement si rien d'exploitable n'a été intercepté 5s après
 * le clic — lit directement le texte déjà rendu dans le panneau de
 * transcription (aucune horodatage de fin fournie par cette UI, juste un
 * timestamp de départ par ligne type "0:05" ou "1:23:45" — l'appariement
 * en segments avec `startTime`/`endTime` se fait côté TypeScript). */
const DOM_FALLBACK_SCRIPT = `
(function () {
  function post(msg) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }

  function parseTimestamp(text) {
    var parts = text.trim().split(':');
    var seconds = 0;
    for (var i = 0; i < parts.length; i++) {
      var n = parseInt(parts[i], 10);
      if (isNaN(n)) return null;
      seconds = seconds * 60 + n;
    }
    return seconds;
  }

  var rows = document.querySelectorAll('ytd-transcript-segment-renderer');
  var segments = [];
  for (var i = 0; i < rows.length; i++) {
    var timeEl = rows[i].querySelector('.segment-timestamp');
    var textEl = rows[i].querySelector('.segment-text') || rows[i].querySelector('yt-formatted-string');
    var timeText = timeEl ? (timeEl.innerText || timeEl.textContent || '').trim() : '';
    var text = textEl ? (textEl.innerText || textEl.textContent || '').trim() : '';
    var startTime = timeText ? parseTimestamp(timeText) : null;
    if (startTime === null || !text) continue;
    segments.push({ startTime: startTime, text: text });
  }
  post({ type: 'debug', step: 'dom_fallback', rowCount: rows.length, segmentCount: segments.length });
  post({ type: 'dom_capture', segments: segments });
  true;
})();
`;

/** Le corps intercepté peut être du XML `timedtext` ou du JSON
 * `get_transcript`, selon quel mécanisme la page a utilisé — détecté par
 * le premier caractère non-blanc plutôt que supposé. */
function parseInterceptedBody(body: string): CaptionCue[] {
  const trimmed = body.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('<')) return parseTimedTextXml(trimmed);
  try {
    return extractJsonTranscriptSegments(JSON.parse(trimmed));
  } catch {
    return [];
  }
}

/** Parcourt récursivement le JSON de `get_transcript` à la recherche de
 * tout objet portant `startMs`/`endMs` — pas un chemin fixe dans
 * l'arborescence (structure interne non officielle, jamais observée
 * directement dans cette session puisque l'endpoint renvoyait
 * systématiquement une erreur depuis ce réseau, voir AUDIT.md) : une
 * recherche en profondeur est la seule approche raisonnable sans avoir
 * pu inspecter un vrai payload. */
function extractJsonTranscriptSegments(root: unknown, depth = 0): CaptionCue[] {
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
function pairDomSegments(raw: { startTime: number; text: string }[]): CaptionCue[] {
  const sorted = [...raw].sort((a, b) => a.startTime - b.startTime);
  return sorted.map((seg, index) => ({
    startTime: seg.startTime,
    endTime: index < sorted.length - 1 ? sorted[index + 1].startTime : seg.startTime + 4,
    transcript: seg.text,
  }));
}

/**
 * Hook exposant `fetchTranscript(videoId)` (une promesse) et `node` (à
 * monter quelque part dans l'arbre du composant appelant tant qu'une
 * requête est en cours). La `WebView` est démontée dès que le résultat
 * arrive, pas gardée en permanence.
 */
export function useTranscriptFetcher() {
  const [pendingVideoId, setPendingVideoId] = useState<string | null>(null);
  const webviewRef = useRef<WebView>(null);
  const resolverRef = useRef<((result: TranscriptFetchResult) => void) | null>(null);
  const settledRef = useRef(false);
  const networkCapturesRef = useRef<{ url: string; body: string }[]>([]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const settle = useCallback(
    (result: TranscriptFetchResult) => {
      if (settledRef.current) return;
      settledRef.current = true;
      clearTimers();
      resolverRef.current?.(result);
      resolverRef.current = null;
      setPendingVideoId(null);
    },
    [clearTimers]
  );

  const finalizeFromDomOrNothing = useCallback(
    (domSegments: { startTime: number; text: string }[] | null) => {
      for (const capture of networkCapturesRef.current) {
        const segments = parseInterceptedBody(capture.body);
        if (segments.length > 0) {
          settle({ status: 'available', language: 'es', segments });
          return;
        }
      }
      if (domSegments && domSegments.length > 0) {
        settle({ status: 'available', language: 'es', segments: pairDomSegments(domSegments) });
        return;
      }
      settle({ status: 'unavailable', language: 'es', segments: [] });
    },
    [settle]
  );

  const fetchTranscript = useCallback((videoId: string): Promise<TranscriptFetchResult> => {
    return new Promise((resolve) => {
      settledRef.current = false;
      networkCapturesRef.current = [];
      resolverRef.current = resolve;
      setPendingVideoId(videoId);
    });
  }, []);

  const handleLoadEnd = useCallback(() => {
    const clickTimer = setTimeout(() => {
      webviewRef.current?.injectJavaScript(CLICK_SCRIPT);

      const domFallbackTimer = setTimeout(() => {
        if (!settledRef.current && networkCapturesRef.current.length === 0) {
          webviewRef.current?.injectJavaScript(DOM_FALLBACK_SCRIPT);
        }
      }, 5000);
      timersRef.current.push(domFallbackTimer);
    }, 2500);
    timersRef.current.push(clickTimer);

    const globalTimeout = setTimeout(() => {
      finalizeFromDomOrNothing(null);
    }, 9000);
    timersRef.current.push(globalTimeout);
  }, [finalizeFromDomOrNothing]);

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

      if (data.type === 'network_capture') {
        networkCapturesRef.current.push({ url: data.url, body: data.body });
        const segments = parseInterceptedBody(data.body);
        if (segments.length > 0) {
          settle({ status: 'available', language: 'es', segments });
        }
        return;
      }

      if (data.type === 'dom_capture') {
        finalizeFromDomOrNothing(data.segments);
      }
    },
    [settle, finalizeFromDomOrNothing]
  );

  useEffect(() => {
    // Nettoie les délais en attente si le composant appelant démonte
    // pendant une requête en cours (ex. l'utilisateur quitte l'écran).
    return () => clearTimers();
  }, [clearTimers]);

  const node =
    pendingVideoId !== null ? (
      <View style={{ width: 1, height: 1, opacity: 0, position: 'absolute', top: -2000 }}>
        <WebView
          ref={webviewRef}
          source={{
            uri: `https://www.youtube.com/watch?v=${pendingVideoId}&app=desktop`,
            headers: { 'Accept-Language': 'en-US,en;q=0.9' },
          }}
          userAgent={DESKTOP_USER_AGENT}
          injectedJavaScriptBeforeContentLoaded={NETWORK_PATCH_SCRIPT}
          javaScriptEnabled
          onLoadEnd={handleLoadEnd}
          onMessage={handleMessage}
          onError={() => settle({ status: 'unavailable', language: 'es', segments: [] })}
        />
      </View>
    ) : null;

  return { node, fetchTranscript };
}
