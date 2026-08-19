import type { SQLiteDatabase } from 'expo-sqlite';

export const DB_NAME = 'lexis-prototype.db';

export async function migrateDbIfNeeded(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT UNIQUE NOT NULL,
      action TEXT NOT NULL,
      logged_at TEXT NOT NULL
    );
  `);
}

export type LogRow = {
  id: number;
  request_id: string;
  action: string;
  logged_at: string;
};

/**
 * `INSERT OR IGNORE` sur `request_id` : rejouer la même réponse de
 * notification (ex. réouvrir l'app plusieurs fois après un seul tap) ne
 * crée jamais de doublon — c'est ce qui rend le check au démarrage
 * (`getLastNotificationResponseAsync`) sûr à appeler à chaque lancement.
 */
/** Renvoie `true` si la ligne était nouvelle (donc si l'appelant doit
 * réagir), `false` si `requestId` avait déjà été journalisé — évite de
 * redéclencher un effet de bord (ex. programmer la notification suivante)
 * à chaque réouverture normale de l'app après un seul tap. */
export async function logAction(db: SQLiteDatabase, requestId: string, action: string): Promise<boolean> {
  const result = await db.runAsync(
    'INSERT OR IGNORE INTO logs (request_id, action, logged_at) VALUES (?, ?, ?);',
    requestId,
    action,
    new Date().toISOString()
  );
  return result.changes > 0;
}

export async function getAllLogs(db: SQLiteDatabase): Promise<LogRow[]> {
  return db.getAllAsync<LogRow>('SELECT * FROM logs ORDER BY id DESC;');
}

export async function clearLogs(db: SQLiteDatabase): Promise<void> {
  await db.runAsync('DELETE FROM logs;');
}
