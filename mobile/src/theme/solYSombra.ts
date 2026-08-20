import { useColorScheme } from 'react-native';

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
export interface SolYSombraPalette {
  cardBackground: string;
  cardBorder: string;
  ticketDash: string;
  label: string;
  dot: string;
  wordText: string;
  metaText: string;
  translationBackground: string;
  translationText: string;
  buttonOutline: string;
  buttonFilled: string;
  buttonFilledText: string;
}

export const solYSombraLight: SolYSombraPalette = {
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
};

/**
 * Déclinaison sombre — pas fournie dans la spec d'origine, construite en
 * gardant la même famille de teintes (terre cuite / ocre / bordeaux)
 * inversée en luminosité plutôt qu'un simple noir-et-blanc. **Non
 * validée visuellement** — à eyeballer sur device réel avant de la
 * considérer définitive (voir AUDIT.md).
 */
export const solYSombraDark: SolYSombraPalette = {
  cardBackground: '#241812',
  cardBorder: '#C97A3D',
  ticketDash: '#C97A3D',
  label: '#B39781',
  dot: '#E8694F',
  wordText: '#F5E6D3',
  metaText: '#A88F7D',
  translationBackground: '#3A2A20',
  translationText: '#F5E6D3',
  buttonOutline: '#D98A4D',
  buttonFilled: '#B25454',
  buttonFilledText: '#FFFFFF',
};

/** Palette par défaut (claire) — gardée pour les usages qui n'ont pas
 * encore besoin de bascule dynamique. Préférer `useTheme()` dans un
 * composant pour respecter le réglage système clair/sombre. */
export const solYSombra = solYSombraLight;

/** Bascule automatique selon le réglage système (`Apparence` iOS), pas
 * de réglage manuel dans l'app pour l'instant. */
export function useTheme(): SolYSombraPalette {
  const scheme = useColorScheme();
  return scheme === 'dark' ? solYSombraDark : solYSombraLight;
}

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
  // Ajoutés lors de la génération de vocabulaire depuis doozan/spanish_data
  // (20/08/2026) — catégories présentes dans la source mais absentes du
  // vocabulaire écrit à la main jusque-là.
  nombre: 'num.',
  déterminant: 'dét.',
  article: 'art.',
  contraction: 'contr.',
};

export function formatMeta(partOfSpeech: string, gender: string | null, level: string): string {
  const key = gender ? `${partOfSpeech}_${gender}` : partOfSpeech;
  const abbrev = partOfSpeechAbbreviation[key] ?? partOfSpeechAbbreviation[partOfSpeech] ?? partOfSpeech;
  return `${abbrev} · ${level}`;
}
