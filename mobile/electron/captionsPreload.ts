import { ipcRenderer } from 'electron';

/**
 * Preload de la fenêtre CACHÉE dédiée à la récupération des sous-titres
 * YouTube (voir `captionsFetcher.ts`) — PAS le preload de la fenêtre
 * principale (`preload.ts`), et volontairement chargée avec
 * `contextIsolation: false` (voir `captionsFetcher.ts` pour la raison) :
 * ce fichier tourne donc directement dans le contexte JS de la vraie page
 * `youtube.com`, avant que le moindre script de cette page ne s'exécute
 * (garantie native d'Electron pour un preload — équivalent exact de
 * `injectedJavaScriptBeforeContentLoaded` côté `react-native-webview`,
 * utilisé par l'ancien mécanisme mobile, Decision 010).
 *
 * Reproduit à l'identique la technique confirmée fonctionnelle sur iPhone
 * le 21/08/2026 (voir docs/DECISIONS.md, Decision 010 et 016) : patcher
 * `fetch`/`XMLHttpRequest` AVANT chargement pour intercepter la requête
 * `timedtext` authentifiée (PoToken) que la page émet elle-même en
 * cliquant sur "Show transcript" — seul le transport change (`ipcRenderer.
 * send` au lieu de `window.ReactNativeWebView.postMessage`), toute la
 * logique de patch est reprise telle quelle.
 */

function post(msg: unknown): void {
  ipcRenderer.send('captions:message', msg);
}

// Rendu accessible sous `window.__lexisPost` pour que `CLICK_SCRIPT`/
// `DOM_FALLBACK_SCRIPT` (injectés plus tard par `captionsFetcher.ts` via
// `executeJavaScript`, donc dans le monde JS de la page, pas celui — en
// principe séparé par un wrapper de module — de ce fichier preload)
// puissent relayer leurs messages sans avoir besoin de `require('electron')`
// (indisponible dans le monde de la page tant que `nodeIntegration` reste
// à `false`, ce qui est volontairement le cas ici — voir captionsFetcher.ts).
(window as unknown as { __lexisPost: (msg: unknown) => void }).__lexisPost = post;

function isTranscriptUrl(url: unknown): boolean {
  return typeof url === 'string' && (url.indexOf('get_transcript') !== -1 || url.indexOf('timedtext') !== -1);
}

const originalFetch = window.fetch;
if (originalFetch) {
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === 'string' ? input : (input as Request)?.url;
    const isTarget = isTranscriptUrl(url);
    const result = originalFetch.call(window, input, init);
    if (isTarget) {
      result
        .then((res) => {
          res
            .clone()
            .text()
            .then((body) => {
              post({ type: 'debug', step: 'fetch_intercepted', url, status: res.status, length: body.length });
              post({ type: 'network_capture', url, body });
            })
            .catch(() => {});
        })
        .catch(() => {});
    }
    return result;
  };
}

const OriginalOpen = XMLHttpRequest.prototype.open;
const OriginalSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open = function (this: XMLHttpRequest & { __lexisUrl?: string; __lexisIsTarget?: boolean }, method: string, url: string | URL, ...rest: unknown[]) {
  this.__lexisUrl = String(url);
  this.__lexisIsTarget = isTranscriptUrl(String(url));
  // @ts-expect-error signature variadic historique de XMLHttpRequest.open
  return OriginalOpen.apply(this, [method, url, ...rest]);
};
XMLHttpRequest.prototype.send = function (this: XMLHttpRequest & { __lexisUrl?: string; __lexisIsTarget?: boolean }, ...args: unknown[]) {
  if (this.__lexisIsTarget) {
    const xhr = this;
    xhr.addEventListener('load', () => {
      try {
        if (xhr.responseType === '' || xhr.responseType === 'text') {
          post({ type: 'debug', step: 'xhr_intercepted', url: xhr.__lexisUrl, status: xhr.status, length: (xhr.responseText || '').length });
          post({ type: 'network_capture', url: xhr.__lexisUrl, body: xhr.responseText || '' });
        }
      } catch {
        // ignore
      }
    });
  }
  // @ts-expect-error signature variadic historique de XMLHttpRequest.send
  return OriginalSend.apply(this, args);
};

post({ type: 'debug', step: 'network_patch_installed' });
