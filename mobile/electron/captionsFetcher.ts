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

/** Injecté après le chargement, avec un très court délai d'hydratation.
 * **Sonde le bouton "Mostrar transcripción" en boucle plutôt qu'une seule
 * tentative à délai fixe** — bug réel confirmé le 12/09/2026 : le bouton
 * existe bel et bien (aria-label confirmé exact, `findShowTranscriptButton`
 * le reconnaît), mais met désormais nettement plus longtemps à s'hydrater
 * qu'au moment de Decision 010 (absent à 6s dans un test dédié, présent à
 * 8s) — un délai fixe de 2,5s (l'ancienne valeur) le manquait
 * systématiquement, d'où "aucun segment détecté sur absolument toutes les
 * vidéos". Sonde toutes les 500ms jusqu'à `MAX_ATTEMPTS` avant d'abandonner
 * (`button_search` avec `found: false` seulement à ce stade-là).
 *
 * **Bandeau de consentement RGPD également sondé en boucle, pas en un seul
 * essai** — deuxième bug réel confirmé le 12/09/2026, bien plus grave que
 * le premier : le VPN de l'utilisateur sort par Oslo (EEE), donc YouTube
 * affiche un `ytd-consent-bump-v2-lightbox` avec un fond (`tp-yt-iron-
 * overlay-backdrop`) qui couvre TOUTE la page et intercepte le moindre
 * clic ailleurs — vérifié en capturant `event.target` d'un vrai clic OS
 * (`sendInputEvent`) au-dessus du bouton transcription : il atterrissait
 * sur ce fond, pas sur le bouton. L'ancien code cherchait bien ce bandeau,
 * mais une seule fois à ~1s après `did-finish-load` — hors ce bandeau met
 * lui-même plusieurs secondes à s'hydrater (spinner de chargement observé
 * dans son propre balisage), donc ce essai unique le manquait presque
 * toujours, laissant son fond bloquer silencieusement tous les clics
 * suivants pendant les 12s de sonde du bouton transcription. */
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

  function findConsentButton() {
    var lightboxCandidates = document.querySelectorAll(
      'ytd-consent-bump-v2-lightbox button, tp-yt-iron-overlay-backdrop ~ * button'
    );
    var textSelectors = [
      'reject all', 'accept all', 'i agree', 'agree to all',
      'rechazar todo', 'aceptar todo', 'acepto', 'aceptar todas'
    ];
    for (var i = 0; i < lightboxCandidates.length; i++) {
      var text = (lightboxCandidates[i].innerText || lightboxCandidates[i].textContent || '').trim().toLowerCase();
      var aria = (lightboxCandidates[i].getAttribute && lightboxCandidates[i].getAttribute('aria-label') || '').toLowerCase();
      for (var j = 0; j < textSelectors.length; j++) {
        if (text.indexOf(textSelectors[j]) !== -1 || aria.indexOf(textSelectors[j]) !== -1) {
          return lightboxCandidates[i];
        }
      }
    }
    return null;
  }

  function findShowTranscriptButton() {
    var ariaLabels = ['Show transcript', 'Mostrar transcripción', 'Mostrar transcripcion'];
    for (var a = 0; a < ariaLabels.length; a++) {
      var byAria = document.querySelectorAll('button[aria-label="' + ariaLabels[a] + '"]');
      for (var b = 0; b < byAria.length; b++) {
        if (byAria[b].offsetParent) return { el: byAria[b], selector: 'aria-label' };
      }
      if (byAria.length > 0) return { el: byAria[0], selector: 'aria-label-hidden' };
    }
    var candidates = document.querySelectorAll('button, yt-button-shape, tp-yt-paper-button, a, ytd-button-renderer');
    for (var i = 0; i < candidates.length; i++) {
      var text = (candidates[i].innerText || candidates[i].textContent || '').trim();
      if (/show transcript|mostrar transcripci[oó]n/i.test(text)) return { el: candidates[i], selector: 'text-match' };
    }
    return null;
  }

  function expandDescriptionIfPresent() {
    // Le bouton "Mostrar transcripción" vit dans la description dépliée
    // ("#structured-description", display:none tant qu'on n'a pas cliqué
    // "...plus") — bug réel confirmé le 12/09/2026 : sans ce clic, le
    // bouton existe dans le DOM mais avec un rectangle nul, ce qui n'empêche
    // PAS le .click() synthétique ci-dessous de fonctionner (il ne
    // dépend pas de la mise en page), mais on le déplie quand même pour
    // cibler la même copie visible que celle validée manuellement.
    var expandBtn = document.querySelector('tp-yt-paper-button#expand, #expand, ytd-text-inline-expander #expand');
    if (expandBtn) expandBtn.click();
  }

  var consentAttempts = 0;
  var CONSENT_MAX_ATTEMPTS = 20; // 20 x 500ms = 10s de sonde avant d'abandonner.
  var consentPoll = setInterval(function () {
    consentAttempts++;
    var consentButton = findConsentButton();
    if (consentButton) {
      clearInterval(consentPoll);
      post({ type: 'debug', step: 'consent_dismissed', attempts: consentAttempts });
      consentButton.click();
      setTimeout(startTranscriptSearch, 800);
      return;
    }
    if (consentAttempts >= CONSENT_MAX_ATTEMPTS) {
      clearInterval(consentPoll);
      post({ type: 'debug', step: 'consent_not_found', attempts: consentAttempts });
      startTranscriptSearch();
    }
  }, 500);

  function startTranscriptSearch() {
    expandDescriptionIfPresent();
    setTimeout(function () {
      var attempts = 0;
      var MAX_ATTEMPTS = 24; // 24 x 500ms = 12s de sonde avant d'abandonner.
      var poll = setInterval(function () {
        attempts++;
        var found = findShowTranscriptButton();
        if (found) {
          clearInterval(poll);
          post({ type: 'debug', step: 'button_search', found: true, selector: found.selector, attempts: attempts });
          found.el.click();
          post({ type: 'debug', step: 'button_clicked' });
          return;
        }
        if (attempts >= MAX_ATTEMPTS) {
          clearInterval(poll);
          post({ type: 'debug', step: 'button_search', found: false, selector: null, attempts: attempts });
        }
      }, 500);
    }, 1200);
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

    // La page réelle de youtube.com se lance souvent seule (autoplay) —
    // `show: false` ne coupe QUE l'affichage, pas le son, donc sans ça
    // l'utilisateur entend la vidéo démarrer en arrière-plan pendant la
    // recherche de sous-titres, avant même de savoir si elle a été
    // ajoutée. Signalé explicitement le 12/09/2026.
    win.webContents.setAudioMuted(true);

    const cleanup = (): void => {
      timers.forEach(clearTimeout);
      ipcMain.removeListener('captions:message', onMessage);
      if (!win.isDestroyed()) win.destroy();
    };

    const settle = (result: TranscriptFetchResult): void => {
      if (settled) return;
      console.log('[captionsFetcher] settle:', result.status, result.segments.length, 'segment(s)');
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
      // CLICK_SCRIPT sonde lui-même le bouton pendant 12s (voir sa
      // définition) — injecté vite (1s, juste le temps que le DOM existe
      // au moins un peu), le délai réel jusqu'au clic vient de la boucle
      // interne, pas d'ici. Le repli DOM n'a donc de sens qu'APRÈS cette
      // fenêtre de sonde (1s + 12s + marge), pas avant.
      const clickTimer = setTimeout(() => {
        win.webContents.executeJavaScript(CLICK_SCRIPT).catch(() => {});

        // 26s, pas 13s — bug réel confirmé le 12/09/2026 : CLICK_SCRIPT
        // sonde désormais AUSSI le bandeau de consentement RGPD en boucle
        // (jusqu'à 10s) avant même de commencer à chercher le bouton
        // transcription (encore jusqu'à 1,2s + 12s) — l'ancien délai de
        // 13s coupait donc systématiquement le repli DOM avant la fin de
        // cette séquence, désormais plus longue. En pratique le
        // `network_capture` (interception de `get_panel`, voir
        // `captionsPreload.ts`) règle le résultat bien avant ce délai dès
        // que le clic sur le bouton aboutit — ce timer n'est qu'un filet
        // de sécurité pour le cas où rien de tout cela n'a fonctionné.
        const domFallbackTimer = setTimeout(() => {
          if (!settled && networkCaptures.length === 0) {
            win.webContents.executeJavaScript(DOM_FALLBACK_SCRIPT).catch(() => {});
          }
        }, 26000);
        timers.push(domFallbackTimer);
      }, 1000);
      timers.push(clickTimer);

      // BUG réel confirmé le 12/09/2026 : `did-finish-load` lui-même peut
      // prendre plusieurs secondes à se déclencher (4,4s mesurées dans un
      // test) — un timeout global compté depuis la CRÉATION de la
      // promesse (avant même que la page ait fini de charger) expirait
      // systématiquement AVANT que la séquence clic (1s) + sonde (12s) +
      // repli DOM (13s) n'ait eu le temps de se dérouler, annulant le
      // repli DOM juste avant qu'il ne se déclenche. Ce timeout est donc
      // compté à partir de CET évènement, pas du début de la promesse.
      const perLoadTimeout = setTimeout(() => finalizeFromDomOrNothing(null), 1000 + 26000 + 4000);
      timers.push(perLoadTimeout);
    });

    // Filet de sécurité absolu si `did-finish-load` ne se déclenche jamais
    // du tout (échec réseau total, pas juste un chargement lent) —
    // volontairement large puisque `perLoadTimeout` ci-dessus gère déjà le
    // cas normal avec sa propre marge (45s, pas 35s : la séquence
    // clic+sonde interne à CLICK_SCRIPT est désormais plus longue, voir
    // commentaire sur `domFallbackTimer` ci-dessus).
    const absoluteSafetyTimeout = setTimeout(() => finalizeFromDomOrNothing(null), 45000);
    timers.push(absoluteSafetyTimeout);

    win.webContents.setUserAgent(DESKTOP_USER_AGENT);
    win
      .loadURL(`https://www.youtube.com/watch?v=${videoId}`, {
        extraHeaders: 'Accept-Language: es-419,es;q=0.9,en;q=0.5\n',
      })
      // BUG réel confirmé le 12/09/2026 (jamais un souci réseau/CAPTCHA) :
      // la vraie page youtube.com se réécrit elle-même très tôt (ex.
      // `&themeRefresh=1` observé), ce qui fait rejeter la promesse de
      // `loadURL` avec `ERR_ABORTED` — un événement Chromium normal
      // signalant "une autre navigation a pris le dessus", PAS un échec de
      // chargement. `did-finish-load` se déclenche quand même juste après
      // pour la vraie page (titre confirmé correct dans un test dédié).
      // L'ancien code réglait `settle('unavailable')` sur ce rejet,
      // condamnant à tort CHAQUE vidéo à "0 segment" avant même que la
      // page ait fini de charger — d'où "aucun segment détecté" sur
      // absolument toutes les vidéos ajoutées. Le rejet est maintenant
      // ignoré : `did-finish-load`/le timeout global (9s) restent seuls
      // responsables du résultat final.
      .catch(() => {});
  });
}
