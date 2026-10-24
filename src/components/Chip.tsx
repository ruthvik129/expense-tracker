import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Chip({
  selected,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'min-h-11 cursor-pointer rounded-full border px-4 text-sm font-medium transition-colors duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        selected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input bg-card text-foreground hover:bg-muted',
        className,
      )}
      {...props}
    />
  )
}
