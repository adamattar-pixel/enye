import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getAllTags, resetProgress } from '../data/database';
import { getSettings, saveSettings, type AppSettings } from '../data/settings';
import { getNextNotificationTime } from '../notifications/queue';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FadeInView } from '../components/FadeInView';
import { ScreenContainer } from '../components/ScreenContainer';
import { CreditsScreen } from './CreditsScreen';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';

type Props = { db: SQLiteDatabase };
type SubView = 'settings' | 'notifications';
type Styles = ReturnType<typeof createStyles>;

/** Réglages et prochaine notification — regroupés dans un onglet à part
 * (sous-onglets internes), séparé de « Decks & mots » qui ne garde que
 * la liste de mots. L'historique des révisions, qui vivait ici aussi,
 * a été déplacé dans l'onglet Statistiques le 20/08/2026 (demandé
 * explicitement — voir StatsScreen.tsx) : les deux parlent de ce qui
 * s'est passé pendant les révisions, pas de configuration de l'app. */
export function SettingsScreen({ db }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [subView, setSubView] = useState<SubView>('settings');

  return (
    <ScreenContainer backgroundColor={theme.cardBackground} paddingHorizontal={22} paddingVertical={0}>
      <View style={styles.header}>
        <Text style={styles.label}>LEXIS</Text>
        <Text style={styles.title}>Réglages</Text>
        <View style={styles.subTabs}>
          <SubTabButton styles={styles} label="Réglages" active={subView === 'settings'} onPress={() => setSubView('settings')} />
          <SubTabButton styles={styles} label="Notifications" active={subView === 'notifications'} onPress={() => setSubView('notifications')} />
        </View>
      </View>

      {subView === 'settings' && <SettingsView db={db} styles={styles} />}
      {subView === 'notifications' && <NotificationsView db={db} styles={styles} theme={theme} />}
    </ScreenContainer>
  );
}

function SubTabButton({
  styles,
  label,
  active,
  onPress,
}: {
  styles: Styles;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable
      style={[styles.subTabButton, active && styles.subTabButtonActive]}
      haptic="none"
      scaleTo={0.94}
      onPress={onPress}
    >
      <Text style={[styles.subTabText, active && styles.subTabTextActive]}>{label}</Text>
    </AnimatedPressable>
  );
}

// MARK: - Réglages

