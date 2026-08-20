import type { SQLiteDatabase } from 'expo-sqlite';
import { createCard, type SM2CardLifecycle, type SM2CardState, type SM2Grade } from '../sm2/types';
import type { Word } from './types';
import { CONJUGATION_TENSES, personCountForTense, type ConjugationTense, type ConjugationVerb } from '../conjugation/types';

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

// Renommé lors du pivot espagnol→anglais (20/08/2026) : le schéma a
// changé (french/example_fr → english/example_en). `CREATE TABLE IF NOT
// EXISTS` ne migre pas une table déjà créée avec l'ancien schéma, donc
// un nouveau nom de fichier force une base fraîche plutôt qu'un crash
// au premier import après mise à jour. Pas de données utilisateur
// réelles à préserver à ce stade (aucun test n'a encore réussi de bout
// en bout — voir AUDIT.md).
export const DB_NAME = 'lexis-en.db';

export async function migrateDbIfNeeded(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS words (
      id TEXT PRIMARY KEY NOT NULL,
      spanish TEXT NOT NULL,
      english TEXT NOT NULL,
      part_of_speech TEXT NOT NULL,
      gender TEXT,
      example_es TEXT NOT NULL,
      example_en TEXT NOT NULL,
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

    -- Onglet Conjugaison (20/08/2026, planifié puis implémenté le même
    -- jour — voir PLAN.md/AUDIT.md). Contrairement à words, le contenu
    -- des verbes (infinitif, glose, formes conjuguées) n'est PAS
    -- dupliqué ici : conjugations.json est importé tel quel côté app et
    -- consulté par id, cette table ne garde que la progression SM-2 de
    -- chaque triplet (verbe, temps/mode, personne). Pas de
    -- fonctionnalité "ajouter son propre verbe" en v1, contrairement au
    -- vocabulaire — d'où l'absence d'une table verbs complète.
    CREATE TABLE IF NOT EXISTS conjugation_cards (
      id TEXT PRIMARY KEY NOT NULL,
      verb_id TEXT NOT NULL,
      tense TEXT NOT NULL,
      person INTEGER NOT NULL,
      ease_factor REAL NOT NULL,
      interval_days REAL NOT NULL,
      repetitions INTEGER NOT NULL,
      lapses INTEGER NOT NULL,
      learning_step_index INTEGER NOT NULL,
      lifecycle TEXT NOT NULL,
      due_date TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_conjugation_cards_due_date ON conjugation_cards(due_date);

    CREATE TABLE IF NOT EXISTS conjugation_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id TEXT NOT NULL,
      grade TEXT NOT NULL,
      reviewed_at TEXT NOT NULL
    );
  `);
}

async function insertWordWithCard(db: SQLiteDatabase, word: Word, now: Date): Promise<void> {
  await db.runAsync(
    `INSERT INTO words (id, spanish, english, part_of_speech, gender, example_es, example_en, level, tags, frequency_rank, is_user_added)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    word.id,
    word.spanish,
    word.english,
    word.partOfSpeech,
    word.gender,
    word.exampleEs,
    word.exampleEn,
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

/** Importe dans SQLite tout mot du bundle (`words.json`) pas encore
 * présent en base, avec une carte SM-2 neuve pour chacun — au premier
 * lancement, ça importe tout ; sur une base déjà peuplée, ça complète
 * seulement ce qui manque (utilisé pour faire grandir le vocabulaire
 * d'une mise à jour à l'autre sans jamais toucher aux cartes déjà en
 * cours de révision). Remplace l'ancien `seedIfEmpty`, qui ne faisait
 * rien du tout si la table `words` n'était pas totalement vide — ça
 * empêchait silencieusement tout enrichissement ultérieur du bundle
 * (ex. le passage de 36 à 6000 mots, voir AUDIT.md, ne serait jamais
 * arrivé jusqu'aux installations déjà seedées sans ce changement).
 *
 * Pas testé unitairement (pas de SQLite en mémoire disponible sous
 * Jest/jest-expo pour l'instant) — à vérifier sur device réel une fois
 * branché à un écran. Voir AUDIT.md. */
export async function importMissingWords(db: SQLiteDatabase, words: Word[], now: Date = new Date()): Promise<number> {
  const existingRows = await db.getAllAsync<{ id: string }>('SELECT id FROM words;');
  const existingIds = new Set(existingRows.map((r) => r.id));
  const missing = words.filter((w) => !existingIds.has(w.id));
  if (missing.length === 0) return 0;

  await db.withTransactionAsync(async () => {
    for (const word of missing) {
      await insertWordWithCard(db, word, now);
    }
  });

  return missing.length;
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

type WordCardRow = {
  id: string;
  spanish: string;
  english: string;
  part_of_speech: string;
  gender: string | null;
  example_es: string;
  example_en: string;
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

function mapWordCardRow(r: WordCardRow): DueCardRow {
  return {
    word: {
      id: r.id,
      spanish: r.spanish,
      english: r.english,
      partOfSpeech: r.part_of_speech,
      gender: r.gender,
      exampleEs: r.example_es,
      exampleEn: r.example_en,
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

const WORD_CARD_SELECT = `SELECT w.*, c.ease_factor, c.interval_days, c.repetitions, c.lapses, c.learning_step_index, c.lifecycle, c.due_date
     FROM cards c
     JOIN words w ON w.id = c.word_id`;

/** Cartes dues à `now` ou avant, triées par échéance la plus ancienne
 * d'abord (même ordre que ReviewScheduler) — `limit` est un plafond
 * global, sans distinction nouvelles/révisions. Utilisé par l'écran
 * Aujourd'hui pour le simple compteur "X cartes dues" ; la session de
 * révision elle-même utilise `getDueCardsSplit`, qui applique le
 * plafond 8 nouvelles + 22 révisions séparément (voir PLAN.md). */
export async function getDueCards(db: SQLiteDatabase, now: Date, limit: number): Promise<DueCardRow[]> {
  const rows = await db.getAllAsync<WordCardRow>(
    `${WORD_CARD_SELECT}
     WHERE c.due_date <= ?
     ORDER BY c.due_date ASC
     LIMIT ?;`,
    now.toISOString(),
    limit
  );
  return rows.map(mapWordCardRow);
}

/** Cartes dues pour une session, avec les plafonds nouvelles/révisions
 * appliqués séparément (`settings.newCardsPerDay` / `settings.reviewCapPerDay`,
 * 8 + 22 par défaut — voir PLAN.md, "Le calcul des plafonds") plutôt
 * qu'un plafond combiné qui laissait les nouvelles cartes noyer les
 * révisions ou l'inverse selon l'ordre d'échéance. Les cartes en
 * révision passent d'abord (elles sont réellement en retard), les
 * nouvelles cartes sont ajoutées ensuite par ordre de fréquence.
 *
 * `disabledTags` (réglage "thèmes actifs") n'exclut que les NOUVELLES
 * cartes — un mot déjà en cours de révision reste dû même si son tag a
 * été désactivé depuis, pour ne jamais faire disparaître une carte déjà
 * commencée (voir `settings.ts`). Le filtre par tag se fait en JS après
 * une requête large plutôt qu'en SQL (`tags` est stocké en JSON, pas en
 * table de jointure) — acceptable au volume de mots actuel (des
 * milliers, pas des millions), à revoir si ça devient un goulot. */
export async function getDueCardsSplit(
  db: SQLiteDatabase,
  now: Date,
  settings: { newCardsPerDay: number; reviewCapPerDay: number; disabledTags: string[] }
): Promise<DueCardRow[]> {
  const reviewRows = await db.getAllAsync<WordCardRow>(
    `${WORD_CARD_SELECT}
     WHERE c.due_date <= ? AND c.lifecycle != 'new'
     ORDER BY c.due_date ASC
     LIMIT ?;`,
    now.toISOString(),
    settings.reviewCapPerDay
  );

  const newRows = await fetchNewCardRows(db, now, settings.disabledTags, settings.newCardsPerDay);

  return [...reviewRows, ...newRows].map(mapWordCardRow);
}

async function fetchNewCardRows(
  db: SQLiteDatabase,
  now: Date,
  disabledTags: string[],
  limit: number
): Promise<WordCardRow[]> {
  const candidateRows = await db.getAllAsync<WordCardRow>(
    `${WORD_CARD_SELECT}
     WHERE c.due_date <= ? AND c.lifecycle = 'new'
     ORDER BY w.frequency_rank ASC
     LIMIT ?;`,
    now.toISOString(),
    // Marge pour compenser les mots filtrés ensuite par `disabledTags`.
    limit * 5 + 50
  );

  const disabled = new Set(disabledTags);
  return candidateRows
    .filter((r) => !(JSON.parse(r.tags) as string[]).some((tag) => disabled.has(tag)))
    .slice(0, limit);
}

/** Un lot supplémentaire de nouvelles cartes, au-delà du plafond
 * quotidien — pour le bouton "Encore des cartes" affiché quand la
 * session est terminée (voir `ReviewScreenContainer.tsx`). Le plafond
 * `newCardsPerDay` n'est pas un verrou en base (aucun compteur "déjà
 * servies aujourd'hui" n'est persisté) : c'est juste une limite par
 * appel à `getDueCardsSplit`, donc redemander un lot ici revient
 * simplement à relancer la même requête sans attendre le lendemain — ce
 * qui est exactement le comportement demandé ("si je finis celles
 * d'aujourd'hui, donne m'en d'autres"). */
export async function getMoreNewCards(
  db: SQLiteDatabase,
  now: Date,
  disabledTags: string[],
  limit: number
): Promise<DueCardRow[]> {
  const rows = await fetchNewCardRows(db, now, disabledTags, limit);
  return rows.map(mapWordCardRow);
}

/** Un mot précis avec son état de carte, indépendamment de si sa
 * `due_date` est passée ou non — utilisé quand on note une carte depuis
 * une notification, où on veut son état courant, pas seulement "les
 * cartes dues maintenant" (elle pourrait avoir été programmée pour dans
 * quelques minutes et notée en avance, ou en retard sur son horaire
 * prévu si l'app a été fermée). */
export async function getWordWithCard(db: SQLiteDatabase, wordId: string): Promise<DueCardRow | null> {
  const r = await db.getFirstAsync<WordCardRow>(
    `${WORD_CARD_SELECT}
     WHERE w.id = ?;`,
    wordId
  );
  return r ? mapWordCardRow(r) : null;
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
    english: string;
    part_of_speech: string;
    gender: string | null;
    example_es: string;
    example_en: string;
    level: string;
    tags: string;
    frequency_rank: number;
    is_user_added: number;
  };
  const rows = await db.getAllAsync<Row>(`SELECT * FROM words ${where} ORDER BY frequency_rank ASC;`, ...params);

  return rows.map((r) => ({
    id: r.id,
    spanish: r.spanish,
    english: r.english,
    partOfSpeech: r.part_of_speech,
    gender: r.gender,
    exampleEs: r.example_es,
    exampleEn: r.example_en,
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
    `INSERT INTO words (id, spanish, english, part_of_speech, gender, example_es, example_en, level, tags, frequency_rank, is_user_added)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1);`,
    word.id,
    word.spanish,
    word.english,
    word.partOfSpeech,
    word.gender,
    word.exampleEs,
    word.exampleEn,
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

export interface ReviewHistoryRow {
  id: number;
  wordId: string;
  spanish: string;
  english: string;
  grade: SM2Grade;
  reviewedAt: Date;
}

/** Historique de révisions avec le mot et sa traduction, le plus récent
 * d'abord — sert à l'écran « Historique » où l'utilisateur peut corriger
 * une note mal cliquée. Distinct de `getAllReviews`, qui ne renvoie que
 * grade/date (suffisant pour les stats agrégées, pas assez pour afficher
 * une liste consultable). */
export async function getReviewHistory(db: SQLiteDatabase, limit = 200): Promise<ReviewHistoryRow[]> {
  type Row = { id: number; word_id: string; spanish: string; english: string; grade: string; reviewed_at: string };
  const rows = await db.getAllAsync<Row>(
    `SELECT r.id, r.word_id, w.spanish, w.english, r.grade, r.reviewed_at
     FROM reviews r
     JOIN words w ON w.id = r.word_id
     ORDER BY r.reviewed_at DESC
     LIMIT ?;`,
    limit
  );
  return rows.map((r) => ({
    id: r.id,
    wordId: r.word_id,
    spanish: r.spanish,
    english: r.english,
    grade: parseGrade(r.grade),
    reviewedAt: new Date(r.reviewed_at),
  }));
}

/** Corrige la note d'une entrée d'historique déjà journalisée (cas d'un
 * mauvais clic). Ne modifie QUE le journal `reviews`, utilisé pour les
 * statistiques (série de jours, taux de réussite) : ne recalcule pas
 * rétroactivement l'intervalle SM-2 de la carte, qui a déjà été avancée
 * en fonction de la note d'origine. Corriger ici change donc l'historique
 * affiché et les stats de réussite, mais pas la prochaine date de
 * révision de la carte — limite assumée, à faire savoir dans l'UI. */
export async function updateReviewGrade(db: SQLiteDatabase, reviewId: number, grade: SM2Grade): Promise<void> {
  await db.runAsync('UPDATE reviews SET grade = ? WHERE id = ?;', grade, reviewId);
}

export async function deleteWord(db: SQLiteDatabase, wordId: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM cards WHERE word_id = ?;', wordId);
    await db.runAsync('DELETE FROM reviews WHERE word_id = ?;', wordId);
    await db.runAsync('DELETE FROM words WHERE id = ?;', wordId);
  });
}

/** Efface tout l'historique de révisions et remet une carte SM-2 neuve
 * pour chaque mot déjà présent en base (`words` n'est pas touché — mots
 * du bundle et mots ajoutés à la main restent tous là) — bouton
 * "Réinitialiser ma progression" dans Réglages, ajouté pour pouvoir
 * retester le flux complet sans attendre que les échéances SM-2
 * reviennent naturellement. Irréversible : l'appelant doit confirmer
 * avant d'appeler cette fonction. */
export async function resetProgress(db: SQLiteDatabase, now: Date = new Date()): Promise<void> {
  const card = createCard({ dueDate: now });
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM reviews;');
    await db.runAsync('DELETE FROM cards;');
    await db.runAsync(
      `INSERT INTO cards (word_id, ease_factor, interval_days, repetitions, lapses, learning_step_index, lifecycle, due_date)
       SELECT id, ?, ?, ?, ?, ?, ?, ? FROM words;`,
      card.easeFactor,
      card.intervalDays,
      card.repetitions,
      card.lapses,
      card.learningStepIndex,
      card.lifecycle,
      card.dueDate.toISOString()
    );

    // Réinitialise aussi la conjugaison dans la même transaction —
    // "Réinitialiser ma progression" est un seul bouton pour toute la
    // progression de l'utilisateur, pas un par onglet. Repart des
    // triplets déjà en base (`conjugation_cards`) plutôt que de tout
    // reconstruire depuis `conjugations.json` ici : la liste des
    // triplets ne change pas, seul leur état SM-2 doit repartir à zéro.
    await db.runAsync('DELETE FROM conjugation_reviews;');
    await db.runAsync(
      `UPDATE conjugation_cards
       SET ease_factor = ?, interval_days = ?, repetitions = ?, lapses = ?, learning_step_index = ?, lifecycle = ?, due_date = ?;`,
      card.easeFactor,
      card.intervalDays,
      card.repetitions,
      card.lapses,
      card.learningStepIndex,
      card.lifecycle,
      card.dueDate.toISOString()
    );
  });
}

// MARK: - Conjugaison

type ConjugationCardRow = {
  id: string;
  verb_id: string;
  tense: string;
  person: number;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  lapses: number;
  learning_step_index: number;
  lifecycle: string;
  due_date: string;
};

export interface DueConjugationCardRow {
  cardId: string;
  verbId: string;
  tense: ConjugationTense;
  person: number;
  card: SM2CardState;
}

const VALID_TENSES = new Set<string>(CONJUGATION_TENSES);

function parseTense(value: string): ConjugationTense {
  if (VALID_TENSES.has(value)) return value as ConjugationTense;
  throw new Error(`Valeur de temps/mode de conjugaison invalide en base : "${value}"`);
}

function mapConjugationCardRow(r: ConjugationCardRow): DueConjugationCardRow {
  return {
    cardId: r.id,
    verbId: r.verb_id,
    tense: parseTense(r.tense),
    person: r.person,
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

function conjugationCardId(verbId: string, tense: ConjugationTense, person: number): string {
  return `${verbId}:${tense}:${person}`;
}

/** Importe dans SQLite tout triplet (verbe, temps/mode, personne) de
 * `conjugations.json` pas encore présent en base, avec une carte SM-2
 * neuve pour chacun — même principe que `importMissingWords` : tout au
 * premier lancement, seulement le delta ensuite. 200 verbes × 52 formes
 * (6 personnes × 7 temps/mode + 5 personnes × 2 impératifs) = 10 400
 * cartes possibles au premier import — voir AUDIT.md pour le temps de
 * premier lancement, pas mesuré sur device. */
export async function importMissingConjugationCards(
  db: SQLiteDatabase,
  verbs: ConjugationVerb[],
  now: Date = new Date()
): Promise<number> {
  const existingRows = await db.getAllAsync<{ id: string }>('SELECT id FROM conjugation_cards;');
  const existingIds = new Set(existingRows.map((r) => r.id));

  const missing: { id: string; verbId: string; tense: ConjugationTense; person: number }[] = [];
  for (const verb of verbs) {
    for (const tense of CONJUGATION_TENSES) {
      const personCount = personCountForTense(tense);
      for (let person = 0; person < personCount; person++) {
        const id = conjugationCardId(verb.id, tense, person);
        if (!existingIds.has(id)) missing.push({ id, verbId: verb.id, tense, person });
      }
    }
  }
  if (missing.length === 0) return 0;

  await db.withTransactionAsync(async () => {
    for (const item of missing) {
      const card = createCard({ dueDate: now });
      await db.runAsync(
        `INSERT INTO conjugation_cards (id, verb_id, tense, person, ease_factor, interval_days, repetitions, lapses, learning_step_index, lifecycle, due_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        item.id,
        item.verbId,
        item.tense,
        item.person,
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

  return missing.length;
}

/** Cartes de conjugaison dues, avec le même principe de plafond séparé
 * nouvelles/révisions que `getDueCardsSplit` (vocabulaire) — voir
 * PLAN.md. Pas de filtre par thème ici (la conjugaison n'a pas de
 * réglage "thèmes actifs", contrairement au vocabulaire). Nouvelles
 * cartes triées par `rowid` (ordre d'insertion) plutôt que par
 * fréquence du verbe : le contenu des verbes n'est pas dupliqué en
 * base (voir plus haut), donc pas de colonne à trier dessus — mais
 * l'import se fait déjà verbe par verbe dans l'ordre de fréquence de
 * `conjugations.json`, donc l'ordre d'insertion l'approxime
 * correctement sans jointure supplémentaire. */
export async function getDueConjugationCardsSplit(
  db: SQLiteDatabase,
  now: Date,
  settings: { conjugationNewCardsPerDay: number; conjugationReviewCapPerDay: number }
): Promise<DueConjugationCardRow[]> {
  const reviewRows = await db.getAllAsync<ConjugationCardRow>(
    `SELECT * FROM conjugation_cards WHERE due_date <= ? AND lifecycle != 'new' ORDER BY due_date ASC LIMIT ?;`,
    now.toISOString(),
    settings.conjugationReviewCapPerDay
  );

  const newRows = await db.getAllAsync<ConjugationCardRow>(
    `SELECT * FROM conjugation_cards WHERE due_date <= ? AND lifecycle = 'new' ORDER BY rowid ASC LIMIT ?;`,
    now.toISOString(),
    settings.conjugationNewCardsPerDay
  );

  return [...reviewRows, ...newRows].map(mapConjugationCardRow);
}

export async function updateConjugationCard(db: SQLiteDatabase, cardId: string, card: SM2CardState): Promise<void> {
  await db.runAsync(
    `UPDATE conjugation_cards
     SET ease_factor = ?, interval_days = ?, repetitions = ?, lapses = ?, learning_step_index = ?, lifecycle = ?, due_date = ?
     WHERE id = ?;`,
    card.easeFactor,
    card.intervalDays,
    card.repetitions,
    card.lapses,
    card.learningStepIndex,
    card.lifecycle,
    card.dueDate.toISOString(),
    cardId
  );
}

export async function logConjugationReview(
  db: SQLiteDatabase,
  cardId: string,
  grade: SM2Grade,
  at: Date = new Date()
): Promise<void> {
  await db.runAsync(
    'INSERT INTO conjugation_reviews (card_id, grade, reviewed_at) VALUES (?, ?, ?);',
    cardId,
    grade,
    at.toISOString()
  );
}
