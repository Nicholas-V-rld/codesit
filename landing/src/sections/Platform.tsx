import { EditorGlyph } from '../components/EditorGlyph'
import {
  BodyCopy,
  SectionEyebrow,
  SectionHeading,
  SectionShell,
} from '../components/Section'

const ROWS = [
  {
    num: '01',
    heading: 'A real editor, in the browser',
    body: 'The same editor engine as VS Code — syntax highlighting, familiar shortcuts. Python, JavaScript, Java, C, C++, and a live preview for HTML.',
  },
  {
    num: '02',
    heading: 'Run before you submit',
    body: 'Students execute their code and see the output, so nobody hands in something they never tested.',
  },
  {
    num: '03',
    heading: 'Re-run to verify',
    body: "Lecturers open any submission and run the student's exact code. No trusting a screenshot, no copying files around.",
  },
  {
    num: '04',
    heading: 'Stored and timestamped',
    body: 'Every submission is kept with its language, output and submission time, and stays reviewable after the exam.',
  },
] as const

export function Platform() {
  return (
    <SectionShell id="platform" className="bg-white">
      <div className="md:hidden mb-10">
        <EditorGlyph />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,380px)_1fr] gap-12 md:gap-16">
        <div className="md:sticky md:top-28 md:self-start">
          <SectionEyebrow>THE PLATFORM</SectionEyebrow>
          <SectionHeading className="mt-3">
            One workspace,{' '}
            <br className="hidden sm:block" />
            two points of view
          </SectionHeading>
          <BodyCopy className="mt-5 max-w-sm">
            Students get an editor that runs their code. Lecturers get a review
            desk scoped to exactly the students they teach. Same platform,
            different door.
          </BodyCopy>
          <div className="mt-12 hidden md:block">
            <EditorGlyph />
          </div>
        </div>

        <div className="divide-y divide-gray-200">
          {ROWS.map((row, i) => (
            <div
              key={row.num}
              className={`flex gap-5 sm:gap-8 pb-7 ${i === 0 ? 'pt-0' : 'pt-7'}`}
            >
              <span className="font-mono text-sm text-[#14161F]/35 pt-1 shrink-0 w-8">
                {row.num}
              </span>
              <div>
                <h3 className="font-display text-lg sm:text-xl text-[#14161F]">
                  {row.heading}
                </h3>
                <p className="mt-2 text-[15px] md:text-base text-[#14161F]/70 leading-relaxed max-w-xl">
                  {row.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SectionShell>
  )
}
