interface ProfileIconProps {
  className?: string
}

export function ProfileIcon({ className }: ProfileIconProps) {
  return (
    <svg
      className={className}
      width="27"
      height="29"
      viewBox="0 0 27 29"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M18.8032 28.3315H6.35243C3.2507 28.3315 0.937979 25.1624 2.64652 22.5736C3.87245 20.7161 5.44819 19.2502 7.84601 17.8421C9.30458 16.9855 10.9969 16.6392 12.6884 16.6392H12.9289C14.9171 16.6392 16.896 17.1283 18.5334 18.2561C20.2492 19.4381 21.5394 20.5837 22.5997 21.8402C24.8906 24.5548 22.3553 28.3315 18.8032 28.3315Z" fill="currentColor" />
      <circle cx="12.8168" cy="7.19531" r="7.19531" fill="currentColor" />
    </svg>
  )
}