function SettingsView({ db, styles }: { db: SQLiteDatabase; styles: Styles }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [creditsVisible, setCreditsVisible] = useState(false);

  useEffect(() => {
    (async () => {
      setSettings(await getSettings(db));
      setAllTags(await getAllTags(db));
    })();
  }, [db]);

  if (!settings) return null;

  const update = (patch: Partial<AppSettings>) => setSettings({ ...settings, ...patch });

  const toggleTag = (tag: string) => {
    const disabled = settings.disabledTags.includes(tag)
      ? settings.disabledTags.filter((t) => t !== tag)
      : [...settings.disabledTags, tag];
    update({ disabledTags: disabled });
  };

  const handleSave = async () => {
    if (settings.windowEndHour <= settings.windowStartHour) {
      Alert.alert('Plage horaire invalide', "L'heure de fin doit être après l'heure de début.");
      return;
    }
    await saveSettings(db, settings);
    Alert.alert('Enregistré', 'Les réglages ont été mis à jour.');
  };

  const handleResetProgress = () => {
    Alert.alert(
      'Réinitialiser ma progression ?',
      "Toutes les notes et l'historique seront effacés, et chaque mot, conjugaison, expression, segment d'écoute et texte de compréhension repartiront de zéro comme au premier lancement. Le contenu lui-même n'est pas supprimé. Cette action est irréversible.",
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Réinitialiser',
          style: 'destructive',
          onPress: async () => {
            await resetProgress(db);
            Alert.alert('Progression réinitialisée', 'Tout est de nouveau à réviser.');
          },
        },
      ]
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.settingsContent}>
      <NumberField
        styles={styles}
        label="Nouvelles cartes / jour"
        value={settings.newCardsPerDay}
        onChange={(v) => update({ newCardsPerDay: v })}
      />
      <NumberField
        styles={styles}
        label="Plafond de révisions / jour"
        value={settings.reviewCapPerDay}
        onChange={(v) => update({ reviewCapPerDay: v })}
      />
      <View style={styles.hourRow}>
        <NumberField styles={styles} label="Début (heure)" value={settings.windowStartHour} onChange={(v) => update({ windowStartHour: v })} compact />
        <NumberField styles={styles} label="Fin (heure)" value={settings.windowEndHour} onChange={(v) => update({ windowEndHour: v })} compact />
      </View>

      <Text style={styles.fieldLabel}>Conjugaison</Text>
      <NumberField
        styles={styles}
        label="Nouvelles conjugaisons / jour"
        value={settings.conjugationNewCardsPerDay}
        onChange={(v) => update({ conjugationNewCardsPerDay: v })}
      />
      <NumberField
        styles={styles}
        label="Plafond de révisions de conjugaison / jour"
        value={settings.conjugationReviewCapPerDay}
        onChange={(v) => update({ conjugationReviewCapPerDay: v })}
      />

      {allTags.length > 0 && (
        <>
          <Text style={styles.fieldLabel}>Thèmes actifs pour les nouvelles cartes</Text>
          <View style={styles.tagToggleWrap}>
            {allTags.map((tag) => {
              const enabled = !settings.disabledTags.includes(tag);
              return (
                <AnimatedPressable
                  key={tag}
                  style={[styles.chip, enabled && styles.chipActive]}
                  haptic="none"
                  scaleTo={0.92}
                  onPress={() => toggleTag(tag)}
                >
                  <Text style={[styles.chipText, enabled && styles.chipTextActive]}>{tag}</Text>
                </AnimatedPressable>
              );
            })}
          </View>
        </>
      )}

      <AnimatedPressable style={styles.button} haptic={Haptics.NotificationFeedbackType.Success} onPress={handleSave}>
        <Text style={styles.buttonText}>Enregistrer</Text>
      </AnimatedPressable>

      <TouchableOpacity style={styles.creditsLink} onPress={() => setCreditsVisible(true)}>
        <Text style={styles.creditsLinkText}>Crédits et sources du vocabulaire</Text>
      </TouchableOpacity>

      <View style={styles.dangerZone}>
        <Text style={styles.dangerZoneTitle}>Zone sensible</Text>
        <AnimatedPressable
          style={styles.dangerButton}
          haptic={Haptics.NotificationFeedbackType.Warning}
          onPress={handleResetProgress}
        >
          <Text style={styles.dangerButtonText}>Réinitialiser ma progression</Text>
        </AnimatedPressable>
      </View>

      <CreditsScreen visible={creditsVisible} onClose={() => setCreditsVisible(false)} />
    </ScrollView>
  );
}

function NumberField({
  styles,
  label,
  value,
  onChange,
  compact,
}: {
  styles: Styles;
  label: string;
  value: number;
  onChange: (v: number) => void;
  compact?: boolean;
}) {
  return (
    <View style={[styles.field, compact && { flex: 1, marginRight: 8 }]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        keyboardAppearance="dark"
        value={String(value)}
        onChangeText={(t) => {
          const n = parseInt(t, 10);
          if (!Number.isNaN(n)) onChange(n);
        }}
      />
    </View>
  );
}

// MARK: - Prochaine notification

/** Affiche quand la prochaine notification de révision arrivera —
 * demandé explicitement ("un onglet où quand je clique, il me dit quand
 * la prochaine notification aura lieu"). Lit l'heure exacte depuis le
 * miroir persisté par `refillNotificationQueue` (`getNextNotificationTime`,
 * voir queue.ts) plutôt que de la recalculer — corrigé le 20/08/2026
 * suite à un retour explicite ("l'heure n'est pas exacte") : la version
 * précédente rejouait le calcul de planification à chaque consultation,
 * et l'espacement aléatoire entre cartes (15-30 min) faisait diverger
 * l'estimation de l'heure réellement programmée. */
function NotificationsView({ db, styles, theme }: { db: SQLiteDatabase; styles: Styles; theme: SolYSombraPalette }) {
  const [state, setState] = useState<'loading' | 'none' | 'found'>('loading');
  const [nextTime, setNextTime] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setState('loading');
    const next = await getNextNotificationTime(db);
    setNextTime(next);
    setState(next ? 'found' : 'none');
  }, [db]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <ScrollView contentContainerStyle={styles.notificationsContent}>
      <FadeInView duration={300} style={styles.notificationCard}>
        {state === 'loading' && <Text style={styles.notificationBig}>…</Text>}

        {state === 'none' && (
          <>
            <Text style={styles.notificationBig}>Aucune pour l'instant</Text>
            <Text style={styles.notificationCaption}>Pas de carte due — rien à notifier tant que ça reste le cas.</Text>
          </>
        )}

        {state === 'found' && nextTime && (
          <>
            <Text style={styles.notificationBig}>{formatRelative(nextTime)}</Text>
            <Text style={styles.notificationCaption}>
              Vers {nextTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} le{' '}
              {nextTime.toLocaleDateString()}
            </Text>
          </>
        )}
      </FadeInView>

      <Text style={styles.notificationHint}>
        Heure exacte de la notification réellement programmée — se met à jour à chaque ouverture de l'app et après
        chaque révision.
      </Text>

      <AnimatedPressable style={[styles.button, styles.buttonOutline]} haptic="selection" onPress={refresh}>
        <Text style={styles.buttonOutlineText}>Actualiser</Text>
      </AnimatedPressable>
    </ScrollView>
  );
}

