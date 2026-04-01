interface LogoMarkProps {
  className?: string
}

export function LogoMark({ className }: LogoMarkProps) {
  return (
    <svg
      className={className}
      width="11"
      height="26"
      viewBox="0 0 11 26"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M3.31909 6.03687H10.5106V21.0212C10.5106 23.7709 8.28153 25.9999 5.53186 25.9999H3.31909V6.03687Z" fill="currentColor" />
      <rect x="3.31909" width="7.19149" height="4.3905" fill="currentColor" />
      <rect y="19.3618" width="3.87234" height="6.6383" fill="currentColor" />
    </svg>
  )
}
