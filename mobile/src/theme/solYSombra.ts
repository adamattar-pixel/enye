/**
 * Palette « Sol y sombra » — révision du 20/08/2026.
 *
 * Ces valeurs remplacent celles du cahier des charges d'origine (sable
 * #FAEEDA / ocre #BA7517 / etc.) : la spec fournie pour l'écran de
 * révision donne des couleurs plus précises et légèrement différentes.
 * On les prend comme référence à partir de maintenant.
 *
 * `label` et `meta` n'avaient pas de valeur hex précisée dans la spec
 * ("gris/marron discret", "gris moyen") — choisies ici de façon
 * cohérente avec le reste de la palette. `dot` avait deux valeurs
 * proposées (#D9534F ou #E8944A) ; on retient le rouge pour qu'il se
 * distingue de la bordure orange de la carte. Sujettes à correction.
 */
export const solYSombra = {
  cardBackground: '#FBF3E3',
  cardBorder: '#E8944A',
  ticketDash: '#E8944A',
  label: '#9C8778', // inféré, pas de hex donné dans la spec
  dot: '#D9534F', // choisi parmi les deux valeurs proposées (#D9534F ou #E8944A)
  wordText: '#4A2E1E',
  metaText: '#8A8078', // inféré, pas de hex donné dans la spec
  translationBackground: '#F5D9CE',
  translationText: '#4A2E1E',
  buttonOutline: '#E8944A',
  buttonFilled: '#8B3A3A', // deuxième valeur proposée dans la spec : #9C4444
  buttonFilledText: '#FFFFFF',
} as const;

export const partOfSpeechAbbreviation: Record<string, string> = {
  nom_masculin: 'n.m.',
  nom_féminin: 'n.f.',
  verbe: 'v.',
  adjectif: 'adj.',
  adverbe: 'adv.',
  pronom: 'pron.',
  préposition: 'prép.',
  conjonction: 'conj.',
  interjection: 'interj.',
};

export function formatMeta(partOfSpeech: string, gender: string | null, level: string): string {
  const key = gender ? `${partOfSpeech}_${gender}` : partOfSpeech;
  const abbrev = partOfSpeechAbbreviation[key] ?? partOfSpeechAbbreviation[partOfSpeech] ?? partOfSpeech;
  return `${abbrev} · ${level}`;
}
