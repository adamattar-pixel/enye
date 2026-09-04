import { DatabaseSync } from 'node:sqlite';
import type { LexisDb, SQLiteBindValue, SQLiteRunResult } from '../src/data/dbTypes';

/**
 * Implémentation desktop de `LexisDb` — utilise `node:sqlite`, intégré à
 * Node depuis la 22.5 (stable en release candidate depuis la 25.7, voir
 * https://nodejs.org/api/sqlite.html) et donc déjà présent dans le Node
 * qu'Electron embarque (24.x sur les versions récentes), sans dépendance
 * npm native à compiler (`better-sqlite3` aurait demandé `electron-rebuild`
 * et une chaîne de compilation C++ sur la machine — évité ici, voir
 * docs/DECISIONS.md Decision 016). Tourne exclusivement dans le process
 * principal Electron ; le renderer y accède via IPC (`ipcDb.ts` côté
 * `src/`, `main.ts` côté `electron/`), jamais directement.
 *
 * `node:sqlite` renvoie `lastInsertRowid` (casse différente d'expo-sqlite,
 * qui utilisait `lastInsertRowId`) — normalisé ici pour que `database.ts`
 * n'ait rien à changer.
 */
export function createNodeSqliteDb(filePath: string): LexisDb {
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA journal_mode = WAL;');

  function bind(params: SQLiteBindValue[]): (string | number | null | bigint | Uint8Array)[] {
    return params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p));
  }

  return {
    async execAsync(source) {
      db.exec(source);
    },

    async runAsync(source, ...params): Promise<SQLiteRunResult> {
      const stmt = db.prepare(source);
      const result = stmt.run(...bind(params));
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },

    async getFirstAsync<T>(source: string, ...params: SQLiteBindValue[]): Promise<T | null> {
      const stmt = db.prepare(source);
      const row = stmt.get(...bind(params));
      return (row as T | undefined) ?? null;
    },

    async getAllAsync<T>(source: string, ...params: SQLiteBindValue[]): Promise<T[]> {
      const stmt = db.prepare(source);
      return stmt.all(...bind(params)) as T[];
    },

    async withTransactionAsync(task) {
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
}
