import type { LexisDb, SQLiteBindValue, SQLiteRunResult } from './dbTypes';
import type { TranscriptFetchResult } from '../listening/types';
import type { ParsedBook, BookSearchResult } from '../services/bookImport';
import type { YoutubeSearchResult } from '../listening/search';
import type { VideoMetadata } from '../listening/metadata';

/** Exposé par `mobile/electron/preload.ts` via `contextBridge` — voir ce
 * fichier pour la liste exacte des méthodes exposées. Déclaré ici plutôt
 * que comme `any` pour que ce module reste type-safe. */
declare global {
  interface Window {
    lexisDesktop?: {
      db: {
        execAsync(source: string): Promise<void>;
        runAsync(source: string, params: SQLiteBindValue[]): Promise<SQLiteRunResult>;
        getFirstAsync<T>(source: string, params: SQLiteBindValue[]): Promise<T | null>;
        getAllAsync<T>(source: string, params: SQLiteBindValue[]): Promise<T[]>;
        begin(): Promise<void>;
        commit(): Promise<void>;
        rollback(): Promise<void>;
      };
      captions: {
        fetch(videoId: string): Promise<TranscriptFetchResult>;
      };
      translate: {
        sentence(text: string): Promise<string | null>;
        isAvailable(): Promise<boolean>;
      };
      books: {
        download(url: string): Promise<ParsedBook>;
        search(query: string): Promise<BookSearchResult[]>;
      };
      youtube: {
        search(query: string): Promise<YoutubeSearchResult[]>;
        metadata(videoId: string): Promise<VideoMetadata | null>;
      };
    };
  }
}

/**
 * Implémentation `LexisDb` côté renderer — relaie chaque appel au process
 * principal Electron via `window.lexisDesktop.db` (pont `contextBridge`,
 * voir `electron/preload.ts`), qui tient la vraie connexion `node:sqlite`
 * (voir `electron/nodeSqliteAdapter.ts`). C'est ce que `App.tsx` passe
 * partout où le code existant attendait un `LexisDb` — aucune autre
 * fonction de `src/data/database.ts` ni des écrans n'a besoin de savoir
 * que la base vit dans un autre process.
 *
 * `withTransactionAsync` traverse begin/commit/rollback plutôt qu'un
 * callback envoyé tel quel par IPC (les fonctions ne sont pas
 * sérialisables) — le `task()` fourni continue de s'exécuter côté
 * renderer, chacun de ses appels `runAsync`/etc. repart en IPC normalement
 * pendant que la transaction est ouverte côté process principal.
 */
export function createIpcDb(): LexisDb {
  const bridge = window.lexisDesktop;
  if (!bridge) {
    throw new Error(
      "window.lexisDesktop est introuvable — cette build doit tourner dans la fenêtre Electron de Lexis (voir electron/preload.ts), pas dans un navigateur ouvert directement."
    );
  }
  const { db } = bridge;

  return {
    execAsync: (source) => db.execAsync(source),
    runAsync: (source, ...params) => db.runAsync(source, params),
    getFirstAsync: (source, ...params) => db.getFirstAsync(source, params),
    getAllAsync: (source, ...params) => db.getAllAsync(source, params),
    async withTransactionAsync(task) {
      await db.begin();
      try {
        await task();
        await db.commit();
      } catch (err) {
        await db.rollback();
        throw err;
      }
    },
  };
}
