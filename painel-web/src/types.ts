// Tipos espelhando os schemas do backend (ver mapa da API).

export interface User {
  id: string
  email: string
  name: string
  created_at: string
}

export interface AuthResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  user: User
}

export type Recurrence =
  | 'once'
  | 'daily'
  | 'weekly'
  | 'weekly_days'
  | 'monthly'
  | 'day_of_month'
  | 'interval_seconds'

export type PreReminder =
  | { type: 'offset'; seconds: number }
  | { type: 'day'; days: number; hour: number; minute: number }

export interface Reminder {
  id: string
  title: string
  next_execution: string | null
  recurrence: Recurrence | null
  recurrence_str: string | null
  days_of_week: number[] | null
  interval_seconds: number | null
  end_date: string | null
  pre_reminders: PreReminder[] | null
  is_active: boolean
  created_at: string
}

export interface ReminderListResponse {
  reminders: Reminder[]
  total: number
  limit: number
  offset: number
}

export interface PreAviso {
  at: string
  target: string
  lead_seconds: number
}

export interface SyncReminder {
  id: string
  title: string
  recurrence: Recurrence | null
  recurrence_str: string | null
  is_active: boolean
  scheduled_executions: string[]
  pre_executions: PreAviso[]
}

export interface SyncResponse {
  synced_at: string
  reminders: SyncReminder[]
}

export type Priority = 'low' | 'medium' | 'high'

export interface Task {
  id: string
  name: string
  priority: Priority
  notes: string | null
  completed: boolean
  week_key: string
  completed_week_key: string | null
  order_index: number | null
  created_at: string
}

export interface ChatAction {
  type?: string
  reminder?: Reminder
  [k: string]: unknown
}

export interface MessageResponse {
  message_id: string
  response: string
  intent: string
  action: ChatAction | null
  model_used: string
}

export interface ApiError {
  detail: string
  code: string
}
