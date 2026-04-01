import { execFile } from 'child_process'

const ACTIVE_WINDOW_SCRIPT = `
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class Win32ActiveWindow {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
"@
$handle = [Win32ActiveWindow]::GetForegroundWindow()
if ($handle -eq [IntPtr]::Zero) { return }
$builder = New-Object System.Text.StringBuilder 1024
[void][Win32ActiveWindow]::GetWindowText($handle, $builder, $builder.Capacity)
$title = $builder.ToString().Trim()
if ($title) { Write-Output $title }
`

export async function getActiveWindowTitle(): Promise<string | null> {
  if (process.platform !== 'win32') return null

  return new Promise(resolve => {
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', ACTIVE_WINDOW_SCRIPT],
      { windowsHide: true, timeout: 1500 },
      (error, stdout) => {
        if (error) {
          resolve(null)
          return
        }

        const title = stdout.trim()
        resolve(title || null)
      }
    )
  })
}

export function normalizeWindowTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
