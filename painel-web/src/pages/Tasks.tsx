import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronLeft, ChevronRight, Flag, ListChecks, Plus, Trash2 } from 'lucide-react'
import { errorMessage, tasksApi } from '../lib/api'
import { cn, isoWeekKey } from '../lib/utils'
import type { Priority, Task } from '../types'
import { Button, Card, EmptyState, Input, Label, PageHeader, Spinner, TextArea } from '../components/ui'
import { ConfirmModal, Modal } from '../components/Modal'
import { useToast } from '../components/Toast'

// ─────────────────────── prioridades ───────────────────────
const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'high', label: 'Alta' },
  { value: 'medium', label: 'Média' },
  { value: 'low', label: 'Baixa' },
]
const priorityLabel: Record<Priority, string> = { high: 'Alta', medium: 'Média', low: 'Baixa' }
const priorityOrder: Record<Priority, number> = { high: 0, medium: 1, low: 2 }
// badge (classes diretas pra garantir a cor — o cn não faz merge do Tailwind)
const priorityBadge: Record<Priority, string> = {
  high: 'bg-danger/15 text-danger',
  medium: 'bg-primary/15 text-primary-light',
  low: 'bg-surface2 text-txt-dim',
}
const chipActive: Record<Priority, string> = {
  high: 'bg-danger/20 text-danger',
  medium: 'bg-primary/20 text-primary-light',
  low: 'bg-border text-txt',
}

// ─────────────────────── datas da semana ───────────────────────
function weekStart(date: Date): Date {
  const d = new Date(date)
  const day = (d.getDay() + 6) % 7 // 0 = segunda
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}
function fmtDM(d: Date): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(d)
  } catch {
    return ''
  }
}

export default function Tasks() {
  const qc = useQueryClient()
  const toast = useToast()

  const [weekOffset, setWeekOffset] = useState(0)
  const baseDate = useMemo(() => new Date(Date.now() + weekOffset * 7 * 86400000), [weekOffset])
  const weekKey = isoWeekKey(baseDate)
  const weekLabel = weekOffset === 0 ? 'Esta semana' : `Semana de ${fmtDM(weekStart(baseDate))}`

  const [newName, setNewName] = useState('')
  const [newPriority, setNewPriority] = useState<Priority>('medium')
  const [editing, setEditing] = useState<Task | null>(null)
  const [deleting, setDeleting] = useState<Task | null>(null)

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks', weekKey],
    queryFn: () => tasksApi.list(weekKey),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['tasks', weekKey] })

  const createMut = useMutation({
    mutationFn: (v: { name: string; priority: Priority }) =>
      tasksApi.create({ name: v.name, priority: v.priority, week_key: weekKey }),
    onSuccess: () => {
      invalidate()
      toast.ok('Tarefa adicionada')
      setNewName('')
      setNewPriority('medium')
    },
    onError: (e) => toast.error(errorMessage(e, 'Não deu pra adicionar a tarefa.')),
  })

  const toggleMut = useMutation({
    mutationFn: (t: Task) => tasksApi.update(t.id, { completed: !t.completed, week_key: weekKey }),
    onSuccess: invalidate,
    onError: (e) => toast.error(errorMessage(e, 'Não deu pra atualizar.')),
  })

  const editMut = useMutation({
    mutationFn: (v: { id: string; name: string; notes: string; priority: Priority }) =>
      tasksApi.update(v.id, {
        name: v.name,
        notes: v.notes.trim() || null,
        priority: v.priority,
        week_key: weekKey,
      }),
    onSuccess: () => {
      invalidate()
      toast.ok('Tarefa atualizada')
      setEditing(null)
    },
    onError: (e) => toast.error(errorMessage(e, 'Não deu pra salvar.')),
  })

  const removeMut = useMutation({
    mutationFn: (id: string) => tasksApi.remove(id),
    onSuccess: () => {
      invalidate()
      toast.ok('Tarefa excluída')
    },
    onError: (e) => toast.error(errorMessage(e, 'Não deu pra excluir.')),
  })

  // não concluídas primeiro; dentro, por prioridade (Alta → Baixa)
  const sorted = useMemo(() => {
    const arr = [...(tasks ?? [])]
    arr.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1
      const p = priorityOrder[a.priority] - priorityOrder[b.priority]
      if (p !== 0) return p
      return (a.order_index ?? 0) - (b.order_index ?? 0)
    })
    return arr
  }, [tasks])

  const submitAdd = () => {
    const name = newName.trim()
    if (!name || createMut.isPending) return
    createMut.mutate({ name, priority: newPriority })
  }
  const onAddKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submitAdd()
    }
  }

  return (
    <div className="min-h-full">
      <div className="max-w-2xl mx-auto">
        <PageHeader title="Tarefas" subtitle="O que fazer nesta semana" />
      </div>

      <div className="max-w-2xl mx-auto px-5 md:px-8 pb-10">
        {/* navegação de semana */}
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-1">
            <button
              onClick={() => setWeekOffset((o) => o - 1)}
              aria-label="Semana anterior"
              className="h-8 w-8 flex items-center justify-center rounded-lg text-txt-dim hover:text-txt hover:bg-surface2 transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="min-w-[120px] text-center text-sm font-semibold text-txt select-none px-1">
              {weekLabel}
            </span>
            <button
              onClick={() => setWeekOffset((o) => o + 1)}
              aria-label="Próxima semana"
              className="h-8 w-8 flex items-center justify-center rounded-lg text-txt-dim hover:text-txt hover:bg-surface2 transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <AnimatePresence>
            {weekOffset !== 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15 }}
              >
                <Button variant="subtle" size="sm" onClick={() => setWeekOffset(0)}>
                  Esta semana
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* adicionar tarefa */}
        <Card className="p-3 mb-5">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={onAddKey}
              placeholder="O que precisa fazer?"
              className="flex-1 h-10"
            />
            <div className="flex items-center gap-2 justify-between sm:justify-end">
              <PriorityChips value={newPriority} onChange={setNewPriority} />
              <Button
                onClick={submitAdd}
                loading={createMut.isPending}
                disabled={!newName.trim()}
                className="shrink-0"
              >
                <Plus className="h-4 w-4" />
                Adicionar
              </Button>
            </div>
          </div>
        </Card>

        {/* lista */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-7 w-7" />
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={<ListChecks className="h-10 w-10" />}
            title="Nenhuma tarefa nesta semana"
            subtitle="Adiciona a primeira ali em cima pra organizar a semana."
          />
        ) : (
          <motion.div layout className="space-y-2.5">
            <AnimatePresence initial={false} mode="popLayout">
              {sorted.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onToggle={() => toggleMut.mutate(t)}
                  onEdit={() => setEditing(t)}
                  onDelete={() => setDeleting(t)}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      <EditTaskModal
        task={editing}
        open={!!editing}
        saving={editMut.isPending}
        onClose={() => setEditing(null)}
        onSave={(v) => editing && editMut.mutate({ id: editing.id, ...v })}
      />

      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && removeMut.mutate(deleting.id)}
        title="Excluir tarefa"
        message={`Tem certeza que quer excluir "${deleting?.name ?? ''}"? Isso não dá pra desfazer.`}
        confirmText="Excluir"
        danger
      />
    </div>
  )
}

