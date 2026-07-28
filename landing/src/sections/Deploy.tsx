import {
  BodyCopy,
  SectionEyebrow,
  SectionHeading,
  SectionShell,
} from '../components/Section'

const STEPS = [
  {
    num: '01',
    heading: 'Install and start',
    body: 'Node 18 or newer. The database creates and seeds itself on first run.',
  },
  {
    num: '02',
    heading: 'Point it at a runner',
    body: 'Ships working out of the box. For production, run your own execution engine so nothing leaves your network.',
  },
  {
    num: '03',
    heading: 'Add your departments',
    body: 'Set your real departments and levels in one config file, then create lecturer accounts.',
  },
] as const

function PromptMark() {
  return (
    <svg
      viewBox="0 0 40 24"
      className="w-8 h-auto"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 4l8 8-8 8"
        stroke="#14161F"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="20" y="18" width="16" height="2.5" rx="1.25" fill="#0D9488" />
    </svg>
  )
}

export function Deploy() {
  return (
    <SectionShell id="deploy" className="bg-white">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-start">
        <div>
          <PromptMark />
          <SectionEyebrow className="mt-4">DEPLOY</SectionEyebrow>
          <SectionHeading className="mt-3">
            Runs on one machine.{' '}
            <br className="hidden sm:block" />
            Yours.
          </SectionHeading>
          <BodyCopy className="mt-5">
            No per-student install, no licences to count. One Node process and a
            single database file. Put it on a lab machine, a campus server, or a
            small VPS.
          </BodyCopy>

          <div className="mt-10 divide-y divide-gray-200">
            {STEPS.map((step) => (
              <div key={step.num} className="flex gap-5 sm:gap-8 py-5">
                <span className="font-mono text-sm text-[#14161F]/35 pt-0.5 shrink-0 w-8">
                  {step.num}
                </span>
                <div>
                  <h3 className="font-display text-lg sm:text-xl text-[#14161F]">
                    {step.heading}
                  </h3>
                  <p className="mt-2 text-sm text-[#14161F]/70 leading-relaxed max-w-xl">
                    {step.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          className="rounded-xl border border-[#262A3C] bg-[#12141D] overflow-hidden shadow-sm"
          aria-hidden="true"
        >
          <div className="flex items-center gap-2 px-4 py-3 bg-[#0E1018] border-b border-[#23273A]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#E0685F]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#E2B04A]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#5BBF7B]" />
            <span className="ml-2 font-mono text-[11px] text-[#8A92A8]">
              codesit — setup
            </span>
          </div>
          <div className="p-5 font-mono text-[11px] sm:text-[12.5px] leading-[1.9] overflow-x-auto">
            <p className="whitespace-nowrap">
              <span className="text-[#0D9488]">$</span>{' '}
              <span className="text-[#CDD3E6]">npm install</span>
            </p>
            <p className="whitespace-nowrap">
              <span className="text-[#0D9488]">$</span>{' '}
              <span className="text-[#CDD3E6]">npm start</span>
            </p>
            <p className="whitespace-nowrap">
              <span className="text-[#5C6478]">
                # CodeSit is running → http://localhost:3000
              </span>
            </p>
            <p>&nbsp;</p>
            <p className="whitespace-nowrap">
              <span className="text-[#5C6478]">
                # optional: your own execution engine
              </span>
            </p>
            <p className="whitespace-nowrap">
              <span className="text-[#0D9488]">$</span>{' '}
              <span className="text-[#CDD3E6]">
                docker run -d -p 2000:2000 --privileged \
              </span>
            </p>
            <p className="whitespace-nowrap">
              <span className="text-[#CDD3E6] pl-4">
                ghcr.io/engineer-man/piston
              </span>
            </p>
          </div>
        </div>
      </div>
    </SectionShell>
  )
}
