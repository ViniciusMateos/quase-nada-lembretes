// Login por Face ID: guarda a senha da conta no Keychain (expo-secure-store,
// criptografado e isolado do app) e libera com a biometria. Assim, quando a
// sessão cai, dá pra logar de volta com o Face ID em vez de digitar a senha.
//
// - Flag global `faceid_login_enabled` (MMKV): liga/desliga a feature nos ajustes.
// - Flag `faceid_login_asked`: já perguntamos se quer ativar (evita re-perguntar).
// - Senha por conta: chave `faceid_pw_<email>` no Keychain.
//
// require guardado no secure-store: build antigo (sem o módulo) não quebra.
import { storage } from './storage';

let SecureStore = null;
try { SecureStore = require('expo-secure-store'); } catch (e) { SecureStore = null; }

const FLAG_ATIVO = 'faceid_login_enabled';
const FLAG_PERGUNTADO = 'faceid_login_asked';
// A chave do SecureStore só aceita [A-Za-z0-9._-] — o "@" do email é INVÁLIDO e
// fazia o setItemAsync dar erro (silencioso), então a senha nunca salvava. Troca
// tudo que não for permitido por "_".
const keyFor = (email) =>
  `faceid_pw_${String(email || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '_')}`;

export function secureStoreDisponivel() {
  return !!SecureStore;
}

export function faceLoginAtivado() {
  // Ligado por PADRÃO (quando nunca foi mexido): a ideia é usar o Face ID primeiro.
  // O toggle nos ajustes grava false explicitamente pra desligar.
  try {
    const v = storage.getBoolean(FLAG_ATIVO);
    return v === undefined ? true : v === true;
  } catch (e) {
    return false;
  }
}

export function setFaceLoginAtivado(v) {
  try { storage.set(FLAG_ATIVO, !!v); } catch (e) {}
}

export function faceLoginJaPerguntado() {
  try { return storage.getBoolean(FLAG_PERGUNTADO) === true; } catch (e) { return false; }
}

export function marcarFaceLoginPerguntado() {
  try { storage.set(FLAG_PERGUNTADO, true); } catch (e) {}
}

export async function salvarSenhaConta(email, password) {
  if (!SecureStore || !email || !password) return;
  try {
    await SecureStore.setItemAsync(keyFor(email), password, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch (e) {}
}

export async function lerSenhaConta(email) {
  if (!SecureStore || !email) return null;
  try {
    return await SecureStore.getItemAsync(keyFor(email));
  } catch (e) {
    return null;
  }
}

export async function apagarSenhaConta(email) {
  if (!SecureStore || !email) return;
  try { await SecureStore.deleteItemAsync(keyFor(email)); } catch (e) {}
}

// Apaga a senha guardada de várias contas (ex.: ao desligar a feature).
export async function apagarTodasSenhas(emails) {
  if (!Array.isArray(emails)) return;
  for (const email of emails) {
    await apagarSenhaConta(email);
  }
}

// Tem senha guardada pra essa conta? (pra decidir se oferece o Face ID no login)
export async function temSenhaConta(email) {
  const pw = await lerSenhaConta(email);
  return !!pw;
}
