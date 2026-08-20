import type { SQLiteDatabase } from 'expo-sqlite';
import { createCard, type SM2CardLifecycle, type SM2CardState, type SM2Grade } from '../sm2/types';
import type { Word } from './types';

const VALID_GRADES: readonly SM2Grade[] = ['again', 'hard', 'good', 'easy'];

const VALID_LIFECYCLES: readonly SM2CardLifecycle[] = ['new', 'learning', 'review', 'relearning'];

/** SQLite stocke `lifecycle` en TEXT — cette fonction est la frontière
 * où on revalide que la valeur lue correspond bien à `SM2CardLifecycle`
 * plutôt que de faire un simple cast en aveugle. Ne peut arriver en
 * pratique que si la base a été corrompue ou modifiée hors de l'app. */
function parseLifecycle(value: string): SM2CardLifecycle {
  if ((VALID_LIFECYCLES as readonly string[]).includes(value)) {
    return value as SM2CardLifecycle;
  }
  throw new Error(`Valeur de lifecycle invalide en base : "${value}"`);
}

export const DB_NAME = 'lexis.db';

export async function migrateDbIfNeeded(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS words (
      id TEXT PRIMARY KEY NOT NULL,
      spanish TEXT NOT NULL,
      french TEXT NOT NULL,
      part_of_speech TEXT NOT NULL,
      gender TEXT,
      example_es TEXT NOT NULL,
      example_fr TEXT NOT NULL,
      level TEXT NOT NULL,
      tags TEXT NOT NULL,
      frequency_rank INTEGER NOT NULL,
      is_user_added INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS cards (
      word_id TEXT PRIMARY KEY NOT NULL REFERENCES words(id),
      ease_factor REAL NOT NULL,
      interval_days REAL NOT NULL,
      repetitions INTEGER NOT NULL,
      lapses INTEGER NOT NULL,
      learning_step_index INTEGER NOT NULL,
      lifecycle TEXT NOT NULL,
      due_date TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cards_due_date ON cards(due_date);

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word_id TEXT NOT NULL,
      grade TEXT NOT NULL,
      reviewed_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reviews_reviewed_at ON reviews(reviewed_at);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
}

/** Importe `words` dans SQLite si la table est vide (premier lancement),
 * avec une carte SM-2 neuve pour chacun. N'écrase jamais des cartes déjà
 * en cours de révision — ne fait rien si la table `words` n'est pas
 * vide, même si `words.json` a changé depuis (pas de logique de
 * migration/diff pour l'instant, à ajouter si on enrichit le contenu
 * après coup).
 *
 * Pas testé unitairement (pas de SQLite en mémoire disponible sous
 * Jest/jest-expo pour l'instant) — à vérifier sur device réel une fois
 * branché à un écran. Voir AUDIT.md. */
export async function seedIfEmpty(db: SQLiteDatabase, words: Word[], now: Date = new Date()): Promise<void> {
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM words;');
  if ((row?.count ?? 0) > 0) return;

  await db.withTransactionAsync(async () => {
    for (const word of words) {
      await db.runAsync(
        `INSERT INTO words (id, spanish, french, part_of_speech, gender, example_es, example_fr, level, tags, frequency_rank, is_user_added)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        word.id,
        word.spanish,
        word.french,
        word.partOfSpeech,
        word.gender,
        word.exampleEs,
        word.exampleFr,
        word.level,
        JSON.stringify(word.tags),
        word.frequencyRank,
        word.isUserAdded ? 1 : 0
      );

      const card = createCard({ dueDate: now });
      await db.runAsync(
        `INSERT INTO cards (word_id, ease_factor, interval_days, repetitions, lapses, learning_step_index, lifecycle, due_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        word.id,
        card.easeFactor,
        card.intervalDays,
        card.repetitions,
        card.lapses,
        card.learningStepIndex,
        card.lifecycle,
        card.dueDate.toISOString()
      );
    }
  });
}

export interface DueCardRow {
  word: Word;
  card: SM2CardState;
}

/** Écrit l'état SM-2 recalculé après une note — `SM2Engine.review()` est
 * une fonction pure, c'est ici qu'on persiste son résultat. */
export async function updateCard(db: SQLiteDatabase, wordId: string, card: SM2CardState): Promise<void> {
  await db.runAsync(
    `UPDATE cards
     SET ease_factor = ?, interval_days = ?, repetitions = ?, lapses = ?, learning_step_index = ?, lifecycle = ?, due_date = ?
     WHERE word_id = ?;`,
    card.easeFactor,
    card.intervalDays,
    card.repetitions,
    card.lapses,
    card.learningStepIndex,
    card.lifecycle,
    card.dueDate.toISOString(),
    wordId
  );
}

/** Cartes dues à `now` ou avant, triées par échéance la plus ancienne
 * d'abord (même ordre que ReviewScheduler) — `limit` doit refléter les
 * plafonds quotidiens (8 nouvelles + 22 révisions = 30, voir PLAN.md),
 * pas appliqué ici : c'est à l'appelant de séparer nouvelles/révisions
 * avant d'appeler cette fonction si besoin. */
export async function getDueCards(db: SQLiteDatabase, now: Date, limit: number): Promise<DueCardRow[]> {
  type Row = {
    id: string;
    spanish: string;
    french: string;
    part_of_speech: string;
    gender: string | null;
    example_es: string;
    example_fr: string;
    level: string;
    tags: string;
    frequency_rank: number;
    is_user_added: number;
    ease_factor: number;
    interval_days: number;
    repetitions: number;
    lapses: number;
    learning_step_index: number;
    lifecycle: string;
    due_date: string;
  };

  const rows = await db.getAllAsync<Row>(
    `SELECT w.*, c.ease_factor, c.interval_days, c.repetitions, c.lapses, c.learning_step_index, c.lifecycle, c.due_date
     FROM cards c
     JOIN words w ON w.id = c.word_id
     WHERE c.due_date <= ?
     ORDER BY c.due_date ASC
     LIMIT ?;`,
    now.toISOString(),
    limit
  );

  return rows.map((r) => ({
    word: {
      id: r.id,
      spanish: r.spanish,
      french: r.french,
      partOfSpeech: r.part_of_speech,
      gender: r.gender,
      exampleEs: r.example_es,
      exampleFr: r.example_fr,
      level: r.level,
      tags: JSON.parse(r.tags) as string[],
      frequencyRank: r.frequency_rank,
      isUserAdded: r.is_user_added === 1,
    },
    card: {
      easeFactor: r.ease_factor,
      intervalDays: r.interval_days,
      repetitions: r.repetitions,
      lapses: r.lapses,
      learningStepIndex: r.learning_step_index,
      lifecycle: parseLifecycle(r.lifecycle),
      dueDate: new Date(r.due_date),
    },
  }));
}

/** Un mot précis avec son état de carte, indépendamment de si sa
 * `due_date` est passée ou non — utilisé quand on note une carte depuis
 * une notification, où on veut son état courant, pas seulement "les
 * cartes dues maintenant" (elle pourrait avoir été programmée pour dans
 * quelques minutes et notée en avance, ou en retard sur son horaire
 * prévu si l'app a été fermée). */
export async function getWordWithCard(db: SQLiteDatabase, wordId: string): Promise<DueCardRow | null> {
  type Row = {
    id: string;
    spanish: string;
    french: string;
    part_of_speech: string;
    gender: string | null;
    example_es: string;
    example_fr: string;
    level: string;
    tags: string;
    frequency_rank: number;
    is_user_added: number;
    ease_factor: number;
    interval_days: number;
    repetitions: number;
    lapses: number;
    learning_step_index: number;
    lifecycle: string;
    due_date: string;
  };

  const r = await db.getFirstAsync<Row>(
    `SELECT w.*, c.ease_factor, c.interval_days, c.repetitions, c.lapses, c.learning_step_index, c.lifecycle, c.due_date
     FROM cards c
     JOIN words w ON w.id = c.word_id
     WHERE w.id = ?;`,
    wordId
  );
  if (!r) return null;

  return {
    word: {
      id: r.id,
      spanish: r.spanish,
      french: r.french,
      partOfSpeech: r.part_of_speech,
      gender: r.gender,
      exampleEs: r.example_es,
      exampleFr: r.example_fr,
      level: r.level,
      tags: JSON.parse(r.tags) as string[],
      frequencyRank: r.frequency_rank,
      isUserAdded: r.is_user_added === 1,
    },
    card: {
      easeFactor: r.ease_factor,
      intervalDays: r.interval_days,
      repetitions: r.repetitions,
      lapses: r.lapses,
      learningStepIndex: r.learning_step_index,
      lifecycle: parseLifecycle(r.lifecycle),
      dueDate: new Date(r.due_date),
    },
  };
}

/** Journalise une note donnée — sert de base aux statistiques (série de
 * jours, taux de réussite) ; distinct de `cards`, qui ne garde que
 * l'état courant, pas l'historique. */
export async function logReview(db: SQLiteDatabase, wordId: string, grade: SM2Grade, at: Date = new Date()): Promise<void> {
  await db.runAsync(
    'INSERT INTO reviews (word_id, grade, reviewed_at) VALUES (?, ?, ?);',
    wordId,
    grade,
    at.toISOString()
  );
}

export interface ReviewLogRow {
  grade: SM2Grade;
  reviewedAt: Date;
}

function parseGrade(value: string): SM2Grade {
  if ((VALID_GRADES as readonly string[]).includes(value)) {
    return value as SM2Grade;
  }
  throw new Error(`Valeur de note invalide en base : "${value}"`);
}

/** Tout l'historique de révisions — utilisé par `statsEngine` pour
 * calculer série de jours et taux de réussite. Pas de pagination pour
 * l'instant ; à revoir si l'historique devient volumineux. */
export async function getAllReviews(db: SQLiteDatabase): Promise<ReviewLogRow[]> {
  const rows = await db.getAllAsync<{ grade: string; reviewed_at: string }>(
    'SELECT grade, reviewed_at FROM reviews ORDER BY reviewed_at ASC;'
  );
  return rows.map((r) => ({ grade: parseGrade(r.grade), reviewedAt: new Date(r.reviewed_at) }));
}

/** Dates d'échéance de toutes les cartes non nouvelles (pour la
 * prévision de charge) — les cartes `new` n'ont pas encore de vraie date
 * d'échéance significative tant qu'elles n'ont pas été vues une fois. */
export async function getAllDueDates(db: SQLiteDatabase): Promise<Date[]> {
  const rows = await db.getAllAsync<{ due_date: string }>(
    "SELECT due_date FROM cards WHERE lifecycle != 'new';"
  );
  return rows.map((r) => new Date(r.due_date));
}

export interface WordCounts {
  total: number;
  learned: number;
}

/** "Appris" = a été vu au moins une fois (au-delà de l'état `new`) —
 * définition simple, pas de seuil sur l'intervalle ou l'ease factor. */
export async function getWordCounts(db: SQLiteDatabase): Promise<WordCounts> {
  const total = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM words;');
  const learned = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM cards WHERE lifecycle != 'new';"
  );
  return { total: total?.count ?? 0, learned: learned?.count ?? 0 };
}

/** Nombre de révisions déjà faites depuis le début d'un jour donné —
 * sert à afficher la progression du jour sur l'écran Aujourd'hui. */
export async function getReviewCountSince(db: SQLiteDatabase, since: Date): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM reviews WHERE reviewed_at >= ?;',
    since.toISOString()
  );
  return row?.count ?? 0;
}

