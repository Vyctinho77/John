import { CodexAuthManager } from './CodexAuthManager.ts'
import { CodexClient } from './CodexClient.ts'

// Singletons compartilhados entre index.ts e serviços do main process.
// CodexAuthManager.loadFromDisk() é seguro antes de app.ready pois
// app.getPath('userData') está disponível desde o início do processo.
export const codexAuth   = new CodexAuthManager()
export const codexClient = new CodexClient(codexAuth)
