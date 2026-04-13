import http from 'http'

const CALLBACK_PORT = 1455

export function waitForCallback(expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:${CALLBACK_PORT}`)
      const code  = url.searchParams.get('code')
      const error = url.searchParams.get('error')
      const state = url.searchParams.get('state')

      const stateOk = state === expectedState

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`
        <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0a0a0a;color:#fff">
          <h2>${error || !stateOk ? 'Erro na autenticação' : 'John conectado!'}</h2>
          <p>Pode fechar esta janela.</p>
          <script>window.close()</script>
        </body></html>
      `)

      server.close()

      if (error) reject(new Error(error))
      else if (!stateOk) reject(new Error('State inválido — possível ataque CSRF'))
      else if (code) resolve(code)
      else reject(new Error('Nenhum code recebido'))
    })

    server.listen(CALLBACK_PORT, '127.0.0.1')
    server.on('error', reject)

    // Timeout de 5 minutos
    setTimeout(() => {
      server.close()
      reject(new Error('Timeout: login não completado em 5 minutos'))
    }, 5 * 60 * 1000)
  })
}
