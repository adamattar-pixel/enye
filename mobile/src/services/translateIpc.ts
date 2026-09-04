/**
 * Remplace l'appel direct à `services/translate.ts` (`fetch` vers
 * `api-free.deepl.com`) côté renderer — confirmé bloqué par CORS depuis
 * un contexte navigateur (voir docs/DECISIONS.md Decision 016). La
 * fonction originale continue d'exister et tourne réellement dans le
 * process principal Electron (voir `electron/main.ts`, qui l'importe
 * directement, aucun code dupliqué) ; ce module ne fait que relayer via
 * IPC. `isTranslationAvailable()` devient forcément async ici (la clé
 * n'est lisible que côté process principal) — voir `ReaderScreen.tsx`
 * pour l'adaptation (état résolu une fois au montage plutôt qu'un appel
 * synchrone).
 */
export function translateSentence(text: string): Promise<string | null> {
  return window.lexisDesktop?.translate.sentence(text) ?? Promise.resolve(null);
}

export function checkTranslationAvailable(): Promise<boolean> {
  return window.lexisDesktop?.translate.isAvailable() ?? Promise.resolve(false);
}
