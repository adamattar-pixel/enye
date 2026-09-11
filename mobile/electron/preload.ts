import { contextBridge, ipcRenderer } from 'electron';
import type { SQLiteBindValue } from '../src/data/dbTypes';
import type { TranscriptFetchResult } from '../src/listening/types';
import type { ParsedBook, BookSearchResult } from '../src/services/bookImport';
import type { YoutubeSearchResult } from '../src/listening/search';
import type { VideoMetadata } from '../src/listening/metadata';

/**
 * Seul pont autorisé entre le renderer (code React/Expo Web, sandboxé,
 * `nodeIntegration: false`) et le process principal — `contextIsolation`
 * étant activé (voir `main.ts`), le renderer ne peut PAS importer
 * `electron`/`node:*` directement, seulement ce qui est explicitement
 * exposé ici. `src/data/ipcDb.ts` consomme `window.lexisDesktop.db.*`
 * pour implémenter `LexisDb` côté renderer.
 */
contextBridge.exposeInMainWorld('lexisDesktop', {
  db: {
    execAsync: (source: string): Promise<void> => ipcRenderer.invoke('db:exec', source),
    runAsync: (source: string, params: SQLiteBindValue[]) => ipcRenderer.invoke('db:run', source, params),
    getFirstAsync: (source: string, params: SQLiteBindValue[]) => ipcRenderer.invoke('db:getFirst', source, params),
    getAllAsync: (source: string, params: SQLiteBindValue[]) => ipcRenderer.invoke('db:getAll', source, params),
    begin: (): Promise<void> => ipcRenderer.invoke('db:begin'),
    commit: (): Promise<void> => ipcRenderer.invoke('db:commit'),
    rollback: (): Promise<void> => ipcRenderer.invoke('db:rollback'),
  },
  captions: {
    fetch: (videoId: string): Promise<TranscriptFetchResult> => ipcRenderer.invoke('captions:fetch', videoId),
  },
  translate: {
    sentence: (text: string): Promise<string | null> => ipcRenderer.invoke('translate:sentence', text),
    isAvailable: (): Promise<boolean> => ipcRenderer.invoke('translate:isAvailable'),
  },
  books: {
    download: (url: string): Promise<ParsedBook> => ipcRenderer.invoke('books:download', url),
    search: (query: string): Promise<BookSearchResult[]> => ipcRenderer.invoke('books:search', query),
  },
  youtube: {
    search: (query: string): Promise<YoutubeSearchResult[]> => ipcRenderer.invoke('youtube:search', query),
    metadata: (videoId: string): Promise<VideoMetadata | null> => ipcRenderer.invoke('youtube:metadata', videoId),
  },
});
