import { clsx, type ClassValue } from 'clsx'
import type { Reminder } from '../types'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

const SP_TZ = 'America/Sao_Paulo'
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

// Chave de dia YYYY-MM-DD no fuso de Brasília (igual ao app).
export function spDateKey(date: Date): string {
  try {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: SP_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)
    const g = (t: string) => p.find((x) => x.type === t)?.value
    const y = g('year')
    return y ? `${y}-${g('month')}-${g('day')}` : ''
  } catch {
    return ''
  }
}

export function fmtDateTime(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: SP_TZ,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso))
  } catch {
    return ''
  }
}

export function fmtTime(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: SP_TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso))
  } catch {
    return ''
  }
}

export function fmtDayLong(iso: string): string {
  try {
    return cap(
      new Intl.DateTimeFormat('pt-BR', {
        timeZone: SP_TZ,
        weekday: 'long',
        day: '2-digit',
        month: 'long',
      }).format(new Date(iso)),
    )
  } catch {
    return iso
  }
}

export function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

// Chave ISO da semana, ex "2026-W44" — formato que o backend de tasks espera.
export function isoWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export function isRecurring(r: Pick<Reminder, 'recurrence'>): boolean {
  return !!(r.recurrence && r.recurrence !== 'once')
}

// Rótulo de recorrência traduzido (o backend manda recurrence_str em pt, mas
// montamos aqui pra consistência).
export function recurrenceLabel(r: Reminder): string {
  const { recurrence, days_of_week, interval_seconds } = r
  switch (recurrence) {
    case 'once':
    case null:
    case undefined:
      return 'Único'
    case 'daily':
      return 'Todo dia'
    case 'weekly':
      return 'Semanal'
    case 'monthly':
      return 'Mensal'
    case 'day_of_month':
      return 'Dia do mês'
    case 'weekly_days':
      return rotuloDias(days_of_week || [])
    case 'interval_seconds':
      return rotuloIntervalo(interval_seconds || 0)
    default:
      return r.recurrence_str || ''
  }
}

function rotuloDias(days: number[]): string {
  const s = [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b)
  if (!s.length) return 'Dias da semana'
  if (s.length === 7) return 'Todo dia'
  if (s.join() === '0,1,2,3,4') return 'Dias úteis'
  if (s.join() === '5,6') return 'Fim de semana'
  return s.map((d) => DIAS[d]).join(', ')
}

function rotuloIntervalo(seconds: number): string {
  if (!seconds) return 'Intervalo'
  if (seconds % 86400 === 0) {
    const n = seconds / 86400
    return n === 1 ? 'A cada dia' : `A cada ${n} dias`
  }
  if (seconds % 3600 === 0) return `A cada ${seconds / 3600}h`
  if (seconds % 60 === 0) return `A cada ${seconds / 60}min`
  return `A cada ${seconds}s`
}

// Dia da semana no padrão do app (Seg=0..Dom=6) a partir de uma chave YYYY-MM-DD.
function weekdayFromKey(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}
function domFromKey(key: string): number {
  return Number(key.split('-')[2])
}

// Este lembrete cai neste dia? (expansão de recorrência no cliente, igual ao app).
function occursOn(r: Reminder, key: string, neKey: string): boolean {
  switch (r.recurrence) {
    case 'daily':
      return true
    case 'weekly':
      return weekdayFromKey(key) === weekdayFromKey(neKey)
    case 'weekly_days':
      return (r.days_of_week || []).includes(weekdayFromKey(key))
    case 'monthly':
    case 'day_of_month':
      return domFromKey(key) === domFromKey(neKey)
    default:
      return false
  }
}

// Mapa dayKey(YYYY-MM-DD) -> lembretes que caem naquele dia, pro mês (ano, mes 0-11).
// Pontuais aparecem no dia do next_execution; recorrentes são expandidos.
export function buildMonthOccurrences(
  reminders: Reminder[],
  year: number,
  month: number,
): Record<string, Reminder[]> {
  const map: Record<string, Reminder[]> = {}
  const dim = new Date(year, month + 1, 0).getDate()
  const dayKeys: string[] = []
  for (let d = 1; d <= dim; d++) {
    dayKeys.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  const add = (r: Reminder, key: string) => {
    if (!map[key]) map[key] = []
    if (!map[key].some((x) => x.id === r.id)) map[key].push(r)
  }
  for (const r of reminders) {
    const neKey = r.next_execution ? spDateKey(new Date(r.next_execution)) : null
    if (!r.recurrence || r.recurrence === 'once') {
      if (neKey && neKey.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)) add(r, neKey)
      continue
    }
    if (!neKey) continue
    for (const key of dayKeys) {
      if (occursOn(r, key, neKey)) add(r, key)
    }
  }
  return map
}

export function preLabel(p: NonNullable<Reminder['pre_reminders']>[number]): string {
  if (p.type === 'offset') {
    const s = p.seconds
    if (s % 604800 === 0) return `${s / 604800} sem antes`
    if (s % 86400 === 0) return `${s / 86400} dia(s) antes`
    if (s % 3600 === 0) return `${s / 3600}h antes`
    return `${Math.round(s / 60)}min antes`
  }
  const hh = String(p.hour).padStart(2, '0')
  const mm = String(p.minute).padStart(2, '0')
  return `${p.days}d antes, ${hh}:${mm}`
}
