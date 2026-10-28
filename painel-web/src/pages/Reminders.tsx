import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Pencil, Plus, Trash2 } from 'lucide-react'
import { errorMessage, remindersApi } from '../lib/api'
import { cn, fmtDateTime, isRecurring, recurrenceLabel } from '../lib/utils'
import type { Reminder } from '../types'
import { Badge, Button, Card, EmptyState, PageHeader, Spinner } from '../components/ui'
import { ConfirmModal } from '../components/Modal'
import { ReminderFormModal } from '../components/ReminderFormModal'
import { useToast } from '../components/Toast'

// Ordena por próxima execução (asc); quem não tem next_execution vai pro fim.
function byNext(a: Reminder, b: Reminder): number {
  if (!a.next_execution && !b.next_execution) return 0
  if (!a.next_execution) return 1
  if (!b.next_execution) return -1
  return a.next_execution.localeCompare(b.next_execution)
}

export default function Reminders() {
  const qc = useQueryClient()
  const toast = useToast()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['reminders'],
    queryFn: () => remindersApi.list(true),
  })

  // Modal de criar/editar (editing=null => criar) e confirmação de exclusão.
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Reminder | null>(null)
  const [toDelete, setToDelete] = useState<Reminder | null>(null)

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (r: Reminder) => {
    setEditing(r)
    setFormOpen(true)
  }

  const refetch = () => qc.invalidateQueries({ queryKey: ['reminders'] })

  const confirmDelete = async () => {
    if (!toDelete) return
    try {
      await remindersApi.remove(toDelete.id)
      toast.ok('Lembrete excluído')
      refetch()
    } catch (e) {
      toast.error(errorMessage(e, 'Não foi possível excluir.'))
    }
  }

  // Ordena tudo e separa: pontuais (once/null) vs recorrentes (o resto).
  const all = (data?.reminders ?? []).slice().sort(byNext)
  const pontuais = all.filter((r) => !isRecurring(r))
  const recorrentes = all.filter((r) => isRecurring(r))
  const vazio = all.length === 0

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <PageHeader
        title="Lembretes"
        subtitle="Tudo que você pediu pra ser lembrado"
        action={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Novo lembrete
          </Button>
        }
      />

      <div className="max-w-3xl mx-auto w-full px-5 md:px-8 pb-10">
        {isLoading ? (
          <div className="flex justify-center py-24">
            <Spinner className="h-7 w-7" />
          </div>
        ) : isError ? (
          <div className="bg-danger/10 border border-danger/30 text-danger rounded-xl px-4 py-3 text-sm">
            Não consegui carregar seus lembretes. {errorMessage(error, '')}
          </div>
        ) : vazio ? (
          <EmptyState
            icon={<Bell className="h-10 w-10" />}
            title="Nenhum lembrete por aqui"
            subtitle="Crie seu primeiro lembrete ou peça pra IA lá no chat."
            action={
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" /> Criar lembrete
              </Button>
            }
          />
        ) : (
          <div className="pt-1">
            <Section title="Pontuais" items={pontuais} onEdit={openEdit} onDelete={setToDelete} />
            <Section title="Recorrentes" items={recorrentes} onEdit={openEdit} onDelete={setToDelete} />
          </div>
        )}
      </div>

      {/* criar / editar */}
      <ReminderFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        reminder={editing}
        onSaved={refetch}
      />

      {/* confirmação de exclusão */}
      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Excluir lembrete"
        message={`Excluir "${toDelete?.title ?? ''}"?`}
        confirmText="Excluir"
        danger
      />
    </div>
  )
}

function Section({
  title,
  items,
  onEdit,
  onDelete,
}: {
  title: string
  items: Reminder[]
  onEdit: (r: Reminder) => void
  onDelete: (r: Reminder) => void
}) {
  // A seção só aparece se tiver itens.
  if (items.length === 0) return null
  return (
    <section className="mb-8 last:mb-0">
      <h2 className="text-xs font-bold uppercase tracking-wider text-txt-dim mb-3">{title}</h2>
      <div className="space-y-2.5">
        <AnimatePresence initial={false} mode="popLayout">
          {items.map((r, i) => (
            <motion.div
              key={r.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { delay: i * 0.03 } }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            >
              <ReminderRow reminder={r} onEdit={onEdit} onDelete={onDelete} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  )
}

function ReminderRow({
  reminder,
  onEdit,
  onDelete,
}: {
  reminder: Reminder
  onEdit: (r: Reminder) => void
  onDelete: (r: Reminder) => void
}) {
  const pontual = !isRecurring(reminder)
  const preCount = reminder.pre_reminders?.length ?? 0

  return (
    <Card className="flex items-center gap-3 p-4 hover:border-primary/40 transition-colors">
      {/* bolinha de status: pontual = primary, recorrente = faint */}
      <span className={cn('h-2 w-2 rounded-full shrink-0', pontual ? 'bg-primary' : 'bg-txt-faint')} />

      <div className="min-w-0 flex-1">
        <p className="font-semibold text-txt truncate">{reminder.title}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
          {reminder.next_execution && (
            <span className="text-xs text-txt-dim">{fmtDateTime(reminder.next_execution)}</span>
          )}
          <Badge>{recurrenceLabel(reminder)}</Badge>
          {preCount > 0 && (
            <span className="text-xs text-txt-faint">
              {preCount} aviso{preCount > 1 ? 's' : ''} antes
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => onEdit(reminder)} aria-label="Editar lembrete">
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(reminder)}
          aria-label="Excluir lembrete"
          className="hover:text-danger"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  )
}
