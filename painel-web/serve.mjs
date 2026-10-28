// Servidor "sempre ligado" do painel: serve o build (dist/) e repassa /api e
// /health pro backend — o mesmo papel do proxy do Vite, sem precisar do dev
// server. Zero dependência (só node:http). Sobe pelo supervisor.vbs no login.
//
// Rebuild (npm run build) não precisa reiniciar: os arquivos são lidos do disco
// a cada request e o index.html vai sem cache.
import http from 'node:http'
import { appendFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 5178
const HOST = '127.0.0.1'
const BACKEND = new URL('http://147.15.7.119:8000') // mesmo do vite.config.ts
const ROOT = dirname(fileURLToPath(import.meta.url))
const DIST = join(ROOT, 'dist')
const LOG = join(ROOT, 'serve.log')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

// Log abre/fecha o arquivo a cada linha: duas instâncias (a segunda só pra
// descobrir que a porta tá ocupada) não brigam pelo arquivo.
const log = (...a) => {
  const line = [new Date().toISOString(), ...a].join(' ')
  console.log(line)
  try {
    appendFileSync(LOG, line + '\n')
  } catch {}
}

function proxy(req, res) {
  const up = http.request(
    {
      host: BACKEND.hostname,
      port: BACKEND.port,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: BACKEND.host },
      timeout: 100_000, // chat espera até 95s no front
    },
    (r) => {
      res.writeHead(r.statusCode || 502, r.headers)
      r.pipe(res)
    },
  )
  up.on('timeout', () => up.destroy(new Error('timeout')))
  up.on('error', (e) => {
    log('proxy', req.method, req.url, e.message)
    if (res.headersSent) return res.destroy()
    res.writeHead(502, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ detail: 'Backend fora do ar', code: 'BAD_GATEWAY' }))
  })
  req.pipe(up)
}

async function estatico(req, res) {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  const file = normalize(join(DIST, path))
  if (!file.startsWith(DIST)) return res.writeHead(403).end()
  try {
    const body = await readFile(file)
    const imutavel = path.startsWith('/assets/') // nome com hash
    res.writeHead(200, {
      'content-type': MIME[extname(file)] || 'application/octet-stream',
      'cache-control': imutavel ? 'public, max-age=31536000, immutable' : 'no-cache',
    })
    res.end(body)
  } catch {
    // Rota do SPA (/chat, /calendario...) → index.html; arquivo com extensão → 404.
    if (extname(path)) return res.writeHead(404).end()
    try {
      const html = await readFile(join(DIST, 'index.html'))
      res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-cache' })
      res.end(html)
    } catch {
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('Painel sem build. Rode: npm run build')
    }
  }
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/') || req.url === '/health') return proxy(req, res)
  estatico(req, res).catch((e) => {
    log('static', req.url, e.message)
    if (!res.headersSent) res.writeHead(500).end()
  })
})

server.on('error', (e) => {
  // Porta ocupada = outra instância já está no ar → sai com 3 (o supervisor.vbs
  // entende como "já tem um rodando" e não fica tentando de novo).
  if (e.code === 'EADDRINUSE') {
    log(`porta ${PORT} ocupada — outra instância no ar`)
    process.exit(3)
  }
  log('server', e.message)
  process.exit(1)
})
process.on('uncaughtException', (e) => log('uncaught', e.stack || e.message))

server.listen(PORT, HOST, () => log(`painel no ar: http://quase-nada-lembretes.localhost:${PORT}`))
