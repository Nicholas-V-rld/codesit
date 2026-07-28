import { ArrowRight } from 'lucide-react'
import { BoomerangVideoBg } from './BoomerangVideoBg'
import { focusRing } from './Section'

const FEATURES = [
  { num: '01', label: 'In-browser' },
  { num: '02', label: 'Scoped' },
  { num: '03', label: 'Verifiable' },
] as const

export function Hero() {
  return (
    <section className="relative flex flex-col items-center overflow-hidden min-h-[100svh]">
      <BoomerangVideoBg />

      <div className="relative z-10 flex flex-col items-center w-full min-h-[100svh]">
        <div className="pt-24 sm:pt-26 md:pt-32 px-4 sm:px-6 text-center">
          <h1 className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-[88px] leading-[1.08] tracking-[-0.01em] text-[#14161F] font-normal">
            Coding exams that
            <br />
            actually test coding.
          </h1>

          <p className="max-w-[19rem] sm:max-w-md mx-auto mt-5 sm:mt-6 md:mt-8 text-sm md:text-base text-[#14161F]/70 leading-relaxed">
            Students write, run and submit real code in the browser. Lecturers
            see only their own department and levels — and can re-run any
            submission to verify it.
          </p>

          <a
            href="/register"
            className={`inline-flex items-center justify-center min-h-11 mt-6 sm:mt-8 md:mt-10 px-6 sm:px-8 py-3 sm:py-3.5 bg-[#14161F] text-white text-sm font-medium rounded-lg hover:bg-[#14161F]/90 transition-colors duration-200 ${focusRing}`}
          >
            Sign up
          </a>
        </div>

        <div className="mt-auto w-full max-w-5xl px-4 sm:px-6 pt-16 sm:pt-20">
          <div className="bg-white/90 backdrop-blur-sm border border-gray-200 border-b-0 pt-8 sm:pt-12 md:pt-16 px-5 sm:px-8 md:px-12 pb-0 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 md:gap-16">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#14161F]/50 font-medium font-mono">
                  WHAT IS CODESIT?
                </p>
                <h2 className="mt-3 text-2xl sm:text-3xl md:text-4xl font-display font-normal leading-[1.15] tracking-[-0.01em] text-[#14161F]">
                  Exams that run,{' '}
                  <br className="hidden sm:block" />
                  reviews you can trust
                </h2>
              </div>
              <div className="flex items-end">
                <p className="text-sm md:text-[15px] text-[#14161F]/70 leading-relaxed">
                  A coding exam belongs on a keyboard, not on paper. CodeSit
                  puts the whole paper in one controlled workspace — every
                  submission stored, timestamped, and re-runnable by the
                  lecturer who owns that level.
                </p>
              </div>
            </div>

            <div className="mt-6 sm:mt-8 md:mt-10 h-px bg-gray-200 w-full" />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
              {FEATURES.map((item) => (
                <button
                  key={item.num}
                  type="button"
                  className={`group flex items-center justify-between min-h-11 bg-[#EDEFF4] hover:bg-[#E2E5EC] transition-all duration-200 cursor-pointer px-4 sm:px-6 py-3.5 sm:py-4 text-left w-full ${focusRing}`}
                >
                  <span className="text-sm text-[#14161F]">
                    <span className="font-mono text-[#14161F]/40">
                      {item.num}
                    </span>
                    <span className="mx-2 text-[#14161F]/30">/</span>
                    <span className="font-medium">{item.label}</span>
                  </span>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-700 group-hover:translate-x-0.5 transition-all duration-200 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
