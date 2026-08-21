import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { CaptionCue } from './captions';
import { extractLangFromUrl, parseInterceptedBody, pairDomSegments } from './transcriptParsing';
import type { CaptionStatus } from './types';

export interface TranscriptFetchResult {
  status: CaptionStatus;
  language: string;
  segments: CaptionCue[];
}

/** Forcé sur la `WebView` — deuxième test réel sur device (20/08/2026)
 * après le premier correctif (`&app=desktop` sur l'URL + ce `userAgent`) :
 * le log `page_context` a confirmé que le `userAgent` desktop fonctionne
 * (page bien servie en desktop), MAIS `&app=desktop` s'est révélé être
 * un ancien paramètre YouTube traité aujourd'hui comme "sers la version
 * legacy pré-2017" (DOM `watch7-content`/`watch-main-col`, polymer 1) —
 * pas la version desktop moderne pour laquelle `CLICK_SCRIPT`/
 * `DOM_FALLBACK_SCRIPT` sont écrits (`ytd-*`). `&app=desktop` retiré de
 * l'URL en conséquence, seul le `userAgent` reste. */
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
 * page, recherche et clic du bouton "Show transcript"/"Mostrar
 * transcripción" (page chargée en espagnol via l'en-tête
 * `Accept-Language`, corrigé le 21/08/2026 — voir AUDIT.md, forcer
 * l'anglais avait pour effet de bord de faire s'ouvrir le panneau sur une
 * traduction automatique anglaise plutôt que la vraie piste espagnole ;
 * `findShowTranscriptButton` reconnaît les libellés des deux langues) ;
 * (3) si rien d'intercepté 5s après le clic, lecture du DOM du panneau
 * de transcription ouvert ; (4) délai global de sécurité de 9s, au-delà
 * duquel on renvoie `unavailable` plutôt que d'attendre indéfiniment.
 *
 * **Test réel sur device (21/08/2026) : le mécanisme d'interception
 * fonctionne.** `button_search` a trouvé et cliqué le bouton, `xhr_intercepted`
 * a capturé un vrai corps de 858 225 caractères pour une requête
 * `timedtext?...&pot=...&potc=1` (le "PoToken" généré par le propre code
 * de la page, confirmant l'hypothèse ci-dessus) — mais le résultat final
 * était quand même "0 segments" : le corps était au format `fmt=json3`
 * (`events[].tStartMs`/`segs[].utf8`), une forme que le parseur JSON ne
 * reconnaissait pas encore (il ne savait lire que la forme `get_transcript`
 * spéculative). Corrigé — voir `parseJson3Captions` plus bas. **Ce
 * correctif de parsing lui-même n'a pas encore été revérifié sur
 * device** — ne pas présenter comme fonctionnel avant un nouveau test
 * montrant un nombre de segments > 0.
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
 * **20/08/2026, deux tests réels sur iPhone.** Premier test :
 * `button_search` ne trouvait jamais rien et le repli DOM ne trouvait
 * aucune ligne — hypothèse retenue : la WebView charge `m.youtube.com`
 * (mobile) plutôt que desktop, combattue avec `userAgent` desktop +
 * `&app=desktop` sur l'URL. **Deuxième test, avec le log `page_context`
 * (href + échantillon du DOM) : le `userAgent` desktop fonctionne bien,
 * mais `&app=desktop` sert en réalité la version LEGACY pré-2017 de
 * YouTube** (`id="watch7-content"`, `class="watch-main-col"`, Polymer 1
 * — pas de composants `ytd-*`) — un vieux paramètre désormais traité
 * comme "dégrade la page", pas "sers le desktop moderne". `&app=desktop`
 * retiré ; seul le `userAgent` desktop reste. Hypothèse secondaire
 * toujours en place au cas où : un bandeau de consentement cookies
 * (RGPD) pourrait aussi bloquer l'interaction — tentative de fermeture
 * faite avant la recherche du bouton, sans certitude de couvrir toutes
 * les variantes régionales.
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
    var textSelectors = [
      'accept all', 'i agree', 'reject all', 'agree to all',
      'aceptar todo', 'acepto', 'rechazar todo', 'aceptar todas'
    ];
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
    var ariaLabels = ['Show transcript', 'Mostrar transcripción', 'Mostrar transcripcion'];
    for (var a = 0; a < ariaLabels.length; a++) {
      var byAria = document.querySelector('button[aria-label="' + ariaLabels[a] + '"]');
      if (byAria) return { el: byAria, selector: 'aria-label' };
    }
    var candidates = document.querySelectorAll('button, yt-button-shape, tp-yt-paper-button, a, ytd-button-renderer');
    for (var i = 0; i < candidates.length; i++) {
      var text = (candidates[i].innerText || candidates[i].textContent || '').trim();
      if (/show transcript|mostrar transcripci[oó]n/i.test(text)) return { el: candidates[i], selector: 'text-match' };
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

// Parsing du corps intercepté (`parseInterceptedBody`, `pairDomSegments`)
// et de ses variantes de format (`fmt=json3`, `get_transcript`) déplacé
// dans `transcriptParsing.ts` (module pur, sans import React Native) —
// voir ce fichier pour le détail complet, y compris la découverte du
// 21/08/2026 sur le format `fmt=json3` réellement observé.

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
      // Préfère explicitement une capture espagnole parmi celles reçues —
      // YouTube peut intercepter plusieurs requêtes timedtext (ex. une
      // traduction automatique proposée avant la vraie piste espagnole),
      // et prendre la toute première sans distinction avait causé des
      // imports en anglais pour du contenu pourtant espagnol (21/08/2026).
      const parsed = networkCapturesRef.current
        .map((capture) => ({ language: extractLangFromUrl(capture.url), segments: parseInterceptedBody(capture.body) }))
        .filter((c) => c.segments.length > 0);
      const spanish = parsed.find((c) => c.language.toLowerCase().startsWith('es'));
      const chosen = spanish ?? parsed[0];
      if (chosen) {
        if (!spanish && parsed.length > 0) {
          console.log('[TranscriptFetcher] aucune capture espagnole, repli sur langue:', chosen.language);
        } else {
          console.log('[TranscriptFetcher] langue capturée:', chosen.language);
        }
        settle({ status: 'available', language: chosen.language, segments: chosen.segments });
        return;
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
        const language = extractLangFromUrl(data.url);
        console.log('[TranscriptFetcher] capture réseau — langue:', language, 'segments:', segments.length, '—', data.url.slice(0, 200));
        // Ne règle immédiatement que sur une capture espagnole (chemin
        // rapide, le cas normal). Une capture dans une autre langue est
        // gardée en mémoire (déjà poussée ci-dessus) mais ne conclut pas
        // tout de suite — `finalizeFromDomOrNothing` (déclenché plus tard
        // par les minuteurs) choisira parmi toutes les captures reçues,
        // en préférant l'espagnol s'il en arrive une avant l'échéance.
        if (segments.length > 0 && language.toLowerCase().startsWith('es')) {
          settle({ status: 'available', language, segments });
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
            uri: `https://www.youtube.com/watch?v=${pendingVideoId}`,
            headers: { 'Accept-Language': 'es-419,es;q=0.9,en;q=0.5' },
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
