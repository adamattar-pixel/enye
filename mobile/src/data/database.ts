import type { LexisDb, SQLiteBindValue } from './dbTypes';
import { createCard, type SM2CardLifecycle, type SM2CardState, type SM2Grade } from '../sm2/types';
import type { Word } from './types';
import { CONJUGATION_TENSES, personCountForTense, type ConjugationTense, type ConjugationVerb } from '../conjugation/types';
import { shuffle } from '../utils/shuffle';
import type { CaptionStatus, ListeningSegment, ListeningVideo } from '../listening/types';
import type { Expression } from '../expressions/types';
import type { ReadingText } from '../reading/types';
import type { Book, BookChapter, BookBookmark, BookFormat } from '../books/types';

/** Groupe de placeholders `(?, ?, ...)` répété `rowCount` fois, pour un
 * INSERT multi-lignes en un seul aller-retour au pont natif plutôt
 * qu'un `runAsync` par ligne — utilisé pour les imports en gros volume
 * (mots, cartes de conjugaison), où des milliers d'inserts un par un
 * ajoutaient plusieurs secondes au premier lancement. Taille de lot
 * choisie pour rester largement sous l'ancienne limite historique de
 * SQLite (999 paramètres liés) même si l'app tourne un jour sur une
 * version de SQLite plus ancienne que celle habituellement bundlée. */
const INSERT_BATCH_SIZE = 80;

function valuesPlaceholders(columnCount: number, rowCount: number): string {
  const row = `(${Array(columnCount).fill('?').join(', ')})`;
  return Array(rowCount).fill(row).join(', ');
}

async function insertInBatches<T>(
  db: LexisDb,
  rows: T[],
  columnCount: number,
  sqlPrefix: string,
  toParams: (row: T) => SQLiteBindValue[]
): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + INSERT_BATCH_SIZE);
    const params = batch.flatMap(toParams);
    await db.runAsync(`${sqlPrefix} VALUES ${valuesPlaceholders(columnCount, batch.length)};`, ...params);
  }
}

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
// en bout — voir docs/AUDIT.md).
export const DB_NAME = 'lexis-en.db';

