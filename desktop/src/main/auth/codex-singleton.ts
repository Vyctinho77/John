import { CodexAuthManager } from './CodexAuthManager'
import { CodexClient } from './CodexClient'

// Singletons compartilhados entre index.ts e serviços do main process.
// CodexAuthManager.loadFromDisk() é seguro antes de app.ready pois
// app.getPath('userData') está disponível desde o início do processo.
export const codexAuth   = new CodexAuthManager()
export const codexClient = new CodexClient(codexAuth)
