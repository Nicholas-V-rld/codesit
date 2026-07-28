import {
  BodyCopy,
  SectionHeading,
  SectionShell,
  focusRing,
} from '../components/Section'

export function ClosingCta() {
  return (
    <SectionShell className="bg-[#F7F8FA] border-t border-gray-200">
      <div className="max-w-2xl mx-auto text-center">
        <SectionHeading>Bring CodeSit to your department.</SectionHeading>
        <BodyCopy className="mt-5">
          See it running with your own courses and levels. Fifteen minutes is
          enough to know whether it fits.
        </BodyCopy>
        <div className="mt-9 flex flex-wrap gap-3 justify-center">
          <a
            href="/register"
            className={`inline-flex items-center justify-center min-h-11 px-7 py-3.5 bg-[#14161F] text-white text-sm font-medium rounded-lg hover:bg-[#14161F]/90 transition-colors duration-200 ${focusRing}`}
          >
            Sign up
          </a>
          <a
            href="/login"
            className={`inline-flex items-center justify-center min-h-11 px-7 py-3.5 border border-gray-300 text-[#14161F] text-sm font-medium rounded-lg hover:border-[#14161F]/40 transition-colors duration-200 ${focusRing}`}
          >
            Sign in
          </a>
        </div>
        <p className="mt-6 font-mono text-[11px] text-[#14161F]/40">
          Federal Polytechnic Ilaro · Department of Computer Science
        </p>
      </div>
    </SectionShell>
  )
}
