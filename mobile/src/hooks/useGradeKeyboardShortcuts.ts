import { useEffect } from 'react';
import { Platform } from 'react-native';
import type { SM2Grade } from '../sm2/types';

const KEY_TO_GRADE: Record<string, SM2Grade> = {
  '1': 'again',
  '2': 'hard',
  '3': 'good',
  '4': 'easy',
};

/**
 * Raccourcis clavier 1/2/3/4 → Otra vez/Difícil/Bien/Fácil, demandé
 * explicitement (06/09/2026) — naturel sur la cible desktop (souris +
 * clavier) là où ça n'aurait eu aucun sens sur mobile (Expo Go,
 * abandonné, voir Decision 016). Web/Electron uniquement : `window` et
 * les évènements clavier natifs n'existent pas côté React Native pur.
 *
 * `active` doit refléter le moment exact où les 4 boutons de notation
 * sont réellement affichés (ex. `revealed`/`submitted`/`corrected` selon
 * l'écran) — pas monté en permanence, pour qu'une touche 1-4 tapée avant
 * la réponse révélée (ex. en tapant une conjugaison) ne note rien par
 * erreur. `event.repeat` ignoré pour qu'une touche maintenue n'envoie
 * pas la même note en boucle.
 */
export function useGradeKeyboardShortcuts(active: boolean, onGrade: (grade: SM2Grade) => void): void {
  useEffect(() => {
    if (Platform.OS !== 'web' || !active) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const grade = KEY_TO_GRADE[event.key];
      if (!grade) return;
      event.preventDefault();
      onGrade(grade);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, onGrade]);
}
