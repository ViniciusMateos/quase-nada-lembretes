import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios'
import type {
  AuthResponse,
  MessageResponse,
  Reminder,
  ReminderListResponse,
  SyncResponse,
  Task,
} from '../types'

// baseURL vazio = chamadas relativas (/api/...) que o proxy do Vite repassa pro
// backend. Token guardado no localStorage (painel local, single-user).
const TOKEN_KEY = 'qn_access_token'
const REFRESH_KEY = 'qn_refresh_token'

export const tokenStore = {
  get access() {
    return localStorage.getItem(TOKEN_KEY)
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY)
  },
  set(access: string, refresh: string) {
    localStorage.setItem(TOKEN_KEY, access)
    localStorage.setItem(REFRESH_KEY, refresh)
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}

let onLogout: (() => void) | null = null
export function registerLogout(fn: () => void) {
  onLogout = fn
}

export const api: AxiosInstance = axios.create({
  baseURL: '',
  timeout: 95000, // o chat (IA) pode demorar no pico do Gemini; o app espera 90s
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
})

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const t = tokenStore.access
  if (t) config.headers.Authorization = `Bearer ${t}`
  return config
})

// Refresh silencioso em 401, com fila pra requests concorrentes.
let refreshing = false
let queue: { resolve: (t: string) => void; reject: (e: unknown) => void }[] = []
const flush = (err: unknown, token: string | null) => {
  queue.forEach((p) => (err ? p.reject(err) : p.resolve(token as string)))
  queue = []
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined
    const url = original?.url || ''
    const isAuthRoute =
      url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/refresh')

    if (error.response?.status === 401 && original && !isAuthRoute && !original._retry) {
      const refresh = tokenStore.refresh
      if (!refresh) {
        onLogout?.()
        return Promise.reject(error)
      }
      if (refreshing) {
        return new Promise((resolve, reject) => queue.push({ resolve, reject })).then((token) => {
          original.headers.Authorization = `Bearer ${token}`
          return api(original)
        })
      }
      original._retry = true
      refreshing = true
      try {
        const { data } = await axios.post('/api/v1/auth/refresh', { refresh_token: refresh })
        tokenStore.set(data.access_token, data.refresh_token)
        flush(null, data.access_token)
        original.headers.Authorization = `Bearer ${data.access_token}`
        return api(original)
      } catch (e) {
        flush(e, null)
        onLogout?.()
        return Promise.reject(e)
      } finally {
        refreshing = false
      }
    }
    return Promise.reject(error)
  },
)

// Extrai {detail, code} do erro do backend pra mensagens amigáveis.
export function errorMessage(e: unknown, fallback = 'Algo deu errado.'): string {
  const ax = e as AxiosError<{ detail?: string }>
  return ax?.response?.data?.detail || ax?.message || fallback
}

// ───────────────────────── endpoints ─────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    api.post<AuthResponse>('/api/v1/auth/login', { email, password }).then((r) => r.data),
  register: (name: string, email: string, password: string) =>
    api.post<AuthResponse>('/api/v1/auth/register', { name, email, password }).then((r) => r.data),
  changePassword: (current_password: string, new_password: string) =>
    api.put('/api/v1/auth/password', { current_password, new_password }).then((r) => r.data),
}

export const remindersApi = {
  list: (activeOnly = true) =>
    api
      .get<ReminderListResponse>('/api/v1/reminders', {
        params: { active_only: activeOnly, limit: 500, offset: 0 },
      })
      .then((r) => r.data),
  sync: () => api.get<SyncResponse>('/api/v1/reminders/sync').then((r) => r.data),
  create: (data: Partial<Reminder> & { scheduled_time: string }) =>
    api.post<Reminder>('/api/v1/reminders', data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch<Reminder>(`/api/v1/reminders/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/api/v1/reminders/${id}`).then((r) => r.data),
}

export const tasksApi = {
  list: (week: string) =>
    api.get<{ tasks: Task[] }>('/api/v1/tasks', { params: { week } }).then((r) => r.data.tasks),
  create: (data: { name: string; priority?: string; notes?: string; week_key: string }) =>
    api.post<Task>('/api/v1/tasks', data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch<Task>(`/api/v1/tasks/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/api/v1/tasks/${id}`).then((r) => r.data),
}

export const chatApi = {
  send: (content: string, sessionId: string) =>
    api
      .post<MessageResponse>('/api/v1/messages', {
        content,
        client_timestamp: new Date().toISOString(),
        hour_format: '24h',
        session_id: sessionId,
        client_message_id: crypto.randomUUID(),
        lang: 'pt',
      })
      .then((r) => r.data),
}
