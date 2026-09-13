export interface AlertButtonSpec {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void | Promise<void>;
}

/**
 * Remplace `Alert.alert` (`react-native`) partout dans l'app desktop —
 * **bug réel confirmé le 13/09/2026** (capture d'écran réelle +
 * `sendInputEvent` sur un vrai processus Electron, pas une supposition) :
 * l'implémentation `react-native-web` d'`Alert` (utilisée par la cible
 * desktop, Decision 016 — plus aucune cible iOS/Expo Go en parallèle) est
 * un no-op total :
 *
 * ```
 * class Alert { static alert() {} }
 * ```
 *
 * (`node_modules/react-native-web/src/exports/Alert/index.js`). Chaque
 * appel — confirmations de suppression (vidéo/mot/livre), réinitialisation
 * de la progression, messages de validation — ne faisait donc
 * STRICTEMENT rien au clic sur cette cible, sans la moindre erreur
 * visible ni avertissement dans la console : signalé comme "je ne peux
 * pas cliquer sur la croix pour supprimer mes vidéos", mais touchait en
 * réalité `Alert.alert` partout où il était appelé dans l'app.
 *
 * `window.alert`/`window.confirm` (natifs du moteur Chromium d'Electron)
 * remplacent la boîte de dialogue plutôt qu'un composant `Modal` maison :
 * garantis fonctionner sans configuration, alors qu'un composant réutiliserait
 * les mêmes briques (`Pressable`, `hitSlop`...) qui viennent de causer ce
 * genre de bug d'interaction ailleurs dans cette session (voir
 * `ListeningScreen.tsx`, chevauchement de zones tactiles). Pas de rendu
 * fidèle au thème "Sol y sombra" avec cette approche — accepté comme
 * compromis pour la fiabilité, à revoir si demandé explicitement.
 */
export function showAlert(title: string, message?: string, buttons?: AlertButtonSpec[]): void {
  const fullText = message ? `${title}\n\n${message}` : title;

  if (!buttons || buttons.length === 0) {
    window.alert(fullText);
    return;
  }

  if (buttons.length === 1) {
    window.alert(fullText);
    buttons[0].onPress?.();
    return;
  }

  // `window.confirm` ne modélise qu'un choix binaire OK/Annuler — largement
  // suffisant ici, chaque appel de cette app n'utilise jamais plus de deux
  // boutons (une confirmation "Annuler" + une action).
  const confirmed = window.confirm(fullText);
  const cancelButton = buttons.find((b) => b.style === 'cancel');
  const actionButton = buttons.find((b) => b.style !== 'cancel') ?? buttons[buttons.length - 1];
  if (confirmed) {
    actionButton.onPress?.();
  } else {
    cancelButton?.onPress?.();
  }
}
