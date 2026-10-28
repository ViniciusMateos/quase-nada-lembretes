import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { Bell, SendHorizonal } from 'lucide-react'
import { chatApi, errorMessage } from '../lib/api'
import { fmtDateTime, recurrenceLabel } from '../lib/utils'
import type { Reminder } from '../types'
import { Dog } from '../components/ui'

interface Msg {
  id: string
  role: 'user' | 'assistant'
  text: string
  reminder?: Reminder | null
  error?: boolean
}

const SUGGESTIONS = [
  'me lembra de pagar o boleto amanhã às 10h',
  'reunião toda segunda às 9h, me avisa 15 min antes',
  'tomar remédio todo dia 8h e 20h',
]

export default function Chat() {
  const qc = useQueryClient()
  const sessionId = useRef(crypto.randomUUID()).current
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  const send = async (text: string) => {
    const content = text.trim()
    if (!content || sending) return
    setInput('')
    if (taRef.current) taRef.current.style.height = 'auto'
    const userMsg: Msg = { id: crypto.randomUUID(), role: 'user', text: content }
    setMessages((m) => [...m, userMsg])
    setSending(true)
    try {
      const res = await chatApi.send(content, sessionId)
      const reminder = (res.action?.reminder as Reminder) || null
      setMessages((m) => [
        ...m,
        { id: res.message_id, role: 'assistant', text: res.response, reminder },
      ])
      if (reminder) qc.invalidateQueries({ queryKey: ['reminders'] })
    } catch (e) {
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: 'assistant', text: errorMessage(e, 'Não consegui responder agora.'), error: true },
      ])
    } finally {
      setSending(false)
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* mensagens */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-6">
          {messages.length === 0 && !sending ? (
            <div className="flex flex-col items-center text-center pt-10 md:pt-20">
              <div className="h-16 w-16 rounded-2xl bg-primary/15 flex items-center justify-center mb-4">
                <Dog className="h-11 w-11" />
              </div>
              <h2 className="text-xl font-extrabold">Oi! Do que você quer ser lembrado?</h2>
              <p className="text-sm text-txt-dim mt-1 max-w-md">
                Escreve do seu jeito que a IA entende, agenda e te avisa.
              </p>
              <div className="flex flex-col gap-2 mt-6 w-full max-w-md">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left text-sm text-txt-dim hover:text-txt bg-surface border border-border hover:border-primary/50 rounded-xl px-4 py-3 transition-colors"
                  >
                    "{s}"
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence initial={false}>
                {messages.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                  >
                    {m.role === 'assistant' ? (
                      <div className="flex gap-3 max-w-[85%]">
                        <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                          <Dog className="h-5 w-5" />
                        </div>
                        <div className="space-y-2">
                          <div
                            className={`rounded-2xl rounded-tl-md px-4 py-2.5 text-[15px] whitespace-pre-wrap ${
                              m.error ? 'bg-danger/10 text-danger' : 'bg-surface border border-border text-txt'
                            }`}
                          >
                            {m.text}
                          </div>
                          {m.reminder && <ReminderCard reminder={m.reminder} />}
                        </div>
                      </div>
                    ) : (
                      <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-primary text-white px-4 py-2.5 text-[15px] whitespace-pre-wrap">
                        {m.text}
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              {sending && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                    <Dog className="h-5 w-5" />
                  </div>
                  <div className="bg-surface border border-border rounded-2xl rounded-tl-md px-4 py-3 flex items-center gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="h-2 w-2 rounded-full bg-txt-dim"
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* input */}
      <div className="border-t border-border bg-bg/80 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-4">
          <div className="flex items-end gap-2 bg-surface border border-border rounded-2xl p-2 focus-within:border-primary/60 transition-colors">
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
              }}
              onKeyDown={onKey}
              rows={1}
              placeholder="Escreve um lembrete..."
              className="flex-1 bg-transparent resize-none px-2 py-2 text-[15px] text-txt placeholder:text-txt-faint max-h-40"
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || sending}
              className="h-10 w-10 rounded-xl bg-primary text-white flex items-center justify-center shrink-0 disabled:opacity-40 hover:bg-primary-light transition-colors active:scale-95"
            >
              <SendHorizonal className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ReminderCard({ reminder }: { reminder: Reminder }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-3 bg-primary/10 border border-primary/30 rounded-xl px-4 py-3"
    >
      <div className="h-9 w-9 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
        <Bell className="h-5 w-5 text-primary-light" />
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-txt truncate">{reminder.title}</p>
        <p className="text-xs text-txt-dim">
          {fmtDateTime(reminder.next_execution)} · {recurrenceLabel(reminder)}
        </p>
      </div>
    </motion.div>
  )
}
