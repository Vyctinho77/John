import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const shared = resolve('src/shared')

export default defineConfig(({ mode }) => {
  // Load .env file — all vars (no prefix filter)
  const env = loadEnv(mode, process.cwd(), '')

  // Only secrets needed by the main process go here.
  // They are injected as string literals at build time and are NOT
  // exposed to the renderer process.
  const mainDefine: Record<string, string> = {}
  if (env.ELEVENLABS_API_KEY) {
    mainDefine['process.env.ELEVENLABS_API_KEY'] = JSON.stringify(env.ELEVENLABS_API_KEY)
  }

  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      resolve: { alias: { '@shared': shared } },
      define: mainDefine
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
      resolve: { alias: { '@shared': shared } }
    },
    renderer: {
      resolve: {
        alias: {
          '@renderer': resolve('src/renderer/src'),
          '@shared': shared
        }
      },
      plugins: [react()]
    }
  }
})
