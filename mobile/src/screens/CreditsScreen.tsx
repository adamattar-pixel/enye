import { useMemo } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme, type SolYSombraPalette } from '../theme/solYSombra';

type Props = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Attribution requise par les licences CC-BY / CC-BY-SA des sources de
 * vocabulaire (voir mobile/scripts/generate-vocabulary/README.md pour
 * le détail complet). Ne pas retirer ou modifier sans vérifier les
 * conditions de chaque licence.
 */
export function CreditsScreen({ visible, onClose }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.label}>LEXIS</Text>
            <Text style={styles.title}>Crédits</Text>

            <Text style={styles.paragraph}>
              Une partie du vocabulaire de Lexis (mots, traductions, genres et phrases d'exemple) vient de{' '}
              <Text style={styles.bold}>doozan/spanish_data</Text>, un jeu de données sous licence CC BY 4.0 qui
              agrège lui-même trois sources, chacune sous sa propre licence :
            </Text>

            <Source
              styles={styles}
              name="hermitdave/FrequencyWords"
              detail="Classement de fréquence des mots espagnols."
              license="CC BY-SA 3.0"
              url="github.com/hermitdave/FrequencyWords"
            />
            <Source
              styles={styles}
              name="Wiktionary"
              detail="Dictionnaire espagnol → anglais, définitions et genres grammaticaux."
              license="CC BY-SA"
              url="wiktionary.org"
            />
            <Source
              styles={styles}
              name="Tatoeba"
              detail="Phrases d'exemple espagnol/anglais, contribuées par la communauté."
              license="CC BY 2.0 FR"
              url="tatoeba.org"
            />
            <Source
              styles={styles}
              name="doozan/spanish_data"
              detail="Agrégation et structuration des trois sources ci-dessus."
              license="CC BY 4.0"
              url="github.com/doozan/spanish_data"
            />

            <Text style={styles.paragraph}>
              Le moteur de révision espacée (SM-2) s'inspire de l'algorithme historique d'Anki. Aucune autre
              donnée tierce n'est utilisée : l'app fonctionne entièrement hors ligne, sans compte ni serveur.
            </Text>

            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>Fermer</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Source({
  styles,
  name,
  detail,
  license,
  url,
}: {
  styles: ReturnType<typeof createStyles>;
  name: string;
  detail: string;
  license: string;
  url: string;
}) {
  return (
    <View style={styles.sourceRow}>
      <Text style={styles.sourceName}>{name}</Text>
      <Text style={styles.sourceDetail}>{detail}</Text>
      <Text style={styles.sourceMeta}>
        {license} · {url}
      </Text>
    </View>
  );
}

function createStyles(t: SolYSombraPalette) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    card: {
      backgroundColor: t.cardBackground,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '85%',
    },
    content: { padding: 24, paddingBottom: 40 },
    label: { fontSize: 12, fontWeight: '600', letterSpacing: 2, color: t.label },
    title: { fontFamily: 'Georgia', fontSize: 24, fontWeight: '600', color: t.wordText, marginTop: 4, marginBottom: 16 },
    paragraph: { fontSize: 14, color: t.wordText, lineHeight: 20, marginBottom: 16 },
    bold: { fontWeight: '700' },
    sourceRow: {
      backgroundColor: t.translationBackground,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
    },
    sourceName: { fontSize: 15, fontWeight: '700', color: t.wordText },
    sourceDetail: { fontSize: 13, color: t.wordText, marginTop: 4 },
    sourceMeta: { fontSize: 11, color: t.metaText, marginTop: 6 },
    closeButton: {
      marginTop: 12,
      backgroundColor: t.buttonFilled,
      borderRadius: 24,
      paddingVertical: 14,
      alignItems: 'center',
    },
    closeButtonText: { color: t.buttonFilledText, fontWeight: '600' },
  });
}
