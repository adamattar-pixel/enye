import type { ParsedBook, BookSearchResult } from './bookImport';

export type { ParsedBook, BookSearchResult };

/**
 * Remplace l'appel direct à `services/bookImport.ts` côté renderer — pas
 * pour l'EPUB/TXT/HTML depuis une URL déjà CORS-permissive (ex.
 * `archive.org`, confirmé), mais `openlibrary.org/search.json` (utilisé
 * par `searchBooks`) ne renvoie aucun en-tête CORS (vérifié directement),
 * donc bloqué depuis un contexte navigateur. Les deux passent par IPC par
 * cohérence plutôt que de distinguer au cas par cas quelle URL a besoin
 * du détour — `services/bookImport.ts` original continue de tourner tel
 * quel dans le process principal (voir `electron/main.ts`), pas dupliqué.
 */
export function downloadAndParseBook(url: string): Promise<ParsedBook> {
  if (!window.lexisDesktop) return Promise.reject(new Error('window.lexisDesktop indisponible.'));
  return window.lexisDesktop.books.download(url);
}

export function searchBooks(query: string): Promise<BookSearchResult[]> {
  return window.lexisDesktop?.books.search(query) ?? Promise.resolve([]);
}
