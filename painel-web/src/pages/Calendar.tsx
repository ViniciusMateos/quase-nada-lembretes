import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { errorMessage, remindersApi } from '../lib/api'
import {
  buildMonthOccurrences,
  cap,
  cn,
  fmtDayLong,
  fmtTime,
  isRecurring,
  recurrenceLabel,
  spDateKey,
} from '../lib/utils'
import type { Reminder } from '../types'
import { Button, Card, EmptyState, PageHeader, Spinner } from '../components/ui'
import { ConfirmModal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { ReminderFormModal } from '../components/ReminderFormModal'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// chave YYYY-MM-DD de um dia do mês em foco (mesmo formato de buildMonthOccurrences/spDateKey).
function dayKeyOf(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// Ordena por horário (fmtTime devolve HH:MM 24h, então comparação textual basta).
function byTime(a: Reminder, b: Reminder): number {
  return fmtTime(a.next_execution).localeCompare(fmtTime(b.next_execution))
}

export default function Calendar() {
  const qc = useQueryClient()
  const toast = useToast()

  const { data, isLoading } = useQuery({
    queryKey: ['reminders'],
    queryFn: () => remindersApi.list(true),
  })
  const reminders = useMemo(() => data?.reminders ?? [], [data])

  const todayKey = spDateKey(new Date())
  const [ref, setRef] = useState(() => {
    const [y, m] = spDateKey(new Date()).split('-').map(Number)
    return { year: y, month: (m || 1) - 1 }
  })
  const [dir, setDir] = useState(0) // direção da transição de mês (-1 anterior, 1 próximo)
  const [selDay, setSelDay] = useState<string | null>(null)

  // modais
  const [form, setForm] = useState<{ open: boolean; reminder?: Reminder | null; defaultDate?: string }>({
    open: false,
  })
  const [toDelete, setToDelete] = useState<Reminder | null>(null)

  const occ = useMemo(() => buildMonthOccurrences(reminders, ref.year, ref.month), [reminders, ref])

  const monthLabel = cap(
    new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
      new Date(ref.year, ref.month, 1),
    ),
  )

  const goMonth = (delta: number) => {
    setDir(delta)
    setRef((r) => {
      const d = new Date(r.year, r.month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  const goToday = () => {
    const [y, m] = todayKey.split('-').map(Number)
    const nextMonth = (m || 1) - 1
    setDir(y * 12 + nextMonth >= ref.year * 12 + ref.month ? 1 : -1)
    setRef({ year: y, month: nextMonth })
    setSelDay(todayKey)
  }

  const pickDay = (key: string) => {
    if (key < todayKey) {
      toast.error('Não dá pra voltar no tempo.')
      return
    }
    setSelDay(key)
  }

  const openNew = () => setForm({ open: true, defaultDate: selDay ?? undefined })
  const openEdit = (r: Reminder) => setForm({ open: true, reminder: r })
  const closeForm = () => setForm({ open: false })

  const confirmDelete = async () => {
    const target = toDelete
    if (!target) return
    try {
      await remindersApi.remove(target.id)
      toast.ok('Lembrete excluído')
      qc.invalidateQueries({ queryKey: ['reminders'] })
    } catch (e) {
      toast.error(errorMessage(e, 'Não foi possível excluir.'))
    }
  }

  // grade do mês: células vazias no começo + dias.
  const firstWeekday = new Date(ref.year, ref.month, 1).getDay() // 0=Dom
  const daysInMonth = new Date(ref.year, ref.month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const dayItems = selDay ? occ[selDay] ?? [] : []
  const pontuais = dayItems.filter((r) => !isRecurring(r)).sort(byTime)
  const recorrentes = dayItems.filter((r) => isRecurring(r)).sort(byTime)

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader title="Calendário" subtitle="Seus lembretes no mês" />

      {isLoading ? (
        <div className="grid place-items-center py-24">
          <Spinner className="h-8 w-8" />
        </div>
      ) : (
        <div className="px-5 md:px-8 pb-10">
          <div className="flex flex-col md:flex-row gap-6">
            {/* ─────────── Calendário ─────────── */}
            <Card className="flex-1 p-4 md:p-5">
              {/* cabeçalho do mês */}
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-lg font-extrabold tracking-tight text-txt">{monthLabel}</h2>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="subtle" onClick={goToday}>
                    Hoje
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => goMonth(-1)}
                    aria-label="Mês anterior"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => goMonth(1)}
                    aria-label="Próximo mês"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              {/* dias da semana */}
              <div className="grid grid-cols-7 gap-1.5 mb-1.5">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="text-center text-[11px] font-semibold text-txt-faint py-1">
                    {d}
                  </div>
                ))}
              </div>

              {/* grade (anima ao trocar de mês) */}
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`${ref.year}-${ref.month}`}
                  initial={{ opacity: 0, x: dir * 28 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: dir * -28 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="grid grid-cols-7 gap-1.5"
                >
                  {cells.map((d, i) => {
                    if (d === null) return <div key={`e${i}`} className="aspect-square" />
                    const key = dayKeyOf(ref.year, ref.month, d)
                    const items = occ[key]
                    const has = !!items?.length
                    const hasPunctual = has && items.some((r) => !isRecurring(r))
                    const isHoje = key === todayKey
                    const isSel = key === selDay
                    const isPast = key < todayKey
                    return (
                      <button
                        key={key}
                        onClick={() => pickDay(key)}
                        className={cn(
                          'relative aspect-square rounded-xl flex items-center justify-center text-sm font-semibold transition-colors',
                          isSel
                            ? 'bg-primary text-white shadow-glow'
                            : isPast
                              ? 'text-txt-faint opacity-50 hover:bg-surface2/60'
                              : 'text-txt hover:bg-surface2',
                          !isSel && isHoje && 'ring-1 ring-txt-dim',
                        )}
                      >
                        {d}
                        {has && (
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{
                              type: 'spring',
                              stiffness: 500,
                              damping: 18,
                              delay: Math.min(i * 0.008, 0.15),
                            }}
                            className={cn(
                              'absolute bottom-1.5 h-1.5 w-1.5 rounded-full',
                              isSel ? 'bg-white/80' : hasPunctual ? 'bg-primary' : 'bg-txt-faint',
                            )}
                          />
                        )}
                      </button>
                    )
                  })}
                </motion.div>
              </AnimatePresence>
            </Card>

            {/* ─────────── Painel do dia ─────────── */}
            <Card className="w-full md:w-[360px] shrink-0 p-4 md:p-5">
              {!selDay ? (
                <EmptyState
                  icon={<CalendarDays className="h-10 w-10" />}
                  title="Escolhe um dia"
                  subtitle="Clica num dia do calendário pra ver e criar lembretes."
                />
              ) : (
                <div>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-txt-faint mb-0.5">Dia selecionado</p>
                      <h3 className="text-base font-extrabold tracking-tight text-txt leading-tight">
                        {fmtDayLong(selDay + 'T12:00:00')}
                      </h3>
                    </div>
                    <Button size="icon" variant="primary" onClick={openNew} aria-label="Novo lembrete">
                      <Plus className="h-5 w-5" />
                    </Button>
                  </div>

                  {dayItems.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border py-8 px-4 text-center">
                      <p className="text-sm text-txt-dim">Nenhum lembrete — crie um</p>
                      <Button size="sm" variant="subtle" onClick={openNew} className="mt-3">
                        <Plus className="h-4 w-4" />
                        Adicionar
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <DaySection title="Pontuais" items={pontuais} onEdit={openEdit} onDelete={setToDelete} />
                      <DaySection
                        title="Recorrentes"
                        items={recorrentes}
                        onEdit={openEdit}
                        onDelete={setToDelete}
                      />
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      <ReminderFormModal
        open={form.open}
        onClose={closeForm}
        reminder={form.reminder}
        defaultDate={form.defaultDate}
        onSaved={() => qc.invalidateQueries({ queryKey: ['reminders'] })}
      />

      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Excluir lembrete"
        message={`Tem certeza que quer excluir "${toDelete?.title ?? ''}"? Isso não dá pra desfazer.`}
        confirmText="Excluir"
        danger
      />
    </div>
  )
}

interface DaySectionProps {
  title: string
  items: Reminder[]
  onEdit: (r: Reminder) => void
  onDelete: (r: Reminder) => void
}

function DaySection({ title, items, onEdit, onDelete }: DaySectionProps) {
  if (items.length === 0) return null
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <p className="text-xs font-semibold text-txt-dim uppercase tracking-wide">{title}</p>
        <span className="text-[11px] font-semibold text-txt-faint">{items.length}</span>
      </div>
      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {items.map((r) => (
            <motion.div
              key={r.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="group flex items-center gap-3 rounded-xl bg-surface2/60 border border-border px-3 py-2.5"
            >
              <div className="flex items-center gap-1.5 w-[58px] shrink-0 text-xs font-semibold text-txt-dim">
                <Clock className="h-3.5 w-3.5 text-txt-faint" />
                {fmtTime(r.next_execution)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-txt truncate">{r.title}</p>
                <p className="text-[11px] text-txt-faint truncate">{recurrenceLabel(r)}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onEdit(r)}
                  aria-label="Editar"
                  className="h-8 w-8 flex items-center justify-center rounded-lg text-txt-dim hover:bg-surface hover:text-txt transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onDelete(r)}
                  aria-label="Excluir"
                  className="h-8 w-8 flex items-center justify-center rounded-lg text-txt-dim hover:bg-danger/15 hover:text-danger transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
