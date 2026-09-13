import { showAlert } from './alert';

describe('showAlert', () => {
  // `jest.spyOn(window, 'alert')` échoue ici ("Property `alert` does not
  // exist") : l'environnement de test `jest-expo` (préset Node, pas un
  // vrai DOM) n'a pas de `window.alert`/`window.confirm` du tout —
  // contrairement au runtime réel (processus renderer Electron, un vrai
  // Chromium où ces deux fonctions existent nativement). Simples
  // affectations directes plutôt qu'un `spyOn` sur une propriété absente.
  let alertMock: jest.Mock;
  let confirmMock: jest.Mock;

  beforeEach(() => {
    alertMock = jest.fn();
    confirmMock = jest.fn(() => true);
    (window as unknown as { alert: jest.Mock }).alert = alertMock;
    (window as unknown as { confirm: jest.Mock }).confirm = confirmMock;
  });

  test('no buttons: shows window.alert with title and message', () => {
    showAlert('Titre', 'Message');
    expect(alertMock).toHaveBeenCalledWith('Titre\n\nMessage');
    expect(confirmMock).not.toHaveBeenCalled();
  });

  test('no message: shows only the title', () => {
    showAlert('Titre seul');
    expect(alertMock).toHaveBeenCalledWith('Titre seul');
  });

  test('a single button: shows window.alert then calls its onPress', () => {
    const onPress = jest.fn();
    showAlert('Titre', 'Message', [{ text: 'OK', onPress }]);
    expect(alertMock).toHaveBeenCalledWith('Titre\n\nMessage');
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('two buttons, confirmed: calls the non-cancel button, not the cancel one', () => {
    confirmMock.mockReturnValue(true);
    const onCancel = jest.fn();
    const onDelete = jest.fn();
    showAlert('Supprimer ?', 'Ce mot', [
      { text: 'Annuler', style: 'cancel', onPress: onCancel },
      { text: 'Supprimer', style: 'destructive', onPress: onDelete },
    ]);
    expect(confirmMock).toHaveBeenCalledWith('Supprimer ?\n\nCe mot');
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  test('two buttons, cancelled: calls the cancel button, not the action one', () => {
    confirmMock.mockReturnValue(false);
    const onCancel = jest.fn();
    const onDelete = jest.fn();
    showAlert('Supprimer ?', 'Ce mot', [
      { text: 'Annuler', style: 'cancel', onPress: onCancel },
      { text: 'Supprimer', style: 'destructive', onPress: onDelete },
    ]);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
  });

  test('cancelled with no onPress on the cancel button: does not throw', () => {
    confirmMock.mockReturnValue(false);
    const onDelete = jest.fn();
    expect(() =>
      showAlert('Supprimer ?', 'Ce mot', [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', onPress: onDelete }])
    ).not.toThrow();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
