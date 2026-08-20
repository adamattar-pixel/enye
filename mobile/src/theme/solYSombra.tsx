import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getSettings, saveSettings, type AppSettings } from '../data/settings';

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

type ThemeContextValue = {
  theme: SolYSombraPalette;
  isDark: boolean;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Fournit la palette à toute l'app + le bouton bascule clair/sombre en
 * haut à droite (voir `useThemeToggle`). Ajouté à la demande explicite
 * ("rajoute en haut à droite un mode sombre qui inverse les couleurs de
 * l'appli") — avant ça, `useTheme()` suivait uniquement le réglage
 * système (`useColorScheme()`), sans bascule manuelle possible depuis
 * l'app. Le choix est persisté dans `settings.themeOverride` (même table
 * que le reste des réglages) pour survivre à la fermeture de l'app.
 *
 * Doit englober tout arbre qui appelle `useTheme()` — posé une fois
 * autour de `<RootTabs>` dans `App.tsx`, après l'ouverture de la base
 * (a besoin de `db` pour lire/écrire le réglage persisté).
 */
export function ThemeProvider({ db, children }: { db: SQLiteDatabase; children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [override, setOverride] = useState<AppSettings['themeOverride']>('system');

  useEffect(() => {
    (async () => {
      const settings = await getSettings(db);
      setOverride(settings.themeOverride);
    })();
  }, [db]);

  const isDark = override === 'system' ? systemScheme === 'dark' : override === 'dark';
  const theme = isDark ? solYSombraDark : solYSombraLight;

  const toggleTheme = useCallback(() => {
    const next: AppSettings['themeOverride'] = isDark ? 'light' : 'dark';
    setOverride(next);
    (async () => {
      const settings = await getSettings(db);
      await saveSettings(db, { ...settings, themeOverride: next });
    })();
  }, [db, isDark]);

  const value = useMemo(() => ({ theme, isDark, toggleTheme }), [theme, isDark, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Palette courante (claire, sombre, ou système selon `themeOverride`).
 * Doit être appelé sous un `<ThemeProvider>` (posé dans `App.tsx`). */
export function useTheme(): SolYSombraPalette {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme() doit être appelé sous <ThemeProvider>.');
  return ctx.theme;
}

/** Bouton bascule clair/sombre (voir `ThemeProvider`) : `isDark` pour
 * choisir l'icône, `toggleTheme` pour inverser. */
export function useThemeToggle(): { isDark: boolean; toggleTheme: () => void } {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeToggle() doit être appelé sous <ThemeProvider>.');
  return { isDark: ctx.isDark, toggleTheme: ctx.toggleTheme };
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
