import { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, useColorScheme } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SQLite from 'expo-sqlite';
import { setAudioModeAsync } from 'expo-audio';
import { DB_NAME, migrateDbIfNeeded, importMissingWords, importMissingConjugationCards } from './src/data/database';
import { parseWords } from './src/data/wordRepository';
import wordsJson from './src/data/words.json';
import { conjugationVerbs } from './src/conjugation/data';
import { getSettings } from './src/data/settings';
import { ensurePermissions, registerCategories } from './src/notifications/categories';
import { handleNotificationResponse } from './src/notifications/responseHandler';
import { refillNotificationQueue } from './src/notifications/queue';
import { RootTabs } from './src/navigation/RootTabs';
import { ThemeProvider, solYSombraDark, solYSombraLight } from './src/theme/solYSombra';

export default function App() {
  // `ThemeProvider` (bascule clair/sombre manuelle) a besoin de `db` pour
  // lire/écrire le réglage persisté — pas encore disponible pendant le
  // chargement initial, donc l'écran de chargement suit directement le
  // réglage système plutôt que `useTheme()`.
  const systemScheme = useColorScheme();
  const loadingTheme = systemScheme === 'dark' ? solYSombraDark : solYSombraLight;
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);

  useEffect(() => {
    (async () => {
      const database = await SQLite.openDatabaseAsync(DB_NAME);
      await migrateDbIfNeeded(database);
      // Importe tout mot du bundle pas encore en base — premier
      // lancement (tout est importé) comme mises à jour ultérieures du
      // bundle (complète juste ce qui manque, voir database.ts). Même
      // principe pour les 10 400 triplets de conjugaison (200 verbes ×
      // 52 formes) — voir AUDIT.md pour le risque de premier lancement
      // plus lent avec ce volume combiné, pas mesuré sur device.
      await importMissingWords(database, parseWords(wordsJson));
      await importMissingConjugationCards(database, conjugationVerbs);

      // Bug documenté et de longue date d'expo-speech sur iOS : sans
      // activer explicitement le mode audio, la prononciation ne joue
      // parfois aucun son (silencieusement, sans erreur), y compris
      // sonnerie activée — https://github.com/expo/expo/issues/8235.
      // Permission + catégories en parallèle, pas en séquence — aucune
      // des trois ne dépend du résultat des autres.
      await Promise.all([setAudioModeAsync({ playsInSilentMode: true }), ensurePermissions(), registerCategories()]);

      // Deux chemins pour traiter les réponses aux notifications — pas
      // un seul (voir AUDIT.md, tâche 0) :
      // 1) `getLastNotificationResponseAsync()` au démarrage : couvre le
      //    cas où l'app était totalement tuée et vient d'être relancée
      //    par le tap.
      // 2) `addNotificationResponseReceivedListener` : couvre le cas où
      //    l'app tournait déjà (arrière-plan ou premier plan).
      const lastResponse = await Notifications.getLastNotificationResponseAsync();
      if (lastResponse) await handleNotificationResponse(database, lastResponse);

      // L'app est affichable dès ici — le rechargement de la file de
      // notifications ne doit pas retarder l'écran (c'était la cause
      // principale de lenteur au démarrage : jusqu'à 50 notifications
      // programmées une par une, en attente les unes des autres, avant
      // même que l'utilisateur voie quoi que ce soit).
      setDb(database);

      const settings = await getSettings(database);
      await refillNotificationQueue(database, settings);
    })();
  }, []);

  useEffect(() => {
    if (!db) return;
    const subscription = Notifications.addNotificationResponseReceivedListener(async (response) => {
      await handleNotificationResponse(db, response);
    });
    return () => subscription.remove();
  }, [db]);

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
