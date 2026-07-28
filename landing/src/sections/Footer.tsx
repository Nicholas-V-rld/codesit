import { Logo } from '../components/Logo'
import { focusRing } from '../components/Section'

const PRODUCT_LINKS = [
  { label: 'Platform', href: '#platform' },
  { label: 'Access control', href: '#access' },
  { label: 'Security', href: '#security' },
  { label: 'Deploy', href: '#deploy' },
] as const

const START_LINKS = [
  { label: 'Sign in', href: '/login' },
  { label: 'Sign up', href: '/register' },
] as const

const linkClass = `flex items-center min-h-11 text-sm text-[#14161F]/60 hover:text-[#14161F] transition-colors duration-200 ${focusRing} rounded-sm`

export function Footer() {
  return (
    <footer className="border-t border-gray-200 py-14">
      <div className="max-w-6xl mx-auto px-6 sm:px-10 md:px-14">
        <div className="flex flex-wrap items-start justify-between gap-10">
          <div>
            <a
              href="/"
              className={`inline-flex items-center gap-2.5 text-[#14161F] rounded-sm ${focusRing}`}
            >
              <Logo className="w-6 h-6 text-[#14161F]" />
              <span className="font-semibold text-base tracking-tight text-[#14161F]">
                CodeSit
              </span>
            </a>
            <p className="mt-3 text-sm text-[#14161F]/60">
              Write code. Run it. Sit the exam.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-8 sm:gap-14">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#14161F]/40 mb-4">
                Product
              </p>
              {PRODUCT_LINKS.map((link) => (
                <a key={link.href} href={link.href} className={linkClass}>
                  {link.label}
                </a>
              ))}
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#14161F]/40 mb-4">
                Get started
              </p>
              {START_LINKS.map((link) => (
                <a key={link.href} href={link.href} className={linkClass}>
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-12 pt-7 border-t border-gray-100 flex flex-wrap justify-between gap-3 font-mono text-[11px] text-[#14161F]/40">
          <span>© 2026 CodeSit</span>
          <span>Built at Federal Polytechnic Ilaro</span>
        </div>
      </div>
    </footer>
  )
}
