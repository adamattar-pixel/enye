import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { LexisDb } from '../data/dbTypes';
import { getAllTags, getDueCardsSplit, resetProgress } from '../data/database';
import { getSettings, saveSettings, type AppSettings } from '../data/settings';
import { CONJUGATION_TENSES, TENSE_LABELS, type ConjugationTense } from '../conjugation/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FadeInView } from '../components/FadeInView';
import { ScreenContainer } from '../components/ScreenContainer';
import { CreditsScreen } from './CreditsScreen';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';

type Props = { db: LexisDb };
type SubView = 'settings' | 'reminder';
type Styles = ReturnType<typeof createStyles>;

// Même liste que `DecksScreen.tsx` (filtre par niveau) — pas partagée
// via un module commun, ce projet ne mutualise pas les petites
// constantes entre écrans (voir docs/CONVENTIONS.md). "B2" n'a en
// pratique aucun mot (l'heuristique de génération n'en produit jamais,
// voir docs/AUDIT.md) — le désactiver n'a donc aucun effet visible tant
// que ça reste le cas, gardé quand même dans la liste pour rester
// cohérent avec le filtre de Decks & mots.
const VOCAB_LEVELS = ['A1', 'A2', 'B1', 'B2'];

/** Réglages et rappel de cartes dues — regroupés dans un onglet à part
 * (sous-onglets internes), séparé de « Decks & mots » qui ne garde que
 * la liste de mots. L'historique des révisions, qui vivait ici aussi,
 * a été déplacé dans l'onglet Statistiques le 20/08/2026 (demandé
 * explicitement — voir StatsScreen.tsx) : les deux parlent de ce qui
 * s'est passé pendant les révisions, pas de configuration de l'app.
 *
 * Le sous-onglet "Notifications" (heure de la prochaine notification OS
 * programmée) a été remplacé par "Rappel" (nombre de cartes dues, lu
 * directement en base) lors du passage à la cible desktop — plus de
 * notifications programmées à l'avance sur ce format, remplacées par un
 * contrôle affiché à l'ouverture de l'app (voir docs/DECISIONS.md
 * Decision 016 ; l'onglet Aujourd'hui, premier onglet ouvert, affiche
 * déjà ce même nombre — ce sous-onglet reste pour qui veut le consulter
 * depuis Réglages sans repasser par Aujourd'hui). */
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
          <SubTabButton styles={styles} label="Rappel" active={subView === 'reminder'} onPress={() => setSubView('reminder')} />
        </View>
      </View>

      {subView === 'settings' && <SettingsView db={db} styles={styles} />}
      {subView === 'reminder' && <ReminderView db={db} styles={styles} />}
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

function SettingsView({ db, styles }: { db: LexisDb; styles: Styles }) {
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

  const toggleLevel = (level: string) => {
    const disabled = settings.disabledLevels.includes(level)
      ? settings.disabledLevels.filter((l) => l !== level)
      : [...settings.disabledLevels, level];
    update({ disabledLevels: disabled });
  };

  const toggleTense = (tense: ConjugationTense) => {
    const disabled = settings.disabledTenses.includes(tense)
      ? settings.disabledTenses.filter((t) => t !== tense)
      : [...settings.disabledTenses, tense];
    update({ disabledTenses: disabled });
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

      <Text style={styles.fieldLabel}>Niveaux actifs en vocabulaire</Text>
      <Text style={styles.fieldHint}>
        Un niveau désactivé n'apparaît plus du tout, y compris pour les mots déjà en cours d'apprentissage.
      </Text>
      <View style={styles.tagToggleWrap}>
        {VOCAB_LEVELS.map((level) => {
          const enabled = !settings.disabledLevels.includes(level);
          return (
            <AnimatedPressable
              key={level}
              style={[styles.chip, enabled && styles.chipActive]}
              haptic="none"
              scaleTo={0.92}
              onPress={() => toggleLevel(level)}
            >
              <Text style={[styles.chipText, enabled && styles.chipTextActive]}>{level}</Text>
            </AnimatedPressable>
          );
        })}
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

      <Text style={styles.fieldLabel}>Temps actifs en conjugaison</Text>
      <Text style={styles.fieldHint}>
        Un temps désactivé n'apparaît plus du tout, y compris pour les cartes déjà en cours d'apprentissage.
      </Text>
      <View style={styles.tagToggleWrap}>
        {CONJUGATION_TENSES.map((tense) => {
          const enabled = !settings.disabledTenses.includes(tense);
          return (
            <AnimatedPressable
              key={tense}
              style={[styles.chip, enabled && styles.chipActive]}
              haptic="none"
              scaleTo={0.92}
              onPress={() => toggleTense(tense)}
            >
              <Text style={[styles.chipText, enabled && styles.chipTextActive]}>{TENSE_LABELS[tense]}</Text>
            </AnimatedPressable>
          );
        })}
      </View>

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

// MARK: - Rappel de cartes dues

/** Remplace l'ancien "prochaine notification" (heure d'une notification OS
 * programmée à l'avance) — sur desktop, il n'y a plus de notification
 * programmée du tout, le rappel est un contrôle direct du nombre de
 * cartes dues, à consulter à l'ouverture de l'app (voir docs/DECISIONS.md
 * Decision 016). Réutilise `getDueCardsSplit`, la même requête que
 * l'onglet Aujourd'hui — pas de nouvelle logique de calcul. */
function ReminderView({ db, styles }: { db: LexisDb; styles: Styles }) {
  const [state, setState] = useState<'loading' | 'none' | 'found'>('loading');
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    setState('loading');
    const settings = await getSettings(db);
    const due = await getDueCardsSplit(db, new Date(), settings);
    setCount(due.length);
    setState(due.length > 0 ? 'found' : 'none');
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
            <Text style={styles.notificationBig}>Rien à réviser</Text>
            <Text style={styles.notificationCaption}>Pas de carte due pour l'instant.</Text>
          </>
        )}

        {state === 'found' && (
          <>
            <Text style={styles.notificationBig}>
              {count} carte{count !== 1 ? 's' : ''} due{count !== 1 ? 's' : ''}
            </Text>
            <Text style={styles.notificationCaption}>À réviser dès que tu ouvres l'app.</Text>
          </>
        )}
      </FadeInView>

      <Text style={styles.notificationHint}>
        Compte lu directement en base, pas une estimation — se met à jour à chaque ouverture de cet onglet.
      </Text>

      <AnimatedPressable style={[styles.button, styles.buttonOutline]} haptic="selection" onPress={refresh}>
        <Text style={styles.buttonOutlineText}>Actualiser</Text>
      </AnimatedPressable>
    </ScrollView>
  );
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

    // `minHeight`/`justifyContent`/`alignItems` explicites — sans ça, ces
    // puces se sont déjà révélées aplaties sous react-native-web (Decks &
    // mots, corrigé le 06/09/2026 : le padding seul ne borne pas la
    // hauteur aussi fiablement que sous Expo Go).
    chip: {
      minHeight: 32,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: 16,
      backgroundColor: t.translationBackground,
    },
    chipActive: { backgroundColor: t.buttonFilled },
    chipText: { fontSize: 12, color: t.wordText, fontWeight: '600' },
    chipTextActive: { color: t.buttonFilledText },

    field: { marginBottom: 14 },
    fieldLabel: { fontSize: 12, color: t.metaText, marginBottom: 6 },
    fieldHint: { fontSize: 12, color: t.metaText, marginBottom: 10, lineHeight: 17 },
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
