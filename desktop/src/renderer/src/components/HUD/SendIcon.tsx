interface SendIconProps {
  className?: string
}

export function SendIcon({ className }: SendIconProps) {
  return (
    <svg
      width="37"
      height="30"
      viewBox="0 0 37 30"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M32.768 0.900816C34.638 0.620378 35.8829 2.77651 34.705 4.25582L15.7354 28.0811C14.5085 29.6217 12.0264 28.7546 12.0249 26.7851L12.0155 15.31C12.0153 15.1919 11.9522 15.0825 11.85 15.0233L1.91694 9.27773C0.212152 8.29163 0.702715 5.70932 2.65039 5.41724L32.768 0.900816Z"
        stroke="currentColor"
        strokeWidth="1.75005"
      />
    </svg>
  )
}