function formatRelative(date: Date): string {
  const diffMs = date.getTime() - Date.now();
  if (diffMs <= 0) return "D'un instant à l'autre";

  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "D'un instant à l'autre";
  if (minutes < 60) return `Dans environ ${minutes} min`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Dans environ ${hours} h`;

  const days = Math.round(hours / 24);
  return `Dans environ ${days} j`;
}

function createStyles(t: SolYSombraPalette) {
  return StyleSheet.create({
    header: { paddingTop: 20, paddingBottom: 8 },
    label: { fontSize: 12, fontWeight: '600', letterSpacing: 2, color: t.label },
    title: { fontFamily: 'Georgia', fontSize: 26, fontWeight: '600', color: t.wordText, marginTop: 4, marginBottom: 16 },
    subTabs: { flexDirection: 'row', gap: 8 },
    subTabButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: t.translationBackground },
    subTabButtonActive: { backgroundColor: t.buttonFilled },
    subTabText: { color: t.wordText, fontWeight: '600', fontSize: 13 },
    subTabTextActive: { color: t.buttonFilledText },

    chip: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16, backgroundColor: t.translationBackground },
    chipActive: { backgroundColor: t.buttonFilled },
    chipText: { fontSize: 12, color: t.wordText, fontWeight: '600' },
    chipTextActive: { color: t.buttonFilledText },

    field: { marginBottom: 14 },
    fieldLabel: { fontSize: 12, color: t.metaText, marginBottom: 6 },
    input: {
      borderWidth: 1,
      borderColor: t.cardBorder,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: t.wordText,
      backgroundColor: t.cardBackground,
    },

    settingsContent: { paddingTop: 8, paddingBottom: 60 },

    notificationsContent: { paddingTop: 8, paddingBottom: 60 },
    notificationCard: {
      backgroundColor: t.translationBackground,
      borderRadius: 16,
      paddingVertical: 32,
      paddingHorizontal: 20,
      alignItems: 'center',
      marginBottom: 16,
    },
    notificationBig: { fontFamily: 'Georgia', fontSize: 24, fontWeight: '600', color: t.wordText, textAlign: 'center' },
    notificationCaption: { fontSize: 13, color: t.metaText, marginTop: 8, textAlign: 'center' },
    notificationHint: { fontSize: 12, color: t.metaText, lineHeight: 17, marginBottom: 20 },
    creditsLink: { alignItems: 'center', paddingVertical: 16 },
    creditsLinkText: { color: t.label, fontSize: 12, textDecorationLine: 'underline' },

    dangerZone: {
      marginTop: 28,
      paddingTop: 20,
      borderTopWidth: 1,
      borderTopColor: t.translationBackground,
    },
    dangerZoneTitle: { fontSize: 12, fontWeight: '600', color: t.metaText, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
    dangerButton: {
      borderWidth: 1.5,
      borderColor: t.dot,
      borderRadius: 24,
      paddingVertical: 14,
      alignItems: 'center',
    },
    dangerButtonText: { color: t.dot, fontWeight: '700' },

    hourRow: { flexDirection: 'row' },
    tagToggleWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },

    button: { flex: 1, backgroundColor: t.buttonFilled, paddingVertical: 14, borderRadius: 24, alignItems: 'center' },
    buttonText: { color: t.buttonFilledText, fontWeight: '600' },
    buttonOutline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: t.buttonOutline },
    buttonOutlineText: { color: t.buttonOutline, fontWeight: '600' },
  });
}
