import axios from 'axios';
import { storage } from '../lib/storage';

export const navigationRef = { current: null };
// Fallback hardcoded: `process.env.API_BASE_URL` é inlined no bundle em BUILD time
// pela env do eas.json. Só que num `eas update` (OTA) rodado de um shell SEM essa
// env, o bundle sai com a URL `undefined` → o app não conecta com NADA (mas ainda
// baixa OTA, porque isso usa a updates.url do app.config). O `||` garante a URL
// sempre presente no bundle, independente da env. Mesmo valor do eas.json.
const API_BASE_URL = process.env.API_BASE_URL || 'http://147.15.7.119:8000';

let logoutCallback = null;
export function registerLogout(fn) {
  logoutCallback = fn;
}

let updateTokensCallback = null;
export function registerUpdateTokens(fn) {
  updateTokensCallback = fn;
}

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Injeta access token em cada request
apiClient.interceptors.request.use(
  config => {
    const token = storage.getString('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => Promise.reject(error),
);

// Controle de refresh concorrente — requests que chegam enquanto já está refreshando ficam na fila
let isRefreshing = false;
let refreshQueue = [];

function processQueue(error, token = null) {
  refreshQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  refreshQueue = [];
}

// Interceptor de RESPONSE — em 401, tenta refresh silencioso antes de deslogar
apiClient.interceptors.response.use(
  response => response,
  async error => {
    const originalConfig = error.config;
    const requestUrl = originalConfig?.url || '';

    const isAuthRoute =
      requestUrl.includes('/auth/login') ||
      requestUrl.includes('/auth/register') ||
      requestUrl.includes('/auth/refresh');

    if (error.response?.status === 401 && !isAuthRoute && !originalConfig._retry) {
      const storedRefreshToken = storage.getString('refresh_token');

      if (!storedRefreshToken) {
        if (logoutCallback) logoutCallback();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Enfileira enquanto já está renovando
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        }).then(newToken => {
          originalConfig.headers.Authorization = `Bearer ${newToken}`;
          return apiClient(originalConfig);
        });
      }

      originalConfig._retry = true;
      isRefreshing = true;

      try {
        const response = await axios.post(
          `${API_BASE_URL}/api/v1/auth/refresh`,
          { refresh_token: storedRefreshToken },
          { headers: { 'Content-Type': 'application/json' } },
        );

        const { access_token, refresh_token } = response.data;

        storage.set('auth_token', access_token);
        storage.set('refresh_token', refresh_token);

        if (updateTokensCallback) {
          updateTokensCallback(access_token, refresh_token);
        }

        processQueue(null, access_token);

        originalConfig.headers.Authorization = `Bearer ${access_token}`;
        return apiClient(originalConfig);
      } catch (refreshError) {
        processQueue(refreshError, null);
        if (logoutCallback) logoutCallback();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default apiClient;
