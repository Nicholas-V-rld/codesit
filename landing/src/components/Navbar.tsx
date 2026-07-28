import { useEffect, useId, useRef, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { Logo } from './Logo'
import { focusRing } from './Section'

const NAV_LINKS = [
  { label: 'Platform', href: '#platform' },
  { label: 'Access control', href: '#access' },
  { label: 'Security', href: '#security' },
  { label: 'Deploy', href: '#deploy' },
] as const

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const toggleRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 32)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const getFocusable = () => {
      const fromPanel = panelRef.current
        ? Array.from(
            panelRef.current.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled])',
            ),
          )
        : []
      const toggle = toggleRef.current
      return toggle ? [toggle, ...fromPanel] : fromPanel
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
        return
      }

      if (event.key !== 'Tab') return

      const focusable = getFocusable()
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)

    const firstLink = panelRef.current?.querySelector<HTMLElement>('a[href]')
    firstLink?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const closeMenu = () => setOpen(false)

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 px-6 sm:px-10 md:px-14 py-4 sm:py-5 transition-colors duration-300 ${
          scrolled
            ? 'bg-white/85 backdrop-blur-md border-b border-gray-200/70'
            : 'bg-transparent border-b border-transparent'
        }`}
      >
        <nav className="flex items-center justify-between" aria-label="Primary">
          <a
            href="/"
            className={`flex items-center gap-2.5 text-[#14161F] rounded-sm ${focusRing}`}
          >
            <Logo className="w-6 h-6 text-[#14161F]" />
            <span className="font-semibold text-base tracking-tight text-[#14161F]">
              CodeSit
            </span>
          </a>

          <ul className="hidden md:flex items-center gap-8 list-none m-0 p-0">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className={`text-sm text-[#14161F]/70 hover:text-[#14161F] transition-colors duration-200 rounded-sm ${focusRing}`}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2">
            <a
              href="/login"
              className={`hidden md:inline-flex items-center justify-center min-h-11 px-5 py-2.5 bg-[#14161F] text-white text-sm font-medium rounded-lg hover:bg-[#14161F]/90 transition-colors duration-200 ${focusRing}`}
            >
              Sign in
            </a>

            <button
              ref={toggleRef}
              type="button"
              className={`md:hidden inline-flex items-center justify-center min-h-11 min-w-11 rounded-sm text-[#14161F] ${focusRing}`}
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              aria-controls={menuId}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </nav>
      </header>

      {open ? (
        <div
          id={menuId}
          ref={panelRef}
          className="fixed inset-0 z-40 bg-white px-6 pt-24 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <ul className="list-none m-0 p-0">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={closeMenu}
                  className={`block py-4 text-2xl font-display text-[#14161F] rounded-sm ${focusRing}`}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <a
            href="/login"
            onClick={closeMenu}
            className={`mt-4 flex items-center justify-center w-full min-h-11 px-5 py-3.5 bg-[#14161F] text-white text-sm font-medium rounded-full hover:bg-[#14161F]/90 transition-colors duration-200 ${focusRing}`}
          >
            Sign in
          </a>
        </div>
      ) : null}
    </>
  )
}
