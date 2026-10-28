import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { errorMessage, remindersApi } from '../lib/api'
import { cn } from '../lib/utils'
import type { PreReminder, Recurrence, Reminder } from '../types'
import { Button, Input, Label } from './ui'
import { Modal } from './Modal'
import { useToast } from './Toast'

const REC_OPTS: { key: Recurrence; label: string }[] = [
  { key: 'once', label: 'Único' },
  { key: 'daily', label: 'Todo dia' },
  { key: 'weekly_days', label: 'Dias da semana' },
  { key: 'weekly', label: 'Semanal' },
  { key: 'monthly', label: 'Mensal' },
]
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] // 0..6
const PRE_PRESETS = [
  { s: 300, label: '5 min' },
  { s: 900, label: '15 min' },
  { s: 1800, label: '30 min' },
  { s: 3600, label: '1 hora' },
  { s: 86400, label: '1 dia' },
]

// Converte um ISO pro par (YYYY-MM-DD, HH:MM) em horário LOCAL (pros inputs).
function isoToLocalParts(iso: string | null): { date: string; time: string } {
  const d = iso ? new Date(iso) : new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

export function ReminderFormModal({
  open,
  onClose,
  reminder,
  defaultDate,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  reminder?: Reminder | null
  defaultDate?: string // YYYY-MM-DD (criar a partir de um dia do calendário)
  onSaved?: () => void
}) {
  const toast = useToast()
  const isEdit = !!reminder?.id
  const [title, setTitle] = useState('')
  const [recurrence, setRecurrence] = useState<Recurrence>('once')
  const [days, setDays] = useState<number[]>([])
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [pre, setPre] = useState<PreReminder[]>([])
  const [customPre, setCustomPre] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    if (reminder) {
      setTitle(reminder.title)
      setRecurrence(reminder.recurrence || 'once')
      setDays(reminder.days_of_week || [])
      const p = isoToLocalParts(reminder.next_execution)
      setDate(p.date)
      setTime(p.time)
      setPre(reminder.pre_reminders || [])
    } else {
      setTitle('')
      setRecurrence('once')
      setDays([])
      setDate(defaultDate || isoToLocalParts(null).date)
      setTime('09:00')
      setPre([])
    }
    setCustomPre('')
  }, [open, reminder, defaultDate])

  const needsDate = recurrence === 'once' || recurrence === 'weekly' || recurrence === 'monthly'

  const togglePre = (s: number) =>
    setPre((prev) => {
      const has = prev.some((p) => p.type === 'offset' && p.seconds === s)
      return has
        ? prev.filter((p) => !(p.type === 'offset' && p.seconds === s))
        : [...prev, { type: 'offset', seconds: s }]
    })

  const addCustomPre = () => {
    const n = parseInt(customPre, 10)
    if (n > 0) {
      setPre((prev) => [...prev, { type: 'offset', seconds: n * 60 }])
      setCustomPre('')
    }
  }

  const preSorted = useMemo(
    () =>
      [...pre].sort((a, b) => {
        const av = a.type === 'offset' ? a.seconds : 0
        const bv = b.type === 'offset' ? b.seconds : 0
        return av - bv
      }),
    [pre],
  )

  const save = async () => {
    setError('')
    if (!title.trim()) return setError('Dá um título pro lembrete.')
    if (recurrence === 'weekly_days' && days.length === 0) return setError('Escolhe ao menos um dia.')
    const [y, mo, d] = date.split('-').map(Number)
    const [hh, mm] = time.split(':').map(Number)
    const dt = new Date(y, (mo || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0)
    if (recurrence === 'once' && dt.getTime() <= Date.now()) {
      return setError('Não dá pra voltar no tempo — escolhe um horário futuro.')
    }

    const payload: Record<string, unknown> = {
      title: title.trim(),
      scheduled_time: dt.toISOString(),
      recurrence,
      pre_reminders: pre,
    }
    if (recurrence === 'weekly_days') payload.days_of_week = [...days].sort((a, b) => a - b)

    setSaving(true)
    try {
      if (isEdit && reminder) await remindersApi.update(reminder.id, payload)
      else await remindersApi.create(payload as never)
      toast.ok(isEdit ? 'Lembrete atualizado' : 'Lembrete criado')
      onSaved?.()
      onClose()
    } catch (e) {
      setError(errorMessage(e, 'Não foi possível salvar.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar lembrete' : 'Novo lembrete'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <Label>Título</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: pagar o boleto" autoFocus />
        </div>

        <div>
          <Label>Recorrência</Label>
          <div className="flex flex-wrap gap-2">
            {REC_OPTS.map((o) => (
              <Chip key={o.key} active={recurrence === o.key} onClick={() => setRecurrence(o.key)}>
                {o.label}
              </Chip>
            ))}
          </div>
        </div>

        {recurrence === 'weekly_days' && (
          <div>
            <Label>Dias</Label>
            <div className="flex flex-wrap gap-2">
              {DIAS.map((lbl, i) => (
                <Chip
                  key={i}
                  active={days.includes(i)}
                  onClick={() =>
                    setDays((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))
                  }
                >
                  {lbl}
                </Chip>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {needsDate && (
            <div>
              <Label>{recurrence === 'once' ? 'Data' : 'A partir de'}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          )}
          <div className={needsDate ? '' : 'col-span-2'}>
            <Label>Horário</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Me avise antes</Label>
          <div className="flex flex-wrap gap-2">
            {PRE_PRESETS.map((p) => (
              <Chip
                key={p.s}
                active={pre.some((x) => x.type === 'offset' && x.seconds === p.s)}
                onClick={() => togglePre(p.s)}
              >
                {p.label}
              </Chip>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Input
              type="number"
              min={1}
              value={customPre}
              onChange={(e) => setCustomPre(e.target.value)}
              placeholder="minutos"
              className="h-9 w-28"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomPre())}
            />
            <Button size="sm" variant="subtle" onClick={addCustomPre}>
              Adicionar
            </Button>
          </div>
          {preSorted.filter((p) => p.type === 'offset' && !PRE_PRESETS.some((pp) => pp.s === p.seconds)).length >
            0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {preSorted
                .filter((p) => p.type === 'offset' && !PRE_PRESETS.some((pp) => pp.s === p.seconds))
                .map((p, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 h-7 pl-3 pr-1.5 rounded-full bg-primary text-white text-xs font-semibold"
                  >
                    {p.type === 'offset' ? `${Math.round(p.seconds / 60)} min` : ''}
                    <button
                      onClick={() => setPre((prev) => prev.filter((x) => x !== p))}
                      className="h-4 w-4 flex items-center justify-center"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</p>}
      </div>
    </Modal>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-9 px-3.5 rounded-xl text-sm font-semibold border transition-all active:scale-95',
        active
          ? 'bg-primary border-primary text-white'
          : 'bg-surface2 border-border text-txt-dim hover:text-txt',
      )}
    >
      {children}
    </button>
  )
}
