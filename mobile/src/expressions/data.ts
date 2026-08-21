import expressionsJson from '../data/expressions.json';
import type { Expression } from './types';

/** Expressions importées une fois au chargement du module — même
 * principe que `conjugationVerbs` : le JSON est la seule source de
 * vérité pour le contenu, SQLite ne garde que la progression SM-2 (voir
 * `database.ts`, table `expression_cards`). */
export const expressions = expressionsJson as Expression[];

const expressionById = new Map(expressions.map((e) => [e.id, e]));

export function getExpression(id: string): Expression | undefined {
  return expressionById.get(id);
}
