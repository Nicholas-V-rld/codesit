import { useState } from 'react'
import {
  BodyCopy,
  SectionEyebrow,
  SectionHeading,
  SectionShell,
  focusRing,
} from '../components/Section'

const LECTURERS = {
  aluko: {
    name: 'Mr. Aluko',
    dept: 'Computer Science',
    levels: ['ND I', 'ND II'],
  },
  okoro: {
    name: 'Mrs. Okoro',
    dept: 'Computer Science',
    levels: ['HND I', 'HND II'],
  },
  musa: {
    name: 'Engr. Musa',
    dept: 'Computer Engineering',
    levels: ['ND I', 'ND II'],
  },
} as const

type LecturerKey = keyof typeof LECTURERS

const DEPARTMENTS = [
  'Computer Science',
  'Computer Engineering',
  'Electrical / Electronic',
] as const

const DEPT_ABBR = ['CS', 'CE', 'EE'] as const

const LEVELS = ['HND II', 'HND I', 'ND II', 'ND I'] as const

const STUDENTS = [
  { name: 'Chioma Obi', dept: 'Computer Science', level: 'ND I' },
  { name: 'Tunde Bakare', dept: 'Computer Science', level: 'ND II' },
  { name: 'Amaka Nwosu', dept: 'Computer Science', level: 'HND I' },
  { name: 'Khalid Abubakar', dept: 'Computer Science', level: 'HND II' },
  { name: 'Adeola Fashola', dept: 'Computer Engineering', level: 'ND II' },
] as const

function isAllowed(
  lecturer: (typeof LECTURERS)[LecturerKey],
  dept: string,
  level: string,
): boolean {
  return lecturer.dept === dept && lecturer.levels.includes(level as never)
}

export function AccessControl() {
  const [active, setActive] = useState<LecturerKey>('aluko')
  const lecturer = LECTURERS[active]

  const visibleCount = STUDENTS.filter((s) =>
    isAllowed(lecturer, s.dept, s.level),
  ).length

  return (
    <SectionShell
      id="access"
      className="bg-[#F7F8FA] border-y border-gray-200"
    >
      <div className="max-w-xl mx-auto text-center">
        <SectionEyebrow align="center">ACCESS CONTROL</SectionEyebrow>
        <SectionHeading className="mt-3">
          A lecturer sees their{' '}
          <br className="hidden sm:block" />
          column. Nothing else.
        </SectionHeading>
        <BodyCopy className="mt-5">
          Every student sits in one cell of the department × level grid. Every
          lecturer gets a department and the levels they teach. Pick a lecturer
          and watch what they can reach.
        </BodyCopy>
      </div>

      <div className="mt-14 md:mt-16 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,340px)] gap-10 md:gap-14 items-start">
        <div>
          <div
            className="flex gap-2 overflow-x-auto -mx-6 px-6 pb-1 mb-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:overflow-visible md:mx-0 md:px-0 md:flex-wrap"
            role="group"
            aria-label="Select lecturer"
          >
            {(Object.keys(LECTURERS) as LecturerKey[]).map((key) => {
              const isActive = active === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActive(key)}
                  aria-pressed={isActive}
                  className={`shrink-0 min-h-11 font-mono text-xs px-4 py-2 rounded-full border transition-all duration-200 ${focusRing} ${
                    isActive
                      ? 'border-[#14161F] bg-[#14161F] text-white'
                      : 'border-gray-200 bg-white text-[#14161F]/60 hover:border-[#14161F]/30'
                  }`}
                >
                  {LECTURERS[key].name}
                </button>
              )
            })}
          </div>

          <p className="sr-only">
            {lecturer.name} teaches {lecturer.levels.join(' and ')} in{' '}
            {lecturer.dept}.
          </p>

          <div className="max-w-[420px] mx-auto md:mx-0">
            <div
              className="grid grid-cols-[auto_repeat(3,auto)] gap-2 justify-start"
              aria-hidden="true"
            >
              <div />
              {DEPARTMENTS.map((dept, i) => (
                <div
                  key={dept}
                  className="font-mono text-[10px] sm:text-[11px] text-[#14161F]/50 text-center leading-[1.3] px-1 pb-1 min-h-[2.4em] flex items-end justify-center"
                >
                  <span className="hidden sm:inline">{dept}</span>
                  <span className="sm:hidden">{DEPT_ABBR[i]}</span>
                </div>
              ))}

              {LEVELS.map((level) => (
                <div key={level} className="contents">
                  <div className="font-mono text-[11px] text-[#14161F]/50 text-right pr-3 whitespace-nowrap self-center">
                    {level}
                  </div>
                  {DEPARTMENTS.map((dept) => {
                    const allowed = isAllowed(lecturer, dept, level)
                    return (
                      <div
                        key={`${dept}-${level}`}
                        className={`w-[clamp(46px,10vw,72px)] aspect-square rounded-lg border transition-all duration-200 flex items-center justify-center ${
                          allowed
                            ? 'bg-[#14161F] border-[#14161F]'
                            : 'bg-white border-gray-200'
                        }`}
                      >
                        {allowed ? (
                          <span className="block w-1.5 h-1.5 rounded-full bg-[#0D9488]" />
                        ) : (
                          <span className="block w-2 h-px bg-[#14161F]/20" />
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex items-center gap-2.5 font-mono text-[11px] text-[#14161F]/50">
            <span className="relative w-3 h-3 rounded bg-[#14161F] flex items-center justify-center shrink-0">
              <span className="w-1 h-1 rounded-full bg-[#0D9488]" />
            </span>
            <span>Visible to {lecturer.name}</span>
          </div>
        </div>

        <div>
          <SectionEyebrow>WHO THEY CAN SEE</SectionEyebrow>
          <ul className="mt-4 border-t border-gray-200 list-none m-0 p-0">
            {STUDENTS.map((student) => {
              const visible = isAllowed(lecturer, student.dept, student.level)
              return (
                <li
                  key={student.name}
                  className="flex items-center justify-between py-3.5 border-b border-gray-200 transition-all duration-200"
                >
                  <span className="flex items-center min-w-0">
                    <span
                      className={`w-1 h-1 rounded-full mr-3 shrink-0 ${
                        visible ? 'bg-[#0D9488]' : 'bg-[#14161F]/15'
                      }`}
                    />
                    <span
                      className={`text-sm ${
                        visible ? 'text-[#14161F]' : 'text-[#14161F]/35'
                      }`}
                    >
                      {student.name}
                    </span>
                  </span>
                  <span
                    className={`font-mono text-[11px] shrink-0 ${
                      visible ? 'text-[#14161F]/50' : 'text-[#14161F]/25'
                    }`}
                  >
                    {visible ? student.level : 'hidden'}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="mt-6 font-mono text-[11px] text-[#14161F]/50">
            {visibleCount} of 5 students in scope
          </p>
          <p className="mt-8 text-[15px] text-[#14161F]/70 leading-relaxed">
            The filter runs in the database query, built from whoever is logged
            in — not from anything the browser sends. There is no request a
            lecturer can craft to see outside their scope.
          </p>
        </div>
      </div>
    </SectionShell>
  )
}
