/**
 * Contrat SQLite minimal partagé par toute la couche métier (`database.ts`,
 * `settings.ts`, tous les écrans) — indépendant d'`expo-sqlite`, retiré du
 * projet lors du passage à la cible desktop (voir docs/DECISIONS.md,
 * Decision 016 : iOS/Expo Go abandonné, plus besoin de garder une
 * dépendance native mobile pour la seule forme de ses types).
 *
 * Ces cinq méthodes sont exactement le sous-ensemble de l'API
 * `SQLiteDatabase` d'`expo-sqlite` réellement utilisé dans ce projet
 * (vérifié par recherche exhaustive avant ce changement) — mêmes
 * signatures, pour que tout le code métier existant continue de
 * fonctionner sans modification. Implémenté côté desktop par
 * `mobile/electron/nodeSqliteAdapter.ts` (process principal Electron, via
 * `node:sqlite`) et exposé au renderer par `mobile/src/data/ipcDb.ts` (un
 * simple relais IPC implémentant la même interface).
 */

export type SQLiteBindValue = string | number | null | boolean | Uint8Array;

export interface SQLiteRunResult {
  lastInsertRowId: number;
  changes: number;
}

export interface LexisDb {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: SQLiteBindValue[]): Promise<SQLiteRunResult>;
  getFirstAsync<T>(source: string, ...params: SQLiteBindValue[]): Promise<T | null>;
  getAllAsync<T>(source: string, ...params: SQLiteBindValue[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
