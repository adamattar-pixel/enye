import type { SQLiteDatabase } from 'expo-sqlite';
import { createCard, type SM2CardLifecycle, type SM2CardState } from '../sm2/types';
import type { Word } from './types';

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
