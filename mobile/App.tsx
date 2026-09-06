import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, SafeAreaView, StyleSheet, useColorScheme } from 'react-native';
import type { LexisDb } from './src/data/dbTypes';
import { createIpcDb } from './src/data/ipcDb';
import { RootTabs } from './src/navigation/RootTabs';
import { ThemeProvider, solYSombraDark, solYSombraLight } from './src/theme/solYSombra';

/** La barre de scroll par défaut de Chromium (large, grise, carrée) n'a
 * aucun équivalent sur iOS/Expo Go — jamais un souci avant la cible
 * desktop. Injectée une seule fois au démarrage plutôt que par un
 * fichier CSS séparé (aucun template web personnalisé dans ce projet
 * jusqu'ici) : fine, discrète, sans piste ni flèches, cohérente avec le
 * reste de l'habillage plutôt que le chrome par défaut du navigateur.
 * `Platform.OS === 'web'` — inoffensif si jamais rejoué ailleurs (pas de
 * `document` sur natif). */
function installWebScrollbarStyle(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.getElementById('lexis-scrollbar-style')) return;

  const style = document.createElement('style');
  style.id = 'lexis-scrollbar-style';
  style.textContent = `
    * { scrollbar-width: thin; scrollbar-color: rgba(120,120,120,0.4) transparent; }
    *::-webkit-scrollbar { width: 8px; height: 8px; }
    *::-webkit-scrollbar-track { background: transparent; }
    *::-webkit-scrollbar-thumb { background-color: rgba(120,120,120,0.4); border-radius: 8px; }
    *::-webkit-scrollbar-thumb:hover { background-color: rgba(120,120,120,0.65); }
    *::-webkit-scrollbar-corner { background: transparent; }
  `;
  document.head.appendChild(style);
}

/**
 * Cible desktop (Electron, voir docs/DECISIONS.md Decision 016) — iOS/
 * Expo Go abandonné, `expo-sqlite`/`expo-notifications` retirés d'ici.
 * L'ouverture de la base ET l'import du contenu bundlé (mots, verbes,
 * expressions, textes) tournent maintenant dans le process principal
 * Electron AVANT même la création de la fenêtre (voir
 * `electron/main.ts#initDatabase`) — ce composant n'a donc plus besoin
 * d'attendre un import asynchrone au démarrage, seulement de se connecter
 * au pont IPC déjà prêt (`createIpcDb`). L'état de chargement reste geré
 * ici par prudence (le pont pourrait en théorie ne pas être encore monté
 * au tout premier rendu), pas parce qu'un vrai travail asynchrone reste
 * à faire.
 */
export default function App() {
  // `ThemeProvider` (bascule clair/sombre manuelle) a besoin de `db` pour
  // lire/écrire le réglage persisté — pas encore disponible pendant le
  // chargement initial, donc l'écran de chargement suit directement le
  // réglage système plutôt que `useTheme()`.
  const systemScheme = useColorScheme();
  const loadingTheme = systemScheme === 'dark' ? solYSombraDark : solYSombraLight;
  const [db, setDb] = useState<LexisDb | null>(null);

  useEffect(() => {
    installWebScrollbarStyle();
    setDb(createIpcDb());
  }, []);

  if (!db) {
    return (
      <SafeAreaView style={[styles.loading, { backgroundColor: loadingTheme.cardBackground }]}>
        <ActivityIndicator color={loadingTheme.buttonFilled} />
      </SafeAreaView>
    );
  }

  return (
    <ThemeProvider db={db}>
      <RootTabs db={db} />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
