interface StageIconProps {
  className?: string
}

/** Stage 1 — compact pill bar */
export function StageCompactIcon({ className }: StageIconProps) {
  return (
    <svg
      className={className}
      width="30"
      height="5"
      viewBox="0 0 30 5"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ pointerEvents: 'none' }}
    >
      <rect width="29.7751" height="4.8284" rx="2.4142" fill="currentColor" />
    </svg>
  )
}

/** Stage 2 — intermediate chat window with code arrows */
export function StageIntermediateIcon({ className }: StageIconProps) {
  return (
    <svg
      className={className}
      width="34"
      height="22"
      viewBox="0 0 34 22"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ pointerEvents: 'none' }}
    >
      <rect x="1.20708" y="1.20708" width="31.3846" height="19.3136" rx="2.81657" stroke="currentColor" strokeWidth="2.4142" />
      <path d="M2.41418 15.2899H32.1893" stroke="currentColor" strokeWidth="2.4142" />
      <path d="M12.8757 6.43787L10.803 8.51065C10.6144 8.69921 10.6144 9.00493 10.803 9.19349L12.8757 11.2663" stroke="currentColor" strokeWidth="1.44852" />
      <path d="M20.9231 11.2662L22.9959 9.19345C23.1844 9.00489 23.1844 8.69918 22.9959 8.51061L20.9231 6.43783" stroke="currentColor" strokeWidth="1.44852" />
    </svg>
  )
}

/** Stage 3 — expanded fullscreen corners */
export function StageExpandedIcon({ className }: StageIconProps) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ pointerEvents: 'none' }}
    >
      <path
        d="M6.95289 1.20715H2.81656C1.92768 1.20715 1.20709 1.92774 1.20709 2.81662V7.20644M6.95289 18.1066H2.81656C1.92767 18.1066 1.20709 17.386 1.20709 16.4971V11.7693M12.5297 1.20715H16.497C17.3859 1.20715 18.1065 1.92774 18.1065 2.81662V7.20644M12.5297 18.1066H16.497C17.3859 18.1066 18.1065 17.386 18.1065 16.4971V11.7693"
        stroke="currentColor"
        strokeWidth="2.4142"
      />
    </svg>
  )
}
