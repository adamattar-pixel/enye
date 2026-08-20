import { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SQLite from 'expo-sqlite';
import { DB_NAME, migrateDbIfNeeded, seedIfEmpty } from './src/data/database';
import { parseWords } from './src/data/wordRepository';
import wordsJson from './src/data/words.json';
import { getSettings } from './src/data/settings';
import { ensurePermissions, registerCategories } from './src/notifications/categories';
import { handleNotificationResponse } from './src/notifications/responseHandler';
import { refillNotificationQueue } from './src/notifications/queue';
import { RootTabs } from './src/navigation/RootTabs';
import { useTheme } from './src/theme/solYSombra';

export default function App() {
  const theme = useTheme();
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);

  useEffect(() => {
    (async () => {
      const database = await SQLite.openDatabaseAsync(DB_NAME);
      await migrateDbIfNeeded(database);
      await seedIfEmpty(database, parseWords(wordsJson));

      // Permission + catégories en parallèle, pas en séquence — aucune
      // des deux ne dépend du résultat de l'autre.
      await Promise.all([ensurePermissions(), registerCategories()]);

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
      <SafeAreaView style={[styles.loading, { backgroundColor: theme.cardBackground }]}>
        <ActivityIndicator color={theme.buttonFilled} />
      </SafeAreaView>
    );
  }

  return <RootTabs db={db} />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
