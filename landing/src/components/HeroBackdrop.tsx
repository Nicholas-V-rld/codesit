export function HeroBackdrop() {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      <svg
        className="w-full h-full"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="cs-cells"
            width="72"
            height="72"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M72 0H0v72"
              fill="none"
              stroke="#14161F"
              strokeOpacity="0.05"
              strokeWidth="1"
            />
          </pattern>
          <radialGradient id="cs-fade" cx="50%" cy="38%" r="68%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
            <stop offset="62%" stopColor="#FFFFFF" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="1" />
          </radialGradient>
        </defs>

        <rect width="1440" height="900" fill="#FFFFFF" />
        <rect width="1440" height="900" fill="url(#cs-cells)" />

        {/* Lit cells — one lecturer's scope, echoing the access section */}
        <g fill="#14161F" fillOpacity="0.055">
          <rect x="504" y="360" width="72" height="72" />
          <rect x="504" y="432" width="72" height="72" />
          <rect x="576" y="360" width="72" height="72" />
          <rect x="576" y="432" width="72" height="72" />
        </g>

        {/* Two teal markers, matching the "allowed" signal */}
        <g fill="#0D9488" fillOpacity="0.5">
          <circle cx="540" cy="396" r="3" />
          <circle cx="612" cy="468" r="3" />
        </g>

        {/* Oversized prompt caret, bottom-right, mostly cropped */}
        <g fill="#14161F" fillOpacity="0.035">
          <path d="M1088 300 L1168 300 L1296 460 L1168 620 L1088 620 L1216 460 Z" />
          <rect x="1224" y="556" width="112" height="64" />
        </g>

        <rect width="1440" height="900" fill="url(#cs-fade)" />
      </svg>
    </div>
  )
}
