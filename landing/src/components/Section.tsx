import type { ReactNode } from 'react'

type SectionEyebrowProps = {
  children: string
  className?: string
  align?: 'left' | 'center'
}

export function SectionEyebrow({
  children,
  className = '',
  align = 'left',
}: SectionEyebrowProps) {
  return (
    <p
      className={`font-mono text-[11px] uppercase tracking-[0.2em] text-[#14161F]/50 font-medium ${
        align === 'center' ? 'text-center' : ''
      } ${className}`.trim()}
    >
      {children}
    </p>
  )
}

type SectionHeadingProps = {
  children: ReactNode
  className?: string
}

export function SectionHeading({ children, className = '' }: SectionHeadingProps) {
  return (
    <h2
      className={`font-display font-normal tracking-[-0.01em] leading-[1.15] text-[26px] sm:text-3xl md:text-[40px] text-[#14161F] ${className}`.trim()}
    >
      {children}
    </h2>
  )
}

type BodyCopyProps = {
  children: ReactNode
  className?: string
}

export function BodyCopy({ children, className = '' }: BodyCopyProps) {
  return (
    <p
      className={`text-[15px] md:text-base text-[#14161F]/70 leading-relaxed ${className}`.trim()}
    >
      {children}
    </p>
  )
}

type SectionShellProps = {
  id?: string
  children: ReactNode
  className?: string
}

export function SectionShell({ id, children, className = '' }: SectionShellProps) {
  return (
    <section
      id={id}
      className={`scroll-mt-28 py-16 sm:py-28 md:py-32 ${className}`.trim()}
    >
      <div className="max-w-6xl mx-auto px-6 sm:px-10 md:px-14">{children}</div>
    </section>
  )
}

export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161F] focus-visible:ring-offset-2'
