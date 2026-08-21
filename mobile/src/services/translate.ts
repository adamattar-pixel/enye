// Traduction à la volée pour l'onglet Livres (tap sur une phrase, voir
// ReaderScreen.tsx) — API DeepL, offre Free. Clé personnelle en variable
// d'environnement (`EXPO_PUBLIC_DEEPL_API_KEY`, voir .env.example) :
// aucun pattern de clé API n'existait déjà dans ce projet (les autres
// fonctionnalités — recherche/captions YouTube — évitent délibérément
// les API officielles), et une clé embarquée dans le bundle d'une app
// Expo distribuée n'est pas vraiment secrète (extractible). Acceptable
// ici uniquement parce que l'app reste à usage personnel, décision prise
// explicitement avec l'utilisateur le 21/08/2026 (voir docs/DECISIONS.md).
const DEEPL_API_KEY = process.env.EXPO_PUBLIC_DEEPL_API_KEY;

/** `api-free.deepl.com`, PAS `api.deepl.com` (réservé aux comptes payants
 * — utiliser le mauvais endpoint avec une clé Free échoue). Dégrade
 * silencieusement vers `null` (pas de clé configurée, ou échec réseau/
 * API) — même principe que le reste du projet (`listening/`, voir
 * docs/CONVENTIONS.md) : ReaderScreen.tsx doit pouvoir afficher un
 * message simple plutôt que de planter. */
export async function translateSentence(text: string): Promise<string | null> {
  if (!DEEPL_API_KEY || !text.trim()) return null;

  try {
    const res = await fetch('https://api-free.deepl.com/v2/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `DeepL-Auth-Key ${DEEPL_API_KEY}`,
      },
      body: new URLSearchParams({ text, source_lang: 'ES', target_lang: 'EN' }).toString(),
    });
    if (!res.ok) {
      console.log('[translate] DeepL a répondu', res.status);
      return null;
    }
    const json = (await res.json()) as { translations?: { text?: string }[] };
    return json.translations?.[0]?.text ?? null;
  } catch (err) {
    console.log('[translate] échec réseau :', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** Indique si une clé DeepL est configurée — utilisé par ReaderScreen.tsx
 * pour ne montrer l'interaction "taper une phrase pour traduire" que si
 * la fonctionnalité peut réellement marcher, plutôt que d'afficher un
 * geste qui échouera systématiquement. */
export function isTranslationAvailable(): boolean {
  return Boolean(DEEPL_API_KEY);
}
