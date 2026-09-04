import { BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { extractLangFromUrl, parseInterceptedBody, pairDomSegments } from '../src/listening/transcriptParsing';
import type { TranscriptFetchResult } from '../src/listening/types';

/**
 * Portage desktop de `TranscriptFetcher.tsx` (ex-mobile, react-native-
 * webview, Decision 010) — voir docs/DECISIONS.md Decision 016 pour la
 * justification : le patch réseau lui-même vit maintenant dans
 * `captionsPreload.ts` (chargé AVANT le contenu, comme
 * `injectedJavaScriptBeforeContentLoaded` le faisait), seule la
 * séquence temporelle (clic différé, repli DOM, timeout global) et
 * l'assemblage du résultat final sont repris ici, quasi identiques à
 * l'original.
 */

const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

type WebViewMessage =
  | { type: 'debug'; step: string; [key: string]: unknown }
  | { type: 'network_capture'; url: string; body: string }
  | { type: 'dom_capture'; segments: { startTime: number; text: string }[] };

/** Injecté après le chargement + délai d'hydratation — identique à
 * `CLICK_SCRIPT` de l'ancien `TranscriptFetcher.tsx` (voir Decision 010
 * pour l'historique des deux itérations qui ont mené à cette version :
 * `userAgent` desktop nécessaire, `&app=desktop` sur l'URL retiré car il
 * sert en réalité une version YouTube legacy pré-2017). */
const CLICK_SCRIPT = `
(function () {
  function post(msg) {
    window.__lexisPost(msg);
  }

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
  post({ type: 'debug', step: 'consent_check', found: !!consentButton });
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

/** Identique au `DOM_FALLBACK_SCRIPT` mobile — repli si rien d'exploitable
 * n'a été intercepté côté réseau. */
const DOM_FALLBACK_SCRIPT = `
(function () {
  function post(msg) {
    window.__lexisPost(msg);
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

export function fetchTranscriptForVideo(videoId: string): Promise<TranscriptFetchResult> {
  return new Promise((resolve) => {
    let settled = false;
    const networkCaptures: { url: string; body: string }[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];

    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'captionsPreload.js'),
        // Volontairement désactivé pour CETTE fenêtre cachée uniquement
        // (jamais pour la fenêtre principale, voir main.ts) : le patch
        // réseau dans `captionsPreload.ts` doit modifier `window.fetch`/
        // `XMLHttpRequest` dans le MÊME contexte que celui où la vraie
        // page youtube.com les appelle ensuite — avec `contextIsolation:
        // true`, le preload tourne dans un monde JS isolé du monde de la
        // page, incapable de patcher ses globals. Cette fenêtre ne charge
        // qu'une seule origine fixe (youtube.com), jamais de contenu
        // choisi par l'utilisateur ni de code applicatif — pas le même
        // risque qu'une fenêtre affichant du contenu arbitraire.
        contextIsolation: false,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    const cleanup = (): void => {
      timers.forEach(clearTimeout);
      ipcMain.removeListener('captions:message', onMessage);
      if (!win.isDestroyed()) win.destroy();
    };

    const settle = (result: TranscriptFetchResult): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const finalizeFromDomOrNothing = (domSegments: { startTime: number; text: string }[] | null): void => {
      const parsed = networkCaptures
        .map((capture) => ({ language: extractLangFromUrl(capture.url), segments: parseInterceptedBody(capture.body) }))
        .filter((c) => c.segments.length > 0);
      const spanish = parsed.find((c) => c.language.toLowerCase().startsWith('es'));
      if (spanish) {
        settle({ status: 'available', language: spanish.language, segments: spanish.segments });
        return;
      }
      if (domSegments && domSegments.length > 0) {
        settle({ status: 'available', language: 'es', segments: pairDomSegments(domSegments) });
        return;
      }
      settle({ status: 'unavailable', language: 'es', segments: [] });
    };

    function onMessage(_event: Electron.IpcMainEvent, data: WebViewMessage): void {
      if (!data || typeof data !== 'object') return;

      if (data.type === 'debug') {
        console.log('[captionsFetcher]', data.step, JSON.stringify(data));
        return;
      }

      if (data.type === 'network_capture') {
        networkCaptures.push({ url: data.url, body: data.body });
        const segments = parseInterceptedBody(data.body);
        const language = extractLangFromUrl(data.url);
        console.log('[captionsFetcher] capture réseau — langue:', language, 'segments:', segments.length);
        if (segments.length > 0 && language.toLowerCase().startsWith('es')) {
          settle({ status: 'available', language, segments });
        }
        return;
      }

      if (data.type === 'dom_capture') {
        finalizeFromDomOrNothing(data.segments);
      }
    }

    ipcMain.on('captions:message', onMessage);

    win.webContents.on('did-finish-load', () => {
      const clickTimer = setTimeout(() => {
        win.webContents.executeJavaScript(CLICK_SCRIPT).catch(() => {});

        const domFallbackTimer = setTimeout(() => {
          if (!settled && networkCaptures.length === 0) {
            win.webContents.executeJavaScript(DOM_FALLBACK_SCRIPT).catch(() => {});
          }
        }, 5000);
        timers.push(domFallbackTimer);
      }, 2500);
      timers.push(clickTimer);
    });

    const globalTimeout = setTimeout(() => finalizeFromDomOrNothing(null), 9000);
    timers.push(globalTimeout);

    win.webContents.setUserAgent(DESKTOP_USER_AGENT);
    win
      .loadURL(`https://www.youtube.com/watch?v=${videoId}`, {
        extraHeaders: 'Accept-Language: es-419,es;q=0.9,en;q=0.5\n',
      })
      .catch(() => settle({ status: 'unavailable', language: 'es', segments: [] }));
  });
}
