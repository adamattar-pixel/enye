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
