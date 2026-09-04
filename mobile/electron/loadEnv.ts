/**
 * Charge `mobile/.env` (clé DeepL, voir `.env.example`) dans
 * `process.env` du process principal Electron — importé en tout premier
 * dans `main.ts`, avant `src/services/translate.ts`, pour que sa lecture
 * de `process.env.EXPO_PUBLIC_DEEPL_API_KEY` au chargement du module
 * trouve la valeur déjà en place. Metro fait cette injection pour le
 * code client via son propre mécanisme (voir docs Expo sur les
 * variables d'environnement) ; le process principal Electron est un
 * process Node séparé, qui ne passe jamais par Metro, donc doit charger
 * le fichier lui-même. `process.loadEnvFile` est une API Node intégrée
 * (disponible depuis la 20.12/22, présente dans le Node 24.x qu'Electron
 * embarque — voir docs/DECISIONS.md Decision 016) : aucune dépendance
 * `dotenv` ajoutée pour ça. Best-effort — même dégradation silencieuse
 * que le reste du projet si `.env` n'existe pas (voir `.env.example`).
 */
try {
  process.loadEnvFile();
} catch {
  // Pas de .env — la traduction restera indisponible (dégradation déjà
  // gérée par `isTranslationAvailable()`), rien d'autre à faire ici.
}
