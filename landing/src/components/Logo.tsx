type LogoProps = {
  className?: string
}

export function Logo({ className = 'w-6 h-6 text-[#14161F]' }: LogoProps) {
  return (
    <svg
      viewBox="0 0 256 256"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M 48 48 L 88 48 L 152 128 L 88 208 L 48 208 L 112 128 Z" />
      <path
        d="M 168 176 L 224 176 L 224 208 L 168 208 Z"
        fill="#0D9488"
      />
    </svg>
  )
}
