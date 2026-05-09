import { mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

export function getLocalUserDataPath(fileName: string): string {
  const baseDir = process.env.JOHN_USER_DATA_DIR
    ?? join(process.env.APPDATA ?? process.env.LOCALAPPDATA ?? tmpdir(), 'John')

  mkdirSync(baseDir, { recursive: true })
  return join(baseDir, fileName)
}
