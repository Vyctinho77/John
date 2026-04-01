import { systemPreferences, shell } from 'electron'

export type PermissionStatus = 'granted' | 'denied' | 'not-determined'

export async function checkScreenPermission(): Promise<PermissionStatus> {
  if (process.platform !== 'darwin') {
    // Windows and Linux don't have OS-level screen recording permission
    return 'granted'
  }

  const status = systemPreferences.getMediaAccessStatus('screen')

  if (status === 'granted') return 'granted'
  if (status === 'denied')  return 'denied'
  return 'not-determined'
}

export async function requestScreenPermission(): Promise<PermissionStatus> {
  if (process.platform !== 'darwin') return 'granted'

  const current = await checkScreenPermission()
  if (current === 'granted') return 'granted'

  if (current === 'denied') {
    // macOS doesn't have a programmatic way to re-request after denial.
    // Open System Preferences so the user can enable it manually.
    await shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
    )
    return 'denied'
  }

  // 'not-determined': trigger the permission prompt by attempting a capture
  // The first desktopCapturer.getSources call will surface the system dialog.
  return 'not-determined'
}
