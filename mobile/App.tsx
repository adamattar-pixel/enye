import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { SQLiteProvider, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { DB_NAME, getAllLogs, logAction, clearLogs, migrateDbIfNeeded, type LogRow } from './src/db';
import {
  ensurePermissions,
  registerCategories,
  scheduleReviewNotification,
  scheduleGradeNotification,
  REVEAL_ACTION,
} from './src/notifications';

export default function App() {
  return (
    <SQLiteProvider databaseName={DB_NAME} onInit={migrateDbIfNeeded}>
      <Content />
    </SQLiteProvider>
  );
}

function Content() {
  const db = useSQLiteContext();
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);

  const refreshLogs = useCallback(async () => {
    setLogs(await getAllLogs(db));
  }, [db]);

  // Tourne à CHAQUE lancement de l'app — y compris un lancement en
  // arrière-plan déclenché par un tap sur un bouton de notification
  // (opensAppToForeground: false). C'est le pattern recommandé par la
  // doc Expo (pas l'écouteur d'événements classique, qui ne se déclenche
  // que si du JS tourne déjà) : on relit la dernière réponse à chaque
  // démarrage plutôt que d'attendre un événement en direct.
  useEffect(() => {
    (async () => {
      await processLastNotificationResponseIfAny(db);
      await refreshLogs();

      const granted = await ensurePermissions();
      setPermissionGranted(granted);
      await registerCategories();
    })();
  }, [db, refreshLogs]);

  const handleScheduleTest = async () => {
    if (permissionGranted === false) {
      Alert.alert('Permission refusée', "Autorise les notifications dans Réglages > Lexis prototype > Notifications, puis relance l'app.");
      return;
    }
    const id = await scheduleReviewNotification(30);
    Alert.alert('Programmée', `Notification "gato" dans 30 secondes (id ${id.slice(0, 8)}…).\n\nFerme complètement l'app maintenant (swipe vers le haut dans le multitâche), attends la notification, appuie sur "Ver traducción" SANS ouvrir l'app.`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Lexis — prototype tâche 0</Text>
      <Text style={styles.subtitle}>
        Permission notifications : {permissionGranted === null ? '…' : permissionGranted ? 'accordée' : 'refusée'}
      </Text>

      <TouchableOpacity style={styles.button} onPress={handleScheduleTest}>
        <Text style={styles.buttonText}>Programmer le test (30s)</Text>
      </TouchableOpacity>

      <View style={styles.row}>
        <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={refreshLogs}>
          <Text style={styles.buttonText}>Rafraîchir</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary]}
          onPress={async () => {
            await clearLogs(db);
            await refreshLogs();
          }}
        >
          <Text style={styles.buttonText}>Vider les logs</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.logsTitle}>Journal ({logs.length})</Text>
      <FlatList
        data={logs}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View style={styles.logRow}>
            <Text style={styles.logAction}>{item.action}</Text>
            <Text style={styles.logDate}>{new Date(item.logged_at).toLocaleTimeString('fr-FR')}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Aucune entrée pour l'instant.</Text>}
      />
    </SafeAreaView>
  );
}

async function processLastNotificationResponseIfAny(db: SQLiteDatabase): Promise<void> {
  const response = await Notifications.getLastNotificationResponseAsync();
  if (!response) return;

  const requestId = response.notification.request.identifier;
  const actionIdentifier = response.actionIdentifier;

  const isNew = await logAction(db, requestId, actionIdentifier);
  if (!isNew) return; // déjà traité lors d'un lancement précédent

  if (actionIdentifier === REVEAL_ACTION) {
    try {
      await scheduleGradeNotification(5);
      await logAction(db, `${requestId}-followup-ok`, 'followup_scheduled_ok');
    } catch (error) {
      await logAction(db, `${requestId}-followup-fail`, `followup_scheduled_fail:${String(error)}`);
    }
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAEEDA', paddingHorizontal: 20, paddingTop: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#4A1B0C' },
  subtitle: { fontSize: 13, color: '#993C1D', marginTop: 4, marginBottom: 16 },
  button: { backgroundColor: '#993C1D', paddingVertical: 14, borderRadius: 24, alignItems: 'center', marginBottom: 10 },
  buttonSecondary: { flex: 1, marginHorizontal: 4 },
  buttonText: { color: '#FAEEDA', fontWeight: '600' },
  row: { flexDirection: 'row', marginBottom: 16 },
  logsTitle: { fontSize: 15, fontWeight: '600', color: '#4A1B0C', marginBottom: 8 },
  logRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F5C4B3',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 6,
  },
  logAction: { color: '#4A1B0C', fontWeight: '600' },
  logDate: { color: '#4A1B0C' },
  empty: { color: '#993C1D', fontStyle: 'italic' },
});
