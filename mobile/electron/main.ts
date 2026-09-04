import './loadEnv';
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { createNodeSqliteDb } from './nodeSqliteAdapter';
import { fetchTranscriptForVideo } from './captionsFetcher';
import { translateSentence, isTranslationAvailable } from '../src/services/translate';
import { downloadAndParseBook, searchBooks } from '../src/services/bookImport';
import {
  DB_NAME,
  migrateDbIfNeeded,
  importMissingWords,
  resyncWordTags,
  importMissingConjugationCards,
  importMissingExpressionCards,
  importMissingReadingCards,
} from '../src/data/database';
import type { LexisDb, SQLiteBindValue } from '../src/data/dbTypes';
import { parseWords } from '../src/data/wordRepository';
import wordsJson from '../src/data/words.json';
import { conjugationVerbs } from '../src/conjugation/data';
import { expressions } from '../src/expressions/data';
import { readingTexts } from '../src/reading/data';

/**
 * Process principal Electron — remplace `App.tsx`'s ancien bootstrap
 * (ouverture DB + import du contenu bundlé) côté mobile. Tourne UNE FOIS
 * ici, avant même la création de la fenêtre, avec un accès Node direct à
 * `node:sqlite` (voir `nodeSqliteAdapter.ts`) — pas d'aller-retour IPC
 * pour ce chargement initial, seulement pour les requêtes faites ensuite
 * pendant l'usage de l'app (voir les handlers `db:*` plus bas).
 *
 * Réutilise directement les fonctions de `src/data/database.ts` (import
 * delta, resync des tags) sans les dupliquer — exactement la contrainte
 * du plan ("réutilise le code métier existant, pas une copie qui va
 * diverger", voir docs/DECISIONS.md Decision 016 / docs/PLAN.md).
 */

let db: LexisDb | null = null;

async function initDatabase(): Promise<LexisDb> {
  const dbPath = path.join(app.getPath('userData'), DB_NAME);
  const database = createNodeSqliteDb(dbPath);
  await migrateDbIfNeeded(database);

  const parsedWords = parseWords(wordsJson);
  await importMissingWords(database, parsedWords);
  await resyncWordTags(database, parsedWords);
  await importMissingConjugationCards(database, conjugationVerbs);
  await importMissingExpressionCards(database, expressions);
  await importMissingReadingCards(database, readingTexts);

  return database;
}

/** Un seul handler générique par méthode `LexisDb`, appelé depuis le
 * renderer via `ipcDb.ts` (voir `preload.ts` pour le pont exposé). Les
 * transactions (`withTransactionAsync`) sont gérées par une paire
 * begin/commit/rollback plutôt qu'un callback traversant l'IPC — une
 * fenêtre Electron n'a qu'une seule connexion DB active à la fois donc
 * aucun risque de transaction concurrente qui s'intercalerait. */
function registerDbHandlers(database: LexisDb): void {
  ipcMain.handle('db:exec', async (_event, source: string) => {
    await database.execAsync(source);
  });

  ipcMain.handle('db:run', async (_event, source: string, params: SQLiteBindValue[]) => {
    return database.runAsync(source, ...params);
  });

  ipcMain.handle('db:getFirst', async (_event, source: string, params: SQLiteBindValue[]) => {
    return database.getFirstAsync(source, ...params);
  });

  ipcMain.handle('db:getAll', async (_event, source: string, params: SQLiteBindValue[]) => {
    return database.getAllAsync(source, ...params);
  });

  ipcMain.handle('db:begin', async () => {
    await database.execAsync('BEGIN');
  });

  ipcMain.handle('db:commit', async () => {
    await database.execAsync('COMMIT');
  });

  ipcMain.handle('db:rollback', async () => {
    await database.execAsync('ROLLBACK');
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  // En dev, `npm run web:dev` sert le bundle Metro sur ce port (voir
  // package.json) ; en production, on charge le build statique exporté
  // par `expo export --platform web` (voir docs/PLAN.md, phase
  // "Packaging"). `LEXIS_DEV_SERVER_URL` permet de pointer vers un autre
  // port si celui-ci est déjà pris.
  const devServerUrl = process.env.LEXIS_DEV_SERVER_URL ?? 'http://localhost:8081';
  if (!app.isPackaged) {
    win.loadURL(devServerUrl);
  } else {
    win.loadFile(path.join(process.resourcesPath, 'web-build', 'index.html'));
  }
}

app.whenReady().then(async () => {
  db = await initDatabase();
  registerDbHandlers(db);
  ipcMain.handle('captions:fetch', async (_event, videoId: string) => fetchTranscriptForVideo(videoId));
  // DeepL (CORS) et Open Library (pas d'en-têtes CORS du tout, vérifié
  // directement) tournent ici pour la même raison que la base de données
  // Electron : le process principal est un contexte Node normal, jamais
  // soumis à la politique CORS d'un navigateur (voir docs/DECISIONS.md
  // Decision 016). Fonctions reprises telles quelles depuis
  // `src/services/`, pas dupliquées.
  ipcMain.handle('translate:sentence', async (_event, text: string) => translateSentence(text));
  ipcMain.handle('translate:isAvailable', async () => isTranslationAvailable());
  ipcMain.handle('books:download', async (_event, url: string) => downloadAndParseBook(url));
  ipcMain.handle('books:search', async (_event, query: string) => searchBooks(query));
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