export async function migrateDbIfNeeded(db: LexisDb): Promise<void> {
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
    -- jour — voir docs/PLAN.md/docs/AUDIT.md). Contrairement à words, le contenu
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

    -- Onglet Compréhension orale (20/08/2026, planifié puis implémenté le
    -- même jour — voir docs/PLAN.md/docs/AUDIT.md). Contrairement à conjugation_cards,
    -- ici le contenu (titre, transcription des segments) N'EST PAS partagé
    -- via un fichier bundlé : chaque utilisateur ajoute ses propres vidéos
    -- à l'exécution (URL YouTube), donc video/segment vivent en base, pas
    -- dans un JSON versionné avec l'app.
    CREATE TABLE IF NOT EXISTS listening_videos (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      channel TEXT NOT NULL,
      thumbnail_url TEXT NOT NULL,
      duration_seconds INTEGER,
      language TEXT NOT NULL,
      caption_status TEXT NOT NULL,
      added_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS listening_segments (
      id TEXT PRIMARY KEY NOT NULL,
      video_id TEXT NOT NULL REFERENCES listening_videos(id),
      segment_index INTEGER NOT NULL,
      start_time REAL NOT NULL,
      end_time REAL NOT NULL,
      transcript TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_listening_segments_video_id ON listening_segments(video_id);

    -- id = même id que le segment correspondant (relation 1:1) — pas de
    -- clé composite ni d'auto-increment séparé, pour rester dans le même
    -- style que conjugation_cards (id = clé métier directement). video_id
    -- est dupliqué ici (déjà présent via le segment) uniquement pour éviter
    -- une jointure sur les requêtes de cooldown ([getRecentListeningVideoIds]),
    -- appelées à chaque exercice.
    CREATE TABLE IF NOT EXISTS listening_cards (
      id TEXT PRIMARY KEY NOT NULL REFERENCES listening_segments(id),
      video_id TEXT NOT NULL,
      ease_factor REAL NOT NULL,
      interval_days REAL NOT NULL,
      repetitions INTEGER NOT NULL,
      lapses INTEGER NOT NULL,
      learning_step_index INTEGER NOT NULL,
      lifecycle TEXT NOT NULL,
      due_date TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_listening_cards_due_date ON listening_cards(due_date);

    CREATE TABLE IF NOT EXISTS listening_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id TEXT NOT NULL,
      grade TEXT NOT NULL,
      reviewed_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_listening_reviews_reviewed_at ON listening_reviews(reviewed_at);

    -- Onglet Expressions et locutions (21/08/2026) — même principe que
    -- conjugation_cards : le contenu (expression, traduction, exemple)
    -- vit dans expressions.json, cette table ne garde que la progression
    -- SM-2. id = id de l'expression directement (relation 1:1, pas de
    -- clé composite comme pour la conjugaison puisqu'il n'y a ni temps
    -- ni personne ici).
    CREATE TABLE IF NOT EXISTS expression_cards (
      id TEXT PRIMARY KEY NOT NULL,
      ease_factor REAL NOT NULL,
      interval_days REAL NOT NULL,
      repetitions INTEGER NOT NULL,
      lapses INTEGER NOT NULL,
      learning_step_index INTEGER NOT NULL,
      lifecycle TEXT NOT NULL,
      due_date TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_expression_cards_due_date ON expression_cards(due_date);

    CREATE TABLE IF NOT EXISTS expression_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id TEXT NOT NULL,
      grade TEXT NOT NULL,
      reviewed_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_expression_reviews_reviewed_at ON expression_reviews(reviewed_at);

    -- Onglet Compréhension écrite (21/08/2026) — même principe que
    -- listening_cards pour la cardinalité (une carte = un texte ENTIER
    -- avec toutes ses questions, pas une carte par question), mais le
    -- contenu vit dans reading.json comme la conjugaison/les expressions
    -- (pas ajouté à l'exécution par l'utilisateur comme les vidéos
    -- d'écoute) — cette table ne garde donc que la progression SM-2.
    CREATE TABLE IF NOT EXISTS reading_cards (
      id TEXT PRIMARY KEY NOT NULL,
      ease_factor REAL NOT NULL,
      interval_days REAL NOT NULL,
      repetitions INTEGER NOT NULL,
      lapses INTEGER NOT NULL,
      learning_step_index INTEGER NOT NULL,
      lifecycle TEXT NOT NULL,
      due_date TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reading_cards_due_date ON reading_cards(due_date);

    CREATE TABLE IF NOT EXISTS reading_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id TEXT NOT NULL,
      grade TEXT NOT NULL,
      reviewed_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reading_reviews_reviewed_at ON reading_reviews(reviewed_at);

    -- Onglet Livres (21/08/2026) — lecture libre, INDÉPENDANTE du moteur
    -- SM-2 (pas de carte de révision, demandé explicitement) : pas de
    -- table _cards/_reviews comme les autres domaines. Contrairement
    -- à la conjugaison/aux expressions, le contenu N'EST PAS bundlé avec
    -- l'app — chaque utilisateur ajoute ses propres livres à l'exécution
    -- (URL directe ou recherche Open Library/Internet Archive), donc le
    -- texte complet vit en base, pas dans un JSON versionné (même
    -- principe que listening_videos/listening_segments).
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      author TEXT,
      source_url TEXT NOT NULL,
      format TEXT NOT NULL,
      added_at TEXT NOT NULL,
      last_chapter_id TEXT,
      last_position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS book_chapters (
      id TEXT PRIMARY KEY NOT NULL,
      book_id TEXT NOT NULL REFERENCES books(id),
      order_index INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_book_chapters_book_id ON book_chapters(book_id);

    -- Signets manuels, plusieurs possibles par livre — distincts de
    -- books.last_chapter_id/last_position (position AUTOMATIQUE, un
    -- seul champ, mise à jour au fil de la lecture), demandé explicitement.
    CREATE TABLE IF NOT EXISTS book_bookmarks (
      id TEXT PRIMARY KEY NOT NULL,
      book_id TEXT NOT NULL REFERENCES books(id),
      chapter_id TEXT NOT NULL REFERENCES book_chapters(id),
      position INTEGER NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_book_bookmarks_book_id ON book_bookmarks(book_id);
  `);
}

/** Importe dans SQLite tout mot du bundle (`words.json`) pas encore
 * présent en base, avec une carte SM-2 neuve pour chacun — au premier
 * lancement, ça importe tout ; sur une base déjà peuplée, ça complète
 * seulement ce qui manque (utilisé pour faire grandir le vocabulaire
 * d'une mise à jour à l'autre sans jamais toucher aux cartes déjà en
 * cours de révision). Remplace l'ancien `seedIfEmpty`, qui ne faisait
 * rien du tout si la table `words` n'était pas totalement vide — ça
 * empêchait silencieusement tout enrichissement ultérieur du bundle
 * (ex. le passage de 36 à 6000 mots, voir docs/AUDIT.md, ne serait jamais
 * arrivé jusqu'aux installations déjà seedées sans ce changement).
 *
 * Insertions groupées par lots ([insertInBatches]) plutôt qu'un
 * `runAsync` par mot — à 6000 mots, un aller-retour par ligne ajoutait
 * plusieurs secondes au premier lancement.
 *
 * Pas testé unitairement (pas de SQLite en mémoire disponible sous
 * Jest/jest-expo pour l'instant) — à vérifier sur device réel une fois
 * branché à un écran. Voir docs/AUDIT.md. */
export async function importMissingWords(db: LexisDb, words: Word[], now: Date = new Date()): Promise<number> {
  const existingRows = await db.getAllAsync<{ id: string }>('SELECT id FROM words;');
  const existingIds = new Set(existingRows.map((r) => r.id));
  const missing = words.filter((w) => !existingIds.has(w.id));
  if (missing.length === 0) return 0;

  await db.withTransactionAsync(async () => {
    await insertInBatches(
      db,
      missing,
      11,
      'INSERT INTO words (id, spanish, english, part_of_speech, gender, example_es, example_en, level, tags, frequency_rank, is_user_added)',
      (word) => [
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
        word.isUserAdded ? 1 : 0,
      ]
    );

    await insertInBatches(
      db,
      missing,
      8,
      'INSERT INTO cards (word_id, ease_factor, interval_days, repetitions, lapses, learning_step_index, lifecycle, due_date)',
      (word) => {
        const card = createCard({ dueDate: now });
        return [
          word.id,
          card.easeFactor,
          card.intervalDays,
          card.repetitions,
          card.lapses,
          card.learningStepIndex,
          card.lifecycle,
          card.dueDate.toISOString(),
        ];
      }
    );
  });

  return missing.length;
}

/** Resynchronise les tags des mots DÉJÀ en base avec ceux du bundle
 * (`words.json`) — nécessaire en plus de `importMissingWords`, qui
 * n'insère que les mots ABSENTS de la base et ne touche jamais un mot
 * déjà importé. Sans cette fonction, une mise à jour du contenu de
 * `words.json` (ex. l'ajout de tags thématiques à des mots qui n'en
 * avaient aucun, 20/08/2026) ne serait jamais visible sur une
 * installation déjà en place : les lignes SQLite existantes garderaient
 * pour toujours leurs anciens tags (souvent `[]`), même après une mise à
 * jour de l'app — signalé explicitement ("je clique sur un tag, pas
 * beaucoup de mots apparaissent, alors qu'il devrait y en avoir 6002").
 *
 * Ne touche jamais un mot ajouté par l'utilisateur (`is_user_added`) —
 * ces mots n'existent pas dans `words.json`, rien à resynchroniser.
 * Ne compare/écrit QUE la colonne `tags`, pas le reste du mot (portée
 * volontairement limitée au bug signalé, pas un resync général). */
export async function resyncWordTags(db: LexisDb, words: Word[]): Promise<number> {
  const existingRows = await db.getAllAsync<{ id: string; tags: string; is_user_added: number }>(
    'SELECT id, tags, is_user_added FROM words;'
  );
  const existingById = new Map(existingRows.map((r) => [r.id, r]));

  const toUpdate: { id: string; tags: string }[] = [];
  for (const word of words) {
    const existing = existingById.get(word.id);
    if (!existing || existing.is_user_added === 1) continue;
    const newTags = JSON.stringify(word.tags);
    if (existing.tags !== newTags) {
      toUpdate.push({ id: word.id, tags: newTags });
    }
  }
  if (toUpdate.length === 0) return 0;

  // Un UPDATE par ligne (un aller-retour au pont natif SQLite chacun) est
  // le même défaut déjà corrigé pour les inserts en masse via
  // `insertInBatches` — même volume potentiel ici (jusqu'à ~6000 mots,
  // voir docs/AUDIT.md, coût de démarrage non mesuré). Regroupé en
  // UPDATE ... CASE par lots de 80 (même taille que `insertInBatches`,
  // même raison : marge sous la limite historique de paramètres liés
  // SQLite) plutôt qu'`UPDATE ... FROM` (fonctionnalité SQLite plus
  // récente, version exacte bundlée par expo-sqlite non confirmée).
  const BATCH_SIZE = 80;
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      const batch = toUpdate.slice(i, i + BATCH_SIZE);
      const whenClauses = batch.map(() => 'WHEN ? THEN ?').join(' ');
      const idPlaceholders = batch.map(() => '?').join(', ');
      const caseParams = batch.flatMap(({ id, tags }) => [id, tags]);
      const idParams = batch.map(({ id }) => id);
      await db.runAsync(
        `UPDATE words SET tags = CASE id ${whenClauses} END WHERE id IN (${idPlaceholders});`,
        ...caseParams,
        ...idParams
      );
    }
  });

  return toUpdate.length;
}

export interface DueCardRow {
  word: Word;
  card: SM2CardState;
}

/** Écrit l'état SM-2 recalculé après une note — `SM2Engine.review()` est
 * une fonction pure, c'est ici qu'on persiste son résultat. */
export async function updateCard(db: LexisDb, wordId: string, card: SM2CardState): Promise<void> {
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
 * plafond 8 nouvelles + 22 révisions séparément (voir docs/PLAN.md). */
export async function getDueCards(db: LexisDb, now: Date, limit: number): Promise<DueCardRow[]> {
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
 * 8 + 22 par défaut — voir docs/PLAN.md, "Le calcul des plafonds") plutôt
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
 * milliers, pas des millions), à revoir si ça devient un goulot.
 *
 * `disabledLevels` (niveaux CECRL, demandé le 10/09/2026) a une
 * sémantique volontairement différente : exclusion TOTALE, y compris les
 * cartes déjà en révision — même principe que `disabledTenses` côté
 * conjugaison, voir `settings.ts`. `level` est une colonne SQL directe
 * (contrairement à `tags`), filtrable en `NOT IN` sans repli JS. */
export async function getDueCardsSplit(
  db: LexisDb,
  now: Date,
  settings: { newCardsPerDay: number; reviewCapPerDay: number; disabledTags: string[]; disabledLevels?: string[] }
): Promise<DueCardRow[]> {
  const disabledLevels = settings.disabledLevels ?? [];
  const levelClause = notInClause('w.level', disabledLevels);

  const reviewRows = await db.getAllAsync<WordCardRow>(
    `${WORD_CARD_SELECT}
     WHERE c.due_date <= ? AND c.lifecycle != 'new' ${levelClause}
     ORDER BY c.due_date ASC
     LIMIT ?;`,
    now.toISOString(),
    ...disabledLevels,
    settings.reviewCapPerDay
  );

  const newRows = await fetchNewCardRows(db, now, settings.disabledTags, disabledLevels, settings.newCardsPerDay);

  // Mélangé avant présentation — signalé explicitement non aléatoire
  // (20/08/2026) : `fetchNewCardRows` triait par fréquence, donc les
  // nouveaux mots apparaissaient toujours dans le même ordre (ser,
  // estar, tener...) à chaque session. Même correctif que pour la
  // conjugaison (voir `getDueConjugationCardsSplit`), appliqué ici
  // seulement maintenant que le problème a aussi été signalé côté
  // vocabulaire.
  return shuffle([...reviewRows, ...newRows]).map(mapWordCardRow);
}

async function fetchNewCardRows(
  db: LexisDb,
  now: Date,
  disabledTags: string[],
  disabledLevels: string[],
  limit: number
): Promise<WordCardRow[]> {
  const levelClause = notInClause('w.level', disabledLevels);

  // Tiré aléatoirement parmi les mots neufs (`ORDER BY RANDOM()`) plutôt
  // que par fréquence — l'ancien tri par `frequency_rank` rendait
  // l'ordre d'introduction des nouveaux mots entièrement prévisible.
  const candidateRows = await db.getAllAsync<WordCardRow>(
    `${WORD_CARD_SELECT}
     WHERE c.due_date <= ? AND c.lifecycle = 'new' ${levelClause}
     ORDER BY RANDOM()
     LIMIT ?;`,
    now.toISOString(),
    ...disabledLevels,
    // Marge pour compenser les mots filtrés ensuite par `disabledTags`.
    limit * 5 + 50
  );

  const disabled = new Set(disabledTags);
  // Déjà aléatoire depuis le tri SQL ci-dessus — pas besoin de remélanger.
  return candidateRows.filter((r) => !(JSON.parse(r.tags) as string[]).some((tag) => disabled.has(tag))).slice(0, limit);
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
  db: LexisDb,
  now: Date,
  disabledTags: string[],
  disabledLevels: string[],
  limit: number
): Promise<DueCardRow[]> {
  const rows = await fetchNewCardRows(db, now, disabledTags, disabledLevels, limit);
  return rows.map(mapWordCardRow);
}

/** Un mot précis avec son état de carte, indépendamment de si sa
 * `due_date` est passée ou non — utilisé quand on note une carte depuis
 * une notification, où on veut son état courant, pas seulement "les
 * cartes dues maintenant" (elle pourrait avoir été programmée pour dans
 * quelques minutes et notée en avance, ou en retard sur son horaire
 * prévu si l'app a été fermée). */
export async function getWordWithCard(db: LexisDb, wordId: string): Promise<DueCardRow | null> {
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
export async function logReview(db: LexisDb, wordId: string, grade: SM2Grade, at: Date = new Date()): Promise<void> {
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
export async function getAllReviews(db: LexisDb): Promise<ReviewLogRow[]> {
  const rows = await db.getAllAsync<{ grade: string; reviewed_at: string }>(
    'SELECT grade, reviewed_at FROM reviews ORDER BY reviewed_at ASC;'
  );
  return rows.map((r) => ({ grade: parseGrade(r.grade), reviewedAt: new Date(r.reviewed_at) }));
}

/** Dates d'échéance de toutes les cartes non nouvelles (pour la
 * prévision de charge) — les cartes `new` n'ont pas encore de vraie date
 * d'échéance significative tant qu'elles n'ont pas été vues une fois. */
export async function getAllDueDates(db: LexisDb): Promise<Date[]> {
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
export async function getWordCounts(db: LexisDb): Promise<WordCounts> {
  const total = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM words;');
  const learned = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM cards WHERE lifecycle != 'new';"
  );
  return { total: total?.count ?? 0, learned: learned?.count ?? 0 };
}

/** Nombre de révisions déjà faites depuis le début d'un jour donné —
 * sert à afficher la progression du jour sur l'écran Aujourd'hui. */
export async function getReviewCountSince(db: LexisDb, since: Date): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM reviews WHERE reviewed_at >= ?;',
    since.toISOString()
  );
  return row?.count ?? 0;
}

export interface WordFilter {
  level?: string;
  tag?: string;
  /** N'affiche que les mots ajoutés depuis l'app (pas ceux importés de
   * words.json) — filtre "Mots ajoutés" de Decks & mots, demandé
   * explicitement le 21/08/2026. Réutilise la colonne `is_user_added`
   * déjà utilisée pour restreindre la suppression au même sous-ensemble. */
  userAddedOnly?: boolean;
}

/** Tous les mots, triés par fréquence, avec filtre optionnel par niveau
 * et/ou tag — utilisé par l'écran Decks/mots. */
export async function getAllWords(db: LexisDb, filter: WordFilter = {}): Promise<Word[]> {
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
  if (filter.userAddedOnly) {
    conditions.push('is_user_added = 1');
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
export async function getAllTags(db: LexisDb): Promise<string[]> {
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
export async function addUserWord(db: LexisDb, word: Omit<Word, 'isUserAdded'>, now: Date = new Date()): Promise<void> {
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

export interface WordEditableFields {
  english: string;
  exampleEn: string;
  tags: string[];
  level: string;
}

/** Édite un mot existant, importé (`words.json`) ou ajouté par
 * l'utilisateur — seuls les champs listés dans `WordEditableFields` sont
 * modifiables (portée volontairement limitée à la demande explicite du
 * 21/08/2026 : traduction, exemple anglais, tag/thème, niveau CECRL) ; le
 * reste du mot (espagnol, catégorie grammaticale, exemple espagnol) n'est
 * pas éditable depuis cet écran. Un simple `UPDATE`, comme `resyncWordTags`
 * et `updateReviewGrade` ci-dessous — pas de nouvelle table. */
export async function updateWord(db: LexisDb, wordId: string, fields: WordEditableFields): Promise<void> {
  await db.runAsync(
    'UPDATE words SET english = ?, example_en = ?, tags = ?, level = ? WHERE id = ?;',
    fields.english,
    fields.exampleEn,
    JSON.stringify(fields.tags),
    fields.level,
    wordId
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
export async function getReviewHistory(db: LexisDb, limit = 200): Promise<ReviewHistoryRow[]> {
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
export async function updateReviewGrade(db: LexisDb, reviewId: number, grade: SM2Grade): Promise<void> {
  await db.runAsync('UPDATE reviews SET grade = ? WHERE id = ?;', grade, reviewId);
}

export async function deleteWord(db: LexisDb, wordId: string): Promise<void> {
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
export async function resetProgress(db: LexisDb, now: Date = new Date()): Promise<void> {
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

    // Idem pour la compréhension orale (20/08/2026) — mêmes règles que
    // pour la conjugaison juste au-dessus : les vidéos/segments déjà
    // ajoutés restent en base, seule leur progression SM-2 repart à zéro.
    await db.runAsync('DELETE FROM listening_reviews;');
    await db.runAsync(
      `UPDATE listening_cards
       SET ease_factor = ?, interval_days = ?, repetitions = ?, lapses = ?, learning_step_index = ?, lifecycle = ?, due_date = ?;`,
      card.easeFactor,
      card.intervalDays,
      card.repetitions,
      card.lapses,
      card.learningStepIndex,
      card.lifecycle,
      card.dueDate.toISOString()
    );

    // Idem pour les expressions et la compréhension écrite (21/08/2026) —
    // mêmes règles que la conjugaison/l'écoute ci-dessus : le contenu
    // (expressions.json/reading.json) n'est pas touché, seule la
    // progression SM-2 repart à zéro.
    await db.runAsync('DELETE FROM expression_reviews;');
    await db.runAsync(
      `UPDATE expression_cards
       SET ease_factor = ?, interval_days = ?, repetitions = ?, lapses = ?, learning_step_index = ?, lifecycle = ?, due_date = ?;`,
      card.easeFactor,
      card.intervalDays,
      card.repetitions,
      card.lapses,
      card.learningStepIndex,
      card.lifecycle,
      card.dueDate.toISOString()
    );

    await db.runAsync('DELETE FROM reading_reviews;');
    await db.runAsync(
      `UPDATE reading_cards
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
 * premier lancement, seulement le delta ensuite. Avec le répertoire
 * élargi à ~1227 verbes (voir docs/AUDIT.md, 20/08/2026), ça représente
 * jusqu'à ~63 800 cartes au premier import — insérées par lots
 * ([insertInBatches]), pas une par une (aurait ajouté une dizaine de
 * secondes ou plus au premier lancement à ce volume). */
export async function importMissingConjugationCards(
  db: LexisDb,
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
    await insertInBatches(
      db,
      missing,
      11,
      'INSERT INTO conjugation_cards (id, verb_id, tense, person, ease_factor, interval_days, repetitions, lapses, learning_step_index, lifecycle, due_date)',
      (item) => {
        const card = createCard({ dueDate: now });
        return [
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
          card.dueDate.toISOString(),
        ];
      }
    );
  });

  return missing.length;
}

/** Fragment SQL `NOT IN (...)` conditionnel — vide si rien n'est
 * désactivé (`NOT IN ()` est une erreur de syntaxe SQLite). Partagé par
 * `disabledLevels` (vocabulaire) et `disabledTenses` (conjugaison), les
 * deux seuls filtres exprimés directement en colonne SQL plutôt qu'en
 * JSON (`disabledTags` reste un filtre JS, voir `fetchNewCardRows`). */
function notInClause(column: string, values: string[]): string {
  return values.length > 0 ? `AND ${column} NOT IN (${values.map(() => '?').join(', ')})` : '';
}

/** Cartes de conjugaison dues, avec le même principe de plafond séparé
 * nouvelles/révisions que `getDueCardsSplit` (vocabulaire) — voir
 * docs/PLAN.md.
 *
 * `disabledTenses` (demandé explicitement le 06/09/2026) exclut
 * complètement les temps désactivés des deux requêtes (révisions ET
 * nouvelles) — volontairement différent de `disabledTags` côté
 * vocabulaire, qui ne filtre que les nouvelles cartes : ici, l'attente
 * explicite est qu'AUCUNE carte du temps désactivé n'apparaisse plus,
 * même une déjà en apprentissage. `tense` est une colonne SQL directe
 * (contrairement à `tags`, un tableau JSON côté `words`), donc filtrable
 * en `NOT IN` sans repli JS ni marge de sur-lecture.
 *
 * **Ordre aléatoire, pas par fréquence/insertion** — retour explicite :
 * l'ordre précédent (par `rowid`, donc verbe par verbe dans l'ordre
 * d'import) faisait défiler toutes les formes d'un même verbe avant de
 * passer au suivant, prévisible et peu utile pour s'entraîner. Les
 * nouvelles cartes sont tirées avec `ORDER BY RANDOM()` côté SQL, et
 * l'ensemble révisions+nouvelles est encore mélangé côté JS
 * ([shuffle]) avant d'être renvoyé, pour que l'ordre de présentation ne
 * soit pas non plus figé par "toutes les révisions d'abord". */
export async function getDueConjugationCardsSplit(
  db: LexisDb,
  now: Date,
  settings: { conjugationNewCardsPerDay: number; conjugationReviewCapPerDay: number; disabledTenses?: ConjugationTense[] }
): Promise<DueConjugationCardRow[]> {
  const disabledTenses = settings.disabledTenses ?? [];
  const tenseClause = notInClause('tense', disabledTenses);

  const reviewRows = await db.getAllAsync<ConjugationCardRow>(
    `SELECT * FROM conjugation_cards WHERE due_date <= ? AND lifecycle != 'new' ${tenseClause} ORDER BY due_date ASC LIMIT ?;`,
    now.toISOString(),
    ...disabledTenses,
    settings.conjugationReviewCapPerDay
  );

  const newRows = await db.getAllAsync<ConjugationCardRow>(
    `SELECT * FROM conjugation_cards WHERE due_date <= ? AND lifecycle = 'new' ${tenseClause} ORDER BY RANDOM() LIMIT ?;`,
    now.toISOString(),
    ...disabledTenses,
    settings.conjugationNewCardsPerDay
  );

  return shuffle([...reviewRows, ...newRows]).map(mapConjugationCardRow);
}

export interface ConjugationCounts {
  total: number;
  learned: number;
}

/** Même définition d'"acquis" que `getWordCounts` côté vocabulaire : a
 * été vu au moins une fois (au-delà de l'état `new`), pas de seuil sur
 * l'intervalle. Affiché sur l'onglet Conjugaison → Entraînement à la
 * place du nombre de conjugaisons dues (demandé explicitement,
 * 20/08/2026) — le nombre dû reste utilisé en interne pour activer/
 * désactiver le bouton de session, juste plus affiché en gros. */
export async function getConjugationCounts(db: LexisDb): Promise<ConjugationCounts> {
  const total = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM conjugation_cards;');
  const learned = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM conjugation_cards WHERE lifecycle != 'new';"
  );
  return { total: total?.count ?? 0, learned: learned?.count ?? 0 };
}

export async function updateConjugationCard(db: LexisDb, cardId: string, card: SM2CardState): Promise<void> {
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
  db: LexisDb,
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

export interface ConjugationHistoryRow {
  id: number;
  verbId: string;
  tense: ConjugationTense;
  person: number;
  grade: SM2Grade;
  reviewedAt: Date;
}

/** Historique de révisions de conjugaison, le plus récent d'abord —
 * demandé explicitement (20/08/2026), même principe que
 * `getReviewHistory` côté vocabulaire. Ne renvoie que `verb_id`/`tense`/
 * `person` (pas l'infinitif ni la forme conjuguée) : le contenu des
 * verbes n'est pas dupliqué en base (voir plus haut) — c'est à
 * l'appelant de faire la jointure avec `conjugation/data.ts`
 * (`getConjugationVerb`) pour afficher l'infinitif et la forme. */
export async function getConjugationHistory(db: LexisDb, limit = 200): Promise<ConjugationHistoryRow[]> {
  type Row = { id: number; verb_id: string; tense: string; person: number; grade: string; reviewed_at: string };
  const rows = await db.getAllAsync<Row>(
    `SELECT r.id, c.verb_id, c.tense, c.person, r.grade, r.reviewed_at
     FROM conjugation_reviews r
     JOIN conjugation_cards c ON c.id = r.card_id
     ORDER BY r.reviewed_at DESC
     LIMIT ?;`,
    limit
  );
  return rows.map((r) => ({
    id: r.id,
    verbId: r.verb_id,
    tense: parseTense(r.tense),
    person: r.person,
    grade: parseGrade(r.grade),
    reviewedAt: new Date(r.reviewed_at),
  }));
}

/** Corrige la note d'une entrée d'historique de conjugaison — même
 * limite assumée que `updateReviewGrade` côté vocabulaire : ne change
 * que le journal `conjugation_reviews`, ne recalcule pas rétroactivement
 * l'échéance déjà programmée de la carte. */
export async function updateConjugationReviewGrade(db: LexisDb, reviewId: number, grade: SM2Grade): Promise<void> {
  await db.runAsync('UPDATE conjugation_reviews SET grade = ? WHERE id = ?;', grade, reviewId);
}

// MARK: - Expressions et locutions

type ExpressionCardRow = {
  id: string;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  lapses: number;
  learning_step_index: number;
  lifecycle: string;
  due_date: string;
};

export interface DueExpressionCardRow {
  cardId: string;
  card: SM2CardState;
}

function mapExpressionCardRow(r: ExpressionCardRow): DueExpressionCardRow {
  return {
    cardId: r.id,
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

/** Importe dans SQLite toute expression de `expressions.json` pas
 * encore présente en base, avec une carte SM-2 neuve pour chacune —
 * même principe que `importMissingConjugationCards`, en plus simple
 * (id = id de l'expression directement, pas de triplet à construire). */
export async function importMissingExpressionCards(
  db: LexisDb,
  expressionsList: Expression[],
  now: Date = new Date()
): Promise<number> {
  const existingRows = await db.getAllAsync<{ id: string }>('SELECT id FROM expression_cards;');
  const existingIds = new Set(existingRows.map((r) => r.id));
  const missing = expressionsList.filter((e) => !existingIds.has(e.id));
  if (missing.length === 0) return 0;

  await db.withTransactionAsync(async () => {
    await insertInBatches(
      db,
      missing,
      8,
      'INSERT INTO expression_cards (id, ease_factor, interval_days, repetitions, lapses, learning_step_index, lifecycle, due_date)',
      (item) => {
        const card = createCard({ dueDate: now });
        return [
          item.id,
          card.easeFactor,
          card.intervalDays,
          card.repetitions,
          card.lapses,
          card.learningStepIndex,
          card.lifecycle,
          card.dueDate.toISOString(),
        ];
      }
    );
  });

  return missing.length;
}

/** Même principe de plafond séparé nouvelles/révisions et de mélange
 * final que `getDueConjugationCardsSplit` — voir ce commentaire pour le
 * détail du raisonnement (ordre aléatoire côté SQL pour les nouvelles,
 * `shuffle` côté JS sur l'ensemble avant renvoi). */
export async function getDueExpressionCardsSplit(
  db: LexisDb,
  now: Date,
  settings: { expressionNewCardsPerDay: number; expressionReviewCapPerDay: number }
): Promise<DueExpressionCardRow[]> {
  const reviewRows = await db.getAllAsync<ExpressionCardRow>(
    `SELECT * FROM expression_cards WHERE due_date <= ? AND lifecycle != 'new' ORDER BY due_date ASC LIMIT ?;`,
    now.toISOString(),
    settings.expressionReviewCapPerDay
  );
  const newRows = await db.getAllAsync<ExpressionCardRow>(
    `SELECT * FROM expression_cards WHERE due_date <= ? AND lifecycle = 'new' ORDER BY RANDOM() LIMIT ?;`,
    now.toISOString(),
    settings.expressionNewCardsPerDay
  );
  return shuffle([...reviewRows, ...newRows]).map(mapExpressionCardRow);
}

export interface ExpressionCounts {
  total: number;
  learned: number;
}

export async function getExpressionCounts(db: LexisDb): Promise<ExpressionCounts> {
  const total = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM expression_cards;');
  const learned = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM expression_cards WHERE lifecycle != 'new';"
  );
  return { total: total?.count ?? 0, learned: learned?.count ?? 0 };
}

export async function updateExpressionCard(db: LexisDb, cardId: string, card: SM2CardState): Promise<void> {
  await db.runAsync(
    `UPDATE expression_cards
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

export async function logExpressionReview(
  db: LexisDb,
  cardId: string,
  grade: SM2Grade,
  at: Date = new Date()
): Promise<void> {
  await db.runAsync(
    'INSERT INTO expression_reviews (card_id, grade, reviewed_at) VALUES (?, ?, ?);',
    cardId,
    grade,
    at.toISOString()
  );
}

export interface ExpressionHistoryRow {
  id: number;
  expressionId: string;
  grade: SM2Grade;
  reviewedAt: Date;
}

/** Historique de révisions d'expressions, le plus récent d'abord — ne
 * renvoie que l'id de l'expression (pas son texte) : le contenu n'est
 * pas dupliqué en base, voir `expressions/data.ts` (`getExpression`)
 * pour la jointure côté appelant, même principe que
 * `getConjugationHistory`. */
export async function getExpressionHistory(db: LexisDb, limit = 200): Promise<ExpressionHistoryRow[]> {
  type Row = { id: number; card_id: string; grade: string; reviewed_at: string };
  const rows = await db.getAllAsync<Row>(
    `SELECT id, card_id, grade, reviewed_at FROM expression_reviews ORDER BY reviewed_at DESC LIMIT ?;`,
    limit
  );
  return rows.map((r) => ({
    id: r.id,
    expressionId: r.card_id,
    grade: parseGrade(r.grade),
    reviewedAt: new Date(r.reviewed_at),
  }));
}

export async function updateExpressionReviewGrade(db: LexisDb, reviewId: number, grade: SM2Grade): Promise<void> {
  await db.runAsync('UPDATE expression_reviews SET grade = ? WHERE id = ?;', grade, reviewId);
}

// MARK: - Compréhension écrite

type ReadingCardRow = {
  id: string;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  lapses: number;
  learning_step_index: number;
  lifecycle: string;
  due_date: string;
};

export interface DueReadingCardRow {
  cardId: string;
  card: SM2CardState;
}

function mapReadingCardRow(r: ReadingCardRow): DueReadingCardRow {
  return {
    cardId: r.id,
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

/** Importe dans SQLite tout texte de `reading.json` pas encore présent
 * en base, avec une carte SM-2 neuve pour chacun — une carte par TEXTE
 * entier (questions comprises), pas par question (demandé explicitement
 * le 21/08/2026). */
export async function importMissingReadingCards(
  db: LexisDb,
  texts: ReadingText[],
  now: Date = new Date()
): Promise<number> {
  const existingRows = await db.getAllAsync<{ id: string }>('SELECT id FROM reading_cards;');
  const existingIds = new Set(existingRows.map((r) => r.id));
  const missing = texts.filter((t) => !existingIds.has(t.id));
  if (missing.length === 0) return 0;

  await db.withTransactionAsync(async () => {
    await insertInBatches(
      db,
      missing,
      8,
      'INSERT INTO reading_cards (id, ease_factor, interval_days, repetitions, lapses, learning_step_index, lifecycle, due_date)',
      (item) => {
        const card = createCard({ dueDate: now });
        return [
          item.id,
          card.easeFactor,
          card.intervalDays,
          card.repetitions,
          card.lapses,
          card.learningStepIndex,
          card.lifecycle,
          card.dueDate.toISOString(),
        ];
      }
    );
  });

  return missing.length;
}

export async function getDueReadingCardsSplit(
  db: LexisDb,
  now: Date,
  settings: { readingNewCardsPerDay: number; readingReviewCapPerDay: number }
): Promise<DueReadingCardRow[]> {
  const reviewRows = await db.getAllAsync<ReadingCardRow>(
    `SELECT * FROM reading_cards WHERE due_date <= ? AND lifecycle != 'new' ORDER BY due_date ASC LIMIT ?;`,
    now.toISOString(),
    settings.readingReviewCapPerDay
  );
  const newRows = await db.getAllAsync<ReadingCardRow>(
    `SELECT * FROM reading_cards WHERE due_date <= ? AND lifecycle = 'new' ORDER BY RANDOM() LIMIT ?;`,
    now.toISOString(),
    settings.readingNewCardsPerDay
  );
  return shuffle([...reviewRows, ...newRows]).map(mapReadingCardRow);
}

export interface ReadingCounts {
  total: number;
  learned: number;
}

export async function getReadingCounts(db: LexisDb): Promise<ReadingCounts> {
  const total = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM reading_cards;');
  const learned = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM reading_cards WHERE lifecycle != 'new';"
  );
  return { total: total?.count ?? 0, learned: learned?.count ?? 0 };
}

export async function updateReadingCard(db: LexisDb, cardId: string, card: SM2CardState): Promise<void> {
  await db.runAsync(
    `UPDATE reading_cards
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

export async function logReadingReview(
  db: LexisDb,
  cardId: string,
  grade: SM2Grade,
  at: Date = new Date()
): Promise<void> {
  await db.runAsync(
    'INSERT INTO reading_reviews (card_id, grade, reviewed_at) VALUES (?, ?, ?);',
    cardId,
    grade,
    at.toISOString()
  );
}

export interface ReadingHistoryRow {
  id: number;
  textId: string;
  grade: SM2Grade;
  reviewedAt: Date;
}

/** Historique de révisions de compréhension écrite, le plus récent
 * d'abord — ne renvoie que l'id du texte (pas son contenu), même
 * principe que `getExpressionHistory`/`getConjugationHistory`. */
export async function getReadingHistory(db: LexisDb, limit = 200): Promise<ReadingHistoryRow[]> {
  type Row = { id: number; card_id: string; grade: string; reviewed_at: string };
  const rows = await db.getAllAsync<Row>(
    `SELECT id, card_id, grade, reviewed_at FROM reading_reviews ORDER BY reviewed_at DESC LIMIT ?;`,
    limit
  );
  return rows.map((r) => ({
    id: r.id,
    textId: r.card_id,
    grade: parseGrade(r.grade),
    reviewedAt: new Date(r.reviewed_at),
  }));
}

export async function updateReadingReviewGrade(db: LexisDb, reviewId: number, grade: SM2Grade): Promise<void> {
  await db.runAsync('UPDATE reading_reviews SET grade = ? WHERE id = ?;', grade, reviewId);
}

// MARK: - Livres

type BookRow = {
  id: string;
  title: string;
  author: string | null;
  source_url: string;
  format: string;
  added_at: string;
  last_chapter_id: string | null;
  last_position: number;
};

const VALID_BOOK_FORMATS = new Set<string>(['epub', 'txt', 'html']);

function parseBookFormat(value: string): BookFormat {
  if (VALID_BOOK_FORMATS.has(value)) return value as BookFormat;
  throw new Error(`Format de livre invalide en base : "${value}"`);
}

function mapBookRow(r: BookRow): Book {
  return {
    id: r.id,
    title: r.title,
    author: r.author,
    sourceUrl: r.source_url,
    format: parseBookFormat(r.format),
    addedAt: new Date(r.added_at),
    lastChapterId: r.last_chapter_id,
    lastPosition: r.last_position,
  };
}

/** Crée un livre et tous ses chapitres en une transaction — id des
 * chapitres dérivé de l'id du livre (`${bookId}_ch${index}`), même
 * principe que les ids composites déjà utilisés ailleurs (voir
 * `conjugationCardId`) plutôt qu'un identifiant aléatoire, pour rester
 * simple et lisible en base. */
export async function createBook(
  db: LexisDb,
  book: { id: string; title: string; author: string | null; sourceUrl: string; format: BookFormat },
  chapters: { title: string; content: string }[],
  now: Date = new Date()
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO books (id, title, author, source_url, format, added_at, last_chapter_id, last_position)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 0);`,
      book.id,
      book.title,
      book.author,
      book.sourceUrl,
      book.format,
      now.toISOString()
    );

    const chapterRows = chapters.map((c, index) => ({
      id: `${book.id}_ch${index}`,
      orderIndex: index,
      title: c.title,
      content: c.content,
    }));

    await insertInBatches(
      db,
      chapterRows,
      5,
      'INSERT INTO book_chapters (id, book_id, order_index, title, content)',
      (c) => [c.id, book.id, c.orderIndex, c.title, c.content]
    );
  });
}

export async function getBooks(db: LexisDb): Promise<Book[]> {
  const rows = await db.getAllAsync<BookRow>('SELECT * FROM books ORDER BY added_at DESC;');
  return rows.map(mapBookRow);
}

export async function getBook(db: LexisDb, bookId: string): Promise<Book | null> {
  const row = await db.getFirstAsync<BookRow>('SELECT * FROM books WHERE id = ?;', bookId);
  return row ? mapBookRow(row) : null;
}

export async function getBookChapters(db: LexisDb, bookId: string): Promise<BookChapter[]> {
  type Row = { id: string; book_id: string; order_index: number; title: string; content: string };
  const rows = await db.getAllAsync<Row>('SELECT * FROM book_chapters WHERE book_id = ? ORDER BY order_index ASC;', bookId);
  return rows.map((r) => ({ id: r.id, bookId: r.book_id, orderIndex: r.order_index, title: r.title, content: r.content }));
}

export async function getBookChapter(db: LexisDb, chapterId: string): Promise<BookChapter | null> {
  type Row = { id: string; book_id: string; order_index: number; title: string; content: string };
  const row = await db.getFirstAsync<Row>('SELECT * FROM book_chapters WHERE id = ?;', chapterId);
  return row ? { id: row.id, bookId: row.book_id, orderIndex: row.order_index, title: row.title, content: row.content } : null;
}

/** Position AUTOMATIQUE de reprise de lecture — mise à jour au fil de la
 * lecture (voir ReaderScreen.tsx), distincte des signets manuels
 * ci-dessous. `position` est un index de PARAGRAPHE dans le chapitre,
 * pas un offset de caractères (voir docs/DECISIONS.md pour le choix de
 * granularité). */
export async function updateBookProgress(db: LexisDb, bookId: string, chapterId: string, position: number): Promise<void> {
  await db.runAsync('UPDATE books SET last_chapter_id = ?, last_position = ? WHERE id = ?;', chapterId, position, bookId);
}

export async function deleteBook(db: LexisDb, bookId: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM book_bookmarks WHERE book_id = ?;', bookId);
    await db.runAsync('DELETE FROM book_chapters WHERE book_id = ?;', bookId);
    await db.runAsync('DELETE FROM books WHERE id = ?;', bookId);
  });
}

/** Signet manuel — id généré ici (horodatage + suffixe aléatoire) plutôt
 * que dérivé du contenu comme les chapitres : plusieurs signets peuvent
 * exister pour la même position au fil de sessions différentes, pas de
 * clé métier naturelle. */
export async function addBookmark(
  db: LexisDb,
  bookmark: { bookId: string; chapterId: string; position: number; note: string | null },
  now: Date = new Date()
): Promise<string> {
  const id = `bm_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`;
  await db.runAsync(
    'INSERT INTO book_bookmarks (id, book_id, chapter_id, position, note, created_at) VALUES (?, ?, ?, ?, ?, ?);',
    id,
    bookmark.bookId,
    bookmark.chapterId,
    bookmark.position,
    bookmark.note,
    now.toISOString()
  );
  return id;
}

export async function getBookmarks(db: LexisDb, bookId: string): Promise<BookBookmark[]> {
  type Row = { id: string; book_id: string; chapter_id: string; position: number; note: string | null; created_at: string };
  const rows = await db.getAllAsync<Row>(
    'SELECT * FROM book_bookmarks WHERE book_id = ? ORDER BY created_at DESC;',
    bookId
  );
  return rows.map((r) => ({
    id: r.id,
    bookId: r.book_id,
    chapterId: r.chapter_id,
    position: r.position,
    note: r.note,
    createdAt: new Date(r.created_at),
  }));
}

export async function deleteBookmark(db: LexisDb, bookmarkId: string): Promise<void> {
  await db.runAsync('DELETE FROM book_bookmarks WHERE id = ?;', bookmarkId);
}

// MARK: - Compréhension orale

const VALID_CAPTION_STATUSES: readonly CaptionStatus[] = ['available', 'auto_generated', 'unavailable'];

function parseCaptionStatus(value: string): CaptionStatus {
  if ((VALID_CAPTION_STATUSES as readonly string[]).includes(value)) {
    return value as CaptionStatus;
  }
  throw new Error(`Valeur de caption_status invalide en base : "${value}"`);
}

type ListeningVideoRow = {
  id: string;
  title: string;
  channel: string;
  thumbnail_url: string;
  duration_seconds: number | null;
  language: string;
  caption_status: string;
  added_at: string;
};

function mapListeningVideoRow(r: ListeningVideoRow): ListeningVideo {
  return {
    id: r.id,
    title: r.title,
    channel: r.channel,
    thumbnailUrl: r.thumbnail_url,
    durationSeconds: r.duration_seconds,
    language: r.language,
    captionStatus: parseCaptionStatus(r.caption_status),
    addedAt: r.added_at,
  };
}

/** Ajoute une vidéo à la bibliothèque avec ses segments (déjà découpés
 * depuis les sous-titres, voir `listening/captions.ts`) et une carte SM-2
 * neuve par segment — en une seule transaction, pour ne jamais se
 * retrouver avec une vidéo sans ses segments/cartes si l'app est fermée
 * au milieu. `segments` peut être vide (sous-titres indisponibles, voir
 * `CaptionStatus`) : la vidéo est quand même enregistrée dans la
 * bibliothèque, juste non exploitable pour les exercices tant qu'elle n'a
 * aucun segment (voir docs/PLAN.md, "dégradation gracieuse"). */
export async function addListeningVideo(
  db: LexisDb,
  video: ListeningVideo,
  segments: Omit<ListeningSegment, 'id' | 'videoId' | 'index'>[],
  now: Date = new Date()
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO listening_videos (id, title, channel, thumbnail_url, duration_seconds, language, caption_status, added_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      video.id,
      video.title,
      video.channel,
      video.thumbnailUrl,
      video.durationSeconds,
      video.language,
      video.captionStatus,
      video.addedAt
    );

    if (segments.length === 0) return;

    const segmentRows = segments.map((seg, index) => ({ id: `${video.id}:${index}`, index, ...seg }));

    await insertInBatches(
      db,
      segmentRows,
      6,
      'INSERT INTO listening_segments (id, video_id, segment_index, start_time, end_time, transcript)',
      (seg) => [seg.id, video.id, seg.index, seg.startTime, seg.endTime, seg.transcript]
    );

    await insertInBatches(
      db,
      segmentRows,
      9,
      'INSERT INTO listening_cards (id, video_id, ease_factor, interval_days, repetitions, lapses, learning_step_index, lifecycle, due_date)',
      (seg) => {
        const card = createCard({ dueDate: now });
        return [
          seg.id,
          video.id,
          card.easeFactor,
          card.intervalDays,
          card.repetitions,
          card.lapses,
          card.learningStepIndex,
          card.lifecycle,
          card.dueDate.toISOString(),
        ];
      }
    );
  });
}

/** Toutes les vidéos de la bibliothèque, la plus récemment ajoutée
 * d'abord — utilisé par l'écran Bibliothèque. */
export async function getListeningVideos(db: LexisDb): Promise<ListeningVideo[]> {
  const rows = await db.getAllAsync<ListeningVideoRow>('SELECT * FROM listening_videos ORDER BY added_at DESC;');
  return rows.map(mapListeningVideoRow);
}

export interface ListeningVideoWithStats extends ListeningVideo {
  segmentCount: number;
}

/** Même chose que `getListeningVideos`, avec le nombre de segments de
 * chaque vidéo en plus — sert à l'écran Bibliothèque pour distinguer une
 * vidéo exploitable (≥ 1 segment) d'une vidéo ajoutée mais sans
 * sous-titres récupérables (`captionStatus === 'unavailable'`, 0
 * segment). Sous-requête plutôt qu'une jointure + GROUP BY : plus simple
 * à lire pour un volume de vidéos qui reste petit (bibliothèque
 * personnelle, pas un catalogue). */
export async function getListeningVideosWithStats(db: LexisDb): Promise<ListeningVideoWithStats[]> {
  type Row = ListeningVideoRow & { segment_count: number };
  const rows = await db.getAllAsync<Row>(
    `SELECT v.*, (SELECT COUNT(*) FROM listening_segments s WHERE s.video_id = v.id) as segment_count
     FROM listening_videos v
     ORDER BY v.added_at DESC;`
  );
  return rows.map((r) => ({ ...mapListeningVideoRow(r), segmentCount: r.segment_count }));
}

/** Supprime une vidéo et tout ce qui en dépend (segments, cartes,
 * historique de révisions) — irréversible, l'appelant doit confirmer
 * avant d'appeler cette fonction (voir l'écran Bibliothèque). */
export async function deleteListeningVideo(db: LexisDb, videoId: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `DELETE FROM listening_reviews WHERE card_id IN (SELECT id FROM listening_cards WHERE video_id = ?);`,
      videoId
    );
    await db.runAsync('DELETE FROM listening_cards WHERE video_id = ?;', videoId);
    await db.runAsync('DELETE FROM listening_segments WHERE video_id = ?;', videoId);
    await db.runAsync('DELETE FROM listening_videos WHERE id = ?;', videoId);
  });
}

export interface DueListeningCardRow {
  cardId: string;
  videoId: string;
  segmentIndex: number;
  startTime: number;
  endTime: number;
  transcript: string;
  card: SM2CardState;
}

type ListeningCardWithSegmentRow = {
  id: string;
  video_id: string;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  lapses: number;
  learning_step_index: number;
  lifecycle: string;
  due_date: string;
  segment_index: number;
  start_time: number;
  end_time: number;
  transcript: string;
};

function mapListeningCardRow(r: ListeningCardWithSegmentRow): DueListeningCardRow {
  return {
    cardId: r.id,
    videoId: r.video_id,
    segmentIndex: r.segment_index,
    startTime: r.start_time,
    endTime: r.end_time,
    transcript: r.transcript,
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

const LISTENING_CARD_SEGMENT_SELECT = `SELECT c.*, s.segment_index, s.start_time, s.end_time, s.transcript
     FROM listening_cards c
     JOIN listening_segments s ON s.id = c.id`;

/** Segments dus, avec le même principe de plafond séparé nouveaux/révisions
 * que `getDueCardsSplit`/`getDueConjugationCardsSplit`. **Ne fait PAS la
 * sélection vidéo-puis-segment décrite dans docs/PLAN.md** — ça reste le rôle de
 * `listening/selection.ts`, appelé côté écran à partir de ce pool de
 * lignes dues et de `getRecentListeningVideoIds` (le cooldown doit se
 * recalculer à chaque exercice AU FUR ET À MESURE de la session, pas
 * seulement une fois au chargement — donc pas quelque chose qu'une seule
 * requête SQL peut exprimer). Cette fonction ne fait que fournir le pool
 * de candidats, mélangé (pas d'ordre par vidéo). */
export async function getDueListeningCardsSplit(
  db: LexisDb,
  now: Date,
  settings: { listeningNewSegmentsPerDay: number; listeningReviewCapPerDay: number }
): Promise<DueListeningCardRow[]> {
  const reviewRows = await db.getAllAsync<ListeningCardWithSegmentRow>(
    `${LISTENING_CARD_SEGMENT_SELECT}
     WHERE c.due_date <= ? AND c.lifecycle != 'new'
     ORDER BY c.due_date ASC
     LIMIT ?;`,
    now.toISOString(),
    settings.listeningReviewCapPerDay
  );

  const newRows = await db.getAllAsync<ListeningCardWithSegmentRow>(
    `${LISTENING_CARD_SEGMENT_SELECT}
     WHERE c.due_date <= ? AND c.lifecycle = 'new'
     ORDER BY RANDOM()
     LIMIT ?;`,
    now.toISOString(),
    settings.listeningNewSegmentsPerDay
  );

  return shuffle([...reviewRows, ...newRows]).map(mapListeningCardRow);
}

/** Derniers `video_id` distincts révisés, du plus récent au plus ancien —
 * c'est le `recentVideoIdsOrdered` attendu par
 * `selection.ts#selectEligibleVideoIds`. Calculé depuis l'historique
 * PERSISTÉ (`listening_reviews`), utilisé pour amorcer le cooldown au
 * DÉBUT d'une session ; pendant la session elle-même, l'écran doit
 * continuer à faire évoluer sa propre copie en mémoire au fur et à mesure
 * (voir plus haut), sans rappeler cette fonction à chaque exercice. */
export async function getRecentListeningVideoIds(db: LexisDb, limit: number): Promise<string[]> {
  const rows = await db.getAllAsync<{ video_id: string }>(
    `SELECT c.video_id as video_id, MAX(r.reviewed_at) as last_at
     FROM listening_reviews r
     JOIN listening_cards c ON c.id = r.card_id
     GROUP BY c.video_id
     ORDER BY last_at DESC
     LIMIT ?;`,
    limit
  );
  return rows.map((r) => r.video_id);
}

export async function updateListeningCard(db: LexisDb, cardId: string, card: SM2CardState): Promise<void> {
  await db.runAsync(
    `UPDATE listening_cards
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

export async function logListeningReview(
  db: LexisDb,
  cardId: string,
  grade: SM2Grade,
  at: Date = new Date()
): Promise<void> {
  await db.runAsync(
    'INSERT INTO listening_reviews (card_id, grade, reviewed_at) VALUES (?, ?, ?);',
    cardId,
    grade,
    at.toISOString()
  );
}

export interface ListeningCounts {
  total: number;
  learned: number;
}

/** Même définition d'"acquis" que `getWordCounts`/`getConjugationCounts` —
 * a été vu au moins une fois au-delà de l'état `new`. */
export async function getListeningCounts(db: LexisDb): Promise<ListeningCounts> {
  const total = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM listening_cards;');
  const learned = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM listening_cards WHERE lifecycle != 'new';"
  );
  return { total: total?.count ?? 0, learned: learned?.count ?? 0 };
}

export interface ListeningHistoryRow {
  id: number;
  videoId: string;
  videoTitle: string;
  transcript: string;
  grade: SM2Grade;
  reviewedAt: Date;
}

/** Historique de révisions de compréhension orale, le plus récent
 * d'abord — même principe que `getReviewHistory`/`getConjugationHistory`. */
export async function getListeningHistory(db: LexisDb, limit = 200): Promise<ListeningHistoryRow[]> {
  type Row = { id: number; video_id: string; title: string; transcript: string; grade: string; reviewed_at: string };
  const rows = await db.getAllAsync<Row>(
    `SELECT r.id, s.video_id, v.title, s.transcript, r.grade, r.reviewed_at
     FROM listening_reviews r
     JOIN listening_segments s ON s.id = r.card_id
     JOIN listening_videos v ON v.id = s.video_id
     ORDER BY r.reviewed_at DESC
     LIMIT ?;`,
    limit
  );
  return rows.map((r) => ({
    id: r.id,
    videoId: r.video_id,
    videoTitle: r.title,
    transcript: r.transcript,
    grade: parseGrade(r.grade),
    reviewedAt: new Date(r.reviewed_at),
  }));
}
