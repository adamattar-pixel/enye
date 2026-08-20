import type { SQLiteDatabase } from 'expo-sqlite';

export interface AppSettings {
  newCardsPerDay: number;
  reviewCapPerDay: number;
  windowStartHour: number;
  windowStartMinute: number;
  windowEndHour: number;
  windowEndMinute: number;
  /** Tags exclus de l'introduction de nouveaux mots (voir PLAN.md /
   * "activer ou désactiver des thèmes"). N'affecte pas les mots déjà en
   * apprentissage/révision — seulement quels mots deviennent "nouveaux"
   * à l'avenir, pour ne jamais faire disparaître une carte en cours. */
  disabledTags: string[];
  /** Bascule manuelle clair/sombre (bouton en haut à droite), en plus du
   * réglage système. `'system'` suit `useColorScheme()` comme avant ;
   * `'light'`/`'dark'` force la palette correspondante quel que soit le
   * réglage iOS. */
  themeOverride: 'system' | 'light' | 'dark';
  /** Rythme de l'onglet Conjugaison — séparé de `newCardsPerDay`/
   * `reviewCapPerDay` (vocabulaire) plutôt que partagé, pour que les
   * deux entraînements aient chacun leur propre budget quotidien sans
   * se disputer les mêmes créneaux. Valeurs par défaut identiques au
   * vocabulaire (8 + 22) faute de retour utilisateur spécifique — à
   * ajuster séparément si besoin, voir AUDIT.md. */
  conjugationNewCardsPerDay: number;
  conjugationReviewCapPerDay: number;
  /** Rythme de l'onglet Compréhension orale — même logique de budget
   * séparé que la conjugaison, mais plus bas par défaut (5 + 15) : le
   * volume de segments disponibles dépend entièrement des vidéos que
   * l'utilisateur ajoute lui-même (pas de contenu bundlé), donc un
   * budget aussi élevé que le vocabulaire n'aurait pas de sens tant que
   * la bibliothèque est petite. Voir PLAN.md. */
  listeningNewSegmentsPerDay: number;
  listeningReviewCapPerDay: number;
}

/** Réglages validés (voir PLAN.md, "Décisions validées avec l'utilisateur"). */
export const defaultSettings: AppSettings = {
  newCardsPerDay: 8,
  reviewCapPerDay: 22,
  windowStartHour: 8,
  windowStartMinute: 0,
  windowEndHour: 22,
  windowEndMinute: 0,
  disabledTags: [],
  themeOverride: 'system',
  conjugationNewCardsPerDay: 8,
  conjugationReviewCapPerDay: 22,
  listeningNewSegmentsPerDay: 5,
  listeningReviewCapPerDay: 15,
};

const SETTINGS_KEY = 'app';

export async function getSettings(db: SQLiteDatabase): Promise<AppSettings> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?;', SETTINGS_KEY);
  if (!row) return defaultSettings;

  try {
    const stored = JSON.parse(row.value) as Partial<AppSettings>;
    // Fusionné avec les valeurs par défaut plutôt que remplacé, pour
    // qu'un futur nouveau champ de réglage ait toujours une valeur même
    // si l'utilisateur a une base créée avant son ajout.
    return { ...defaultSettings, ...stored };
  } catch {
    return defaultSettings;
  }
}

export async function saveSettings(db: SQLiteDatabase, settings: AppSettings): Promise<void> {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;',
    SETTINGS_KEY,
    JSON.stringify(settings)
  );
}