// ─────────────────────── linha da tarefa ───────────────────────
function TaskRow({
  task,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: Task
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: task.completed ? 0.55 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, x: -12 }}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
    >
      <Card className="flex items-center gap-3 p-3">
        {/* checkbox redondo */}
        <button
          onClick={onToggle}
          aria-label={task.completed ? 'Marcar como não feita' : 'Concluir'}
          className={cn(
            'relative h-6 w-6 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors',
            task.completed ? 'bg-ok border-ok' : 'border-border hover:border-primary',
          )}
        >
          <AnimatePresence>
            {task.completed && (
              <motion.span
                key="check"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              >
                <Check className="h-3.5 w-3.5 text-white" strokeWidth={3.5} />
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        {/* nome + notas (clica pra editar) */}
        <button onClick={onEdit} className="flex-1 min-w-0 text-left">
          <p
            className={cn(
              'text-[15px] font-medium text-txt truncate',
              task.completed && 'line-through text-txt-dim',
            )}
          >
            {task.name}
          </p>
          {task.notes && <p className="text-xs text-txt-dim mt-0.5 truncate">{task.notes}</p>}
        </button>

        {/* prioridade */}
        <span
          className={cn(
            'inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-semibold shrink-0',
            priorityBadge[task.priority],
          )}
        >
          <Flag className="h-3 w-3" />
          {priorityLabel[task.priority]}
        </span>

        {/* excluir */}
        <button
          onClick={onDelete}
          aria-label="Excluir tarefa"
          className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg text-txt-faint hover:text-danger hover:bg-danger/10 transition-colors"
        >
          <Trash2 className="h-[18px] w-[18px]" />
        </button>
      </Card>
    </motion.div>
  )
}

// ─────────────────────── seletor de prioridade ───────────────────────
function PriorityChips({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }) {
  return (
    <div className="inline-flex items-center gap-1 bg-surface2 rounded-xl p-1">
      {PRIORITIES.map((p) => (
        <button
          key={p.value}
          type="button"
          onClick={() => onChange(p.value)}
          className={cn(
            'h-8 px-2.5 rounded-lg text-xs font-semibold transition-colors',
            value === p.value ? chipActive[p.value] : 'text-txt-dim hover:text-txt',
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}

// ─────────────────────── modal de edição ───────────────────────
function EditTaskModal({
  task,
  open,
  saving,
  onClose,
  onSave,
}: {
  task: Task | null
  open: boolean
  saving: boolean
  onClose: () => void
  onSave: (v: { name: string; notes: string; priority: Priority }) => void
}) {
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')

  // reidrata quando abre numa tarefa (mantém os valores durante o fade de saída)
  useEffect(() => {
    if (task) {
      setName(task.name)
      setNotes(task.notes ?? '')
      setPriority(task.priority)
    }
  }, [task])

  const save = () => {
    const n = name.trim()
    if (!n || saving) return
    onSave({ name: n, notes, priority })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Editar tarefa"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving} disabled={!name.trim()}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>Nome</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome da tarefa"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                save()
              }
            }}
          />
        </div>
        <div>
          <Label>Prioridade</Label>
          <PriorityChips value={priority} onChange={setPriority} />
        </div>
        <div>
          <Label>Notas</Label>
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Detalhes (opcional)"
            rows={3}
          />
        </div>
      </div>
    </Modal>
  )
}
