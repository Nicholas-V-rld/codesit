import {
  SectionEyebrow,
  SectionHeading,
  SectionShell,
} from '../components/Section'

const ITEMS = [
  {
    heading: 'Scoping on the server',
    body: 'Who sees what is decided inside the database query from the logged-in identity. It cannot be bypassed from the browser.',
  },
  {
    heading: 'Passwords are hashed',
    body: 'Stored with bcrypt, never as plain text, and never written to logs.',
  },
  {
    heading: 'Isolated execution',
    body: "Untrusted student code runs on a sandboxed engine, not on your machine, so a bad program can't reach your data.",
  },
  {
    heading: 'Your infrastructure',
    body: 'Run CodeSit and its execution engine entirely on your own hardware. Your exams stay on your network.',
  },
] as const

function ScopeMark() {
  return (
    <svg
      viewBox="0 0 32 32"
      className="w-7 h-auto"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="1.25"
        y="1.25"
        width="9.5"
        height="9.5"
        rx="2"
        stroke="#FFFFFF"
        strokeOpacity="0.25"
      />
      <rect
        x="1.25"
        y="21.25"
        width="9.5"
        height="9.5"
        rx="2"
        stroke="#FFFFFF"
        strokeOpacity="0.25"
      />
      <rect
        x="21.25"
        y="21.25"
        width="9.5"
        height="9.5"
        rx="2"
        stroke="#FFFFFF"
        strokeOpacity="0.25"
      />
      <rect
        x="21"
        y="1"
        width="10"
        height="10"
        rx="2"
        fill="#FFFFFF"
        fillOpacity="0.08"
        stroke="#0D9488"
      />
      <circle cx="26" cy="6" r="1.75" fill="#0D9488" />
    </svg>
  )
}

export function Security() {
  return (
    <SectionShell id="security" className="bg-[#14161F] text-white">
      <ScopeMark />
      <SectionEyebrow className="!text-white/40 mt-4">TRUST & SAFETY</SectionEyebrow>
      <SectionHeading className="mt-3 !text-white">
        Built so a department{' '}
        <br className="hidden sm:block" />
        can say yes.
      </SectionHeading>
      <p className="mt-5 max-w-xl text-[15px] md:text-base text-white/60 leading-relaxed">
        Two things a school will ask about: whether the wrong lecturer can see
        the wrong students, and whether student code can touch your server.
        Neither can happen.
      </p>

      <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-x-14">
        {ITEMS.map((item) => (
          <div
            key={item.heading}
            className="border-t border-white/10 py-7 flex flex-col"
          >
            <h3 className="font-display text-lg text-white">{item.heading}</h3>
            <p className="mt-2 text-sm text-white/60 leading-relaxed">
              {item.body}
            </p>
          </div>
        ))}
      </div>
    </SectionShell>
  )
}
