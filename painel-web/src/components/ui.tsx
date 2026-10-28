import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'

type Variant = 'primary' | 'ghost' | 'danger' | 'subtle'
type Size = 'sm' | 'md' | 'lg' | 'icon'

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-light shadow-glow/0 hover:shadow-glow',
  ghost: 'bg-transparent text-txt-dim hover:bg-surface2 hover:text-txt',
  subtle: 'bg-surface2 text-txt hover:bg-border',
  danger: 'bg-danger/15 text-danger hover:bg-danger/25',
}
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-xl gap-2',
  lg: 'h-12 px-6 text-[15px] rounded-xl gap-2',
  icon: 'h-9 w-9 rounded-lg justify-center',
}

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-all duration-150 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none select-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  )
})

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'w-full h-11 px-3.5 rounded-xl bg-surface2 border border-border text-txt placeholder:text-txt-faint',
          'transition-colors focus:border-primary',
          className,
        )}
        {...rest}
      />
    )
  },
)

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          'w-full px-3.5 py-3 rounded-xl bg-surface2 border border-border text-txt placeholder:text-txt-faint resize-none',
          'transition-colors focus:border-primary',
          className,
        )}
        {...rest}
      />
    )
  },
)

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('bg-surface border border-border rounded-xl2 shadow-card', className)}>
      {children}
    </div>
  )
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <label className={cn('block text-xs font-semibold text-txt-dim mb-1.5', className)}>
      {children}
    </label>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('animate-spin text-primary', className)} />
}

// Mascote (cachorro branco do app). Vira o "logo" do painel.
export function Dog({ className }: { className?: string }) {
  return <img src="/cachorro.png" alt="Quase Nada" className={cn('object-contain', className)} draggable={false} />
}

export function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon?: ReactNode
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      {icon && <div className="mb-4 text-txt-faint">{icon}</div>}
      <p className="text-txt font-semibold">{title}</p>
      {subtitle && <p className="text-sm text-txt-dim mt-1 max-w-sm">{subtitle}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 md:px-8 pt-6 md:pt-8 pb-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-txt">{title}</h1>
        {subtitle && <p className="text-sm text-txt-dim mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function Badge({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center h-5 px-2 rounded-full text-[11px] font-semibold',
        'bg-primary/15 text-primary-light',
        className,
      )}
    >
      {children}
    </span>
  )
}
