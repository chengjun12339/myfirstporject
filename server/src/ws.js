import { WebSocketServer, WebSocket } from 'ws'

const clients = new Set()
let wss = null

function parseUrl(req) {
  return new URL(req.url, 'http://localhost')
}

export function attachWebSocket(server, { adminToken }) {
  wss = new WebSocketServer({ noServer: true })

  // 手动处理 upgrade，才能校验 /ws/admin 路径和 token
  server.on('upgrade', (req, socket, head) => {
    const url = parseUrl(req)
    if (url.pathname !== '/ws/admin') {
      socket.destroy()
      return
    }
    const token = url.searchParams.get('token')
    if (!token || token !== adminToken) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  })

  wss.on('connection', (ws) => {
    ws.isAlive = true
    clients.add(ws)

    ws.on('pong', () => {
      ws.isAlive = true
    })
    ws.on('close', () => {
      clients.delete(ws)
    })
    ws.on('error', () => {
      clients.delete(ws)
    })

    // 告诉前端连上了，可选
    ws.send(JSON.stringify({ type: 'CONNECTED' }))
  })

  // 心跳：30 秒 ping 一次，两次没 pong 就断开
  const heartbeat = setInterval(() => {
    for (const ws of clients) {
      if (ws.isAlive === false) {
        clients.delete(ws)
        ws.terminate()
        continue
      }
      ws.isAlive = false
      ws.ping()
    }
  }, 30_000)

  wss.on('close', () => clearInterval(heartbeat))
}

export function broadcast(message) {
  const payload = JSON.stringify(message)
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload)
    }
  }
}

export function clientCount() {
  return clients.size
}