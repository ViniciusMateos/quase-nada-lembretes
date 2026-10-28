import { useEffect, useState } from 'react'
import { CheckCircle2, KeyRound, LogOut, Server, User as UserIcon, XCircle } from 'lucide-react'
import { api, authApi, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Button, Card, Input, Label, PageHeader } from '../components/ui'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'

export default function Settings() {
  const { user, logout } = useAuth()
  const toast = useToast()
  const [pwOpen, setPwOpen] = useState(false)
  const [health, setHealth] = useState<'checando' | 'ok' | 'erro'>('checando')

  useEffect(() => {
    api
      .get('/health', { timeout: 8000 })
      .then(() => setHealth('ok'))
      .catch(() => setHealth('erro'))
  }, [])

  return (
    <div>
      <PageHeader title="Ajustes" subtitle="Conta e conexão" />
      <div className="max-w-2xl mx-auto px-5 md:px-8 pb-10 space-y-4">
        {/* Conta */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4 text-txt-dim">
            <UserIcon className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wide">Conta</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-primary/20 text-primary-light flex items-center justify-center font-bold text-xl">
              {(user?.name || '?').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-lg text-txt truncate">{user?.name}</p>
              <p className="text-sm text-txt-dim truncate">{user?.email}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-5">
            <Button variant="subtle" onClick={() => setPwOpen(true)}>
              <KeyRound className="h-4 w-4" /> Alterar senha
            </Button>
            <Button variant="danger" onClick={logout}>
              <LogOut className="h-4 w-4" /> Sair
            </Button>
          </div>
        </Card>

        {/* Conexão */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4 text-txt-dim">
            <Server className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wide">Backend</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-txt">Servidor do Quase Nada Lembretes</p>
              <p className="text-xs text-txt-dim">Mesmo backend do app (via proxy local)</p>
            </div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              {health === 'checando' && <span className="text-txt-dim">checando…</span>}
              {health === 'ok' && (
                <span className="flex items-center gap-1.5 text-ok">
                  <CheckCircle2 className="h-4 w-4" /> online
                </span>
              )}
              {health === 'erro' && (
                <span className="flex items-center gap-1.5 text-danger">
                  <XCircle className="h-4 w-4" /> offline
                </span>
              )}
            </div>
          </div>
        </Card>

        <p className="text-center text-xs text-txt-faint pt-2">
          Quase Nada Lembretes · painel web local
        </p>
      </div>

      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} onDone={() => toast.ok('Senha alterada')} />
    </div>
  )
}

function ChangePasswordModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setCur('')
      setNext('')
      setError('')
    }
  }, [open])

  const save = async () => {
    setError('')
    if (next.length < 8) return setError('A nova senha precisa ter ao menos 8 caracteres.')
    setLoading(true)
    try {
      await authApi.changePassword(cur, next)
      onDone()
      onClose()
    } catch (e) {
      setError(errorMessage(e, 'Não foi possível alterar.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Alterar senha"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={loading}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>Senha atual</Label>
          <Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="••••••••" />
        </div>
        <div>
          <Label>Nova senha</Label>
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="mín. 8 caracteres" />
        </div>
        {error && <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</p>}
      </div>
    </Modal>
  )
}
