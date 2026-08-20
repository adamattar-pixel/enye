import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, FlatList, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { NotificationResponse } from 'expo-notifications';
import { SQLiteProvider, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { DB_NAME, getAllLogs, logAction, clearLogs, migrateDbIfNeeded, type LogRow } from './src/db';
import {
  ensurePermissions,
  registerCategories,
  scheduleReviewNotification,
  scheduleGradeNotification,
  REVEAL_ACTION,
} from './src/notifications';
import { ReviewScreenContainer } from './src/screens/ReviewScreenContainer';

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
  const [view, setView] = useState<'review' | 'diagnostic'>('review');

  const refreshLogs = useCallback(async () => {
    setLogs(await getAllLogs(db));
  }, [db]);

  // Deux chemins, pas un seul — c'était le bug de la première version :
  // 1) `getLastNotificationResponseAsync()` au montage : couvre le cas où
  //    l'app était totalement tuée et vient d'être relancée par le tap.
  // 2) `addNotificationResponseReceivedListener` : couvre le cas où l'app
  //    tournait déjà (arrière-plan ou premier plan) — son JS ne redémarre
  //    pas, donc le check du (1) ne se redéclenche jamais tout seul sans
  //    cet écouteur en direct.
  useEffect(() => {
    (async () => {
      const response = await Notifications.getLastNotificationResponseAsync();
      if (response) await processResponse(db, response, 'startup');
      await refreshLogs();

      const granted = await ensurePermissions();
      setPermissionGranted(granted);
      await registerCategories();
    })();

    const subscription = Notifications.addNotificationResponseReceivedListener(async (response) => {
      await processResponse(db, response, 'listener');
      await refreshLogs();
    });
    return () => subscription.remove();
  }, [db, refreshLogs]);

  // Rafraîchit aussi quand l'app revient au premier plan (utile pour voir
  // les entrées journalisées par l'écouteur en direct sans taper "Rafraîchir").
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshLogs();
    });
    return () => sub.remove();
  }, [refreshLogs]);

  const handleScheduleTest = async () => {
    if (permissionGranted === false) {
      Alert.alert('Permission refusée', "Autorise les notifications dans Réglages > Lexis prototype > Notifications, puis relance l'app.");
      return;
    }
    const id = await scheduleReviewNotification(30);
    Alert.alert('Programmée', `Notification "gato" dans 30 secondes (id ${id.slice(0, 8)}…).\n\nFerme complètement l'app maintenant (swipe vers le haut dans le multitâche), attends la notification, appuie sur "Ver traducción" SANS ouvrir l'app.`);
  };

  if (view === 'review') {
    return (
      <View style={{ flex: 1 }}>
        <ReviewScreenContainer />
        <TouchableOpacity style={styles.diagnosticToggle} onPress={() => setView('diagnostic')}>
          <Text style={styles.diagnosticToggleText}>Diagnostic notifications (tâche 0)</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity onPress={() => setView('review')}>
        <Text style={styles.backLink}>‹ Retour à l'écran de révision</Text>
      </TouchableOpacity>
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

async function processResponse(
  db: SQLiteDatabase,
  response: NotificationResponse,
  source: 'startup' | 'listener'
): Promise<void> {
  const requestId = response.notification.request.identifier;
  const actionIdentifier = response.actionIdentifier;

  // `source` fait partie de la clé de dédoublonnage : si les DEUX chemins
  // captent le même tap (arrive quand l'app était déjà ouverte lors du
  // tap), on veut voir les deux lignes dans le journal pour le diagnostic,
  // pas que l'un écrase silencieusement l'autre.
  const isNew = await logAction(db, `${requestId}:${source}`, `${source}:${actionIdentifier}`);
  if (!isNew) return;

  if (actionIdentifier === REVEAL_ACTION) {
    try {
      await scheduleGradeNotification(5);
      await logAction(db, `${requestId}:${source}-followup-ok`, `${source}:followup_scheduled_ok`);
    } catch (error) {
      await logAction(db, `${requestId}:${source}-followup-fail`, `${source}:followup_scheduled_fail:${String(error)}`);
    }
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAEEDA', paddingHorizontal: 20, paddingTop: 12 },
  backLink: { color: '#993C1D', fontWeight: '600', marginBottom: 8 },
  diagnosticToggle: { alignItems: 'center', paddingVertical: 14 },
  diagnosticToggleText: { color: '#9C8778', fontSize: 12, textDecorationLine: 'underline' },
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
