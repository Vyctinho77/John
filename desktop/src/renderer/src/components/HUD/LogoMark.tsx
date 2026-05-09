interface LogoMarkProps {
  className?: string
}

export function LogoMark({ className }: LogoMarkProps) {
  return (
    <svg
      className={className}
      width="28"
      height="24"
      viewBox="0 0 28 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M7.91209 24H0L5.93407 13.8462H13.7143L7.91209 24Z" fill="currentColor" />
      <path d="M27.6923 24H19.7802L9.75531 6.85714L13.7143 0L27.6923 24Z" fill="currentColor" />
    </svg>
  )
}