export interface WordFilter {
  level?: string;
  tag?: string;
}

/** Tous les mots, triés par fréquence, avec filtre optionnel par niveau
 * et/ou tag — utilisé par l'écran Decks/mots. */
export async function getAllWords(db: SQLiteDatabase, filter: WordFilter = {}): Promise<Word[]> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filter.level) {
    conditions.push('level = ?');
    params.push(filter.level);
  }
  if (filter.tag) {
    // `tags` est stocké en JSON ; suffisant pour un petit volume de mots,
    // à revoir (table de jointure dédiée) si ça devient un goulot.
    conditions.push('tags LIKE ?');
    params.push(`%"${filter.tag}"%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  type Row = {
    id: string;
    spanish: string;
    french: string;
    part_of_speech: string;
    gender: string | null;
    example_es: string;
    example_fr: string;
    level: string;
    tags: string;
    frequency_rank: number;
    is_user_added: number;
  };
  const rows = await db.getAllAsync<Row>(`SELECT * FROM words ${where} ORDER BY frequency_rank ASC;`, ...params);

  return rows.map((r) => ({
    id: r.id,
    spanish: r.spanish,
    french: r.french,
    partOfSpeech: r.part_of_speech,
    gender: r.gender,
    exampleEs: r.example_es,
    exampleFr: r.example_fr,
    level: r.level,
    tags: JSON.parse(r.tags) as string[],
    frequencyRank: r.frequency_rank,
    isUserAdded: r.is_user_added === 1,
  }));
}

/** Liste de tous les tags distincts présents dans `words` — sert à
 * construire les filtres/thèmes de l'écran Decks/mots. */
export async function getAllTags(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ tags: string }>('SELECT DISTINCT tags FROM words;');
  const tagSet = new Set<string>();
  for (const row of rows) {
    const tags = JSON.parse(row.tags) as string[];
    tags.forEach((t) => tagSet.add(t));
  }
  return [...tagSet].sort();
}

/** Ajoute un mot créé depuis l'app, avec une carte SM-2 neuve — même
 * mécanique que les mots du bundle (voir `seedIfEmpty`), en marquant
 * `isUserAdded`. */
export async function addUserWord(db: SQLiteDatabase, word: Omit<Word, 'isUserAdded'>, now: Date = new Date()): Promise<void> {
  await db.runAsync(
    `INSERT INTO words (id, spanish, french, part_of_speech, gender, example_es, example_fr, level, tags, frequency_rank, is_user_added)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1);`,
    word.id,
    word.spanish,
    word.french,
    word.partOfSpeech,
    word.gender,
    word.exampleEs,
    word.exampleFr,
    word.level,
    JSON.stringify(word.tags),
    word.frequencyRank
  );

  const card = createCard({ dueDate: now });
  await db.runAsync(
    `INSERT INTO cards (word_id, ease_factor, interval_days, repetitions, lapses, learning_step_index, lifecycle, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    word.id,
    card.easeFactor,
    card.intervalDays,
    card.repetitions,
    card.lapses,
    card.learningStepIndex,
    card.lifecycle,
    card.dueDate.toISOString()
  );
}

export async function deleteWord(db: SQLiteDatabase, wordId: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM cards WHERE word_id = ?;', wordId);
    await db.runAsync('DELETE FROM reviews WHERE word_id = ?;', wordId);
    await db.runAsync('DELETE FROM words WHERE id = ?;', wordId);
  });
}
