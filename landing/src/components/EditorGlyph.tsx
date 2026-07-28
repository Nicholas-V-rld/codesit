export function EditorGlyph() {
  return (
    <svg
      className="w-full max-w-[340px] h-auto"
      viewBox="0 0 340 210"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="0.5" y="0.5" width="339" height="209" rx="11" stroke="#E0E4EC" />
      <path d="M0 34h340" stroke="#E0E4EC" />
      <circle cx="20" cy="17.5" r="3.5" fill="#E0E4EC" />
      <circle cx="34" cy="17.5" r="3.5" fill="#E0E4EC" />
      <circle cx="48" cy="17.5" r="3.5" fill="#E0E4EC" />

      {/* gutter */}
      <path d="M34 34v176" stroke="#EEF1F6" />

      {/* code lines — length carries rhythm, not meaning */}
      <g stroke="#D6DAE4" strokeWidth="5" strokeLinecap="round">
        <path d="M50 56h84" />
        <path d="M50 76h132" />
        <path d="M62 96h96" />
        <path d="M62 116h148" />
        <path d="M50 136h58" />
      </g>

      {/* the run line, in accent */}
      <g strokeLinecap="round">
        <path d="M50 166h44" stroke="#0D9488" strokeWidth="5" />
        <path d="M104 166h72" stroke="#D6DAE4" strokeWidth="5" />
      </g>

      {/* caret */}
      <rect x="182" y="159" width="2.5" height="15" rx="1.25" fill="#0D9488" />
    </svg>
  )
}
