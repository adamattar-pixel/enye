/** Format détecté du fichier source — PDF volontairement absent (voir
 * docs/DECISIONS.md, 21/08/2026) : aucune extraction de texte PDF fiable
 * n'a été identifiée sans dépendance native, ce qui casserait la
 * contrainte "tout tourne dans Expo Go" (CLAUDE.md). */
export type BookFormat = 'epub' | 'txt' | 'html';

/** Un livre ajouté par l'utilisateur — lecture libre, indépendante du
 * moteur SM-2 (pas de carte de révision, voir docs/PLAN.md). Le contenu
 * complet (chapitres) est stocké dans `book_chapters` une fois pour
 * toutes à l'ajout, pas re-téléchargé à l'ouverture. */
export interface Book {
  id: string;
  title: string;
  author: string | null;
  sourceUrl: string;
  format: BookFormat;
  addedAt: Date;
  /** Position de lecture courante, mise à jour automatiquement au fil de
   * la lecture — distincte des signets manuels (`BookBookmark`), voir
   * `book_bookmarks`. `null` tant que le livre n'a jamais été ouvert. */
  lastChapterId: string | null;
  /** Index de paragraphe dans le chapitre `lastChapterId` (pas un
   * offset de caractères — voir ReaderScreen.tsx pour le choix de
   * granularité par paragraphe plutôt que par caractère). */
  lastPosition: number;
}

export interface BookChapter {
  id: string;
  bookId: string;
  orderIndex: number;
  title: string;
  content: string;
}

/** Signet manuel — plusieurs possibles par livre, distincts de
 * `lastChapterId`/`lastPosition` (position automatique, un seul champ)
 * sur `Book`, demandé explicitement le 21/08/2026. */
export interface BookBookmark {
  id: string;
  bookId: string;
  chapterId: string;
  position: number;
  note: string | null;
  createdAt: Date;
}
