// Face ID / Touch ID via expo-local-authentication.
//
// require guardado: se rodar num build que ainda não tem o módulo nativo (ex.:
// um OTA caindo num app antigo antes do build com Face ID), não quebra — só
// reporta "indisponível" e o app segue no login por senha normal.
let LocalAuthentication = null;
try { LocalAuthentication = require('expo-local-authentication'); } catch (e) { LocalAuthentication = null; }

// Tem hardware de biometria E o usuário cadastrou (Face ID configurado no iOS)?
export async function biometriaDisponivel() {
  if (!LocalAuthentication) return false;
  try {
    const temHardware = await LocalAuthentication.hasHardwareAsync();
    const cadastrado = await LocalAuthentication.isEnrolledAsync();
    return !!(temHardware && cadastrado);
  } catch (e) {
    return false;
  }
}

// Pede o Face ID. Retorna true se autenticou. `disableDeviceFallback: false`
// deixa o iOS oferecer o código do aparelho se o Face ID falhar algumas vezes.
export async function autenticarBiometria(promptMessage) {
  if (!LocalAuthentication) return false;
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: promptMessage || 'Entrar com Face ID',
      cancelLabel: 'Cancelar',
      fallbackLabel: 'Usar senha',
      disableDeviceFallback: false,
    });
    return !!r.success;
  } catch (e) {
    return false;
  }
}
