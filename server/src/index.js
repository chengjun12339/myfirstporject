import http from 'node:http'
import os from 'node:os'
import cors from 'cors'
import express from 'express'
import { addPerson, getPersonByUid,getPersonById, listAllPersons,deletePersonById } from './store.js'
import { attachWebSocket } from './ws.js'   // ← 新增
import { addLotteryResult, listLotteryResults, hasProcessedRound, markRoundProcessed,markPersonWin } from './store.js'

const PORT = Number(process.env.PORT ?? 3000)
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? 'admin-secret'
const ACTIVITY_TOKEN = process.env.ACTIVITY_TOKEN ?? ''

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

// ---------- SSE 客户端管理 ----------
const sseClients = new Set()

function broadcastSSE(personData) {
  const message = `event: PERSON_ADDED\ndata: ${JSON.stringify(personData)}\n\n`
  for (const client of sseClients) {
    try {
      client.write(message)
    } catch {
      sseClients.delete(client)   // 写失败说明连接已坏，清掉
    }
  }
}

const heartbeat = setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(`: ping\n\n`)
    } catch {
      sseClients.delete(client)
    }
  }
}, 30000)

// ---------- 路由配置 ----------
app.get('/api/sse/person', (req, res) => {
  const token = req.query.token
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ code: 40100, message: '未授权' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // 如果前面有 Nginx，禁用缓冲
  res.flushHeaders()

  sseClients.add(res)
  res.write(`: connected\n\n`)

  req.on('close', () => {
    sseClients.delete(res)
  })
})

app.post('/api/participant/register', (req, res) => {
  const name = String(req.body.name ?? '').trim()
  if (!name) return res.status(400).json({ code: 40000, message: '姓名不能为空' })

  const person = addPerson(req.body)
  broadcastSSE(person)
  res.status(201).json({ code: 0, message: 'ok', data: person })
})
// 查询参会人员信息 + 获奖情况
app.get('/api/participant/info', (req, res) => {
  const id = String(req.query.id ?? '').trim()
  if (!id) {
    return res.status(400).json({ code: 40000, message: '缺少 id 参数' })
  }

  const person = getPersonById(id)
  if (!person) {
    return res.status(404).json({ code: 40400, message: '未找到该人员' })
  }

  // 把 prizeId / prizeName / prizeTime 三个平行数组合并成结构化列表
  const prizes = person.prizeId.map((pid, i) => ({
    prizeId:   pid,
    prizeName: person.prizeName[i] ?? '',
    prizeTime: person.prizeTime[i] ?? '',
  }))

  res.json({
    code: 0,
    message: 'ok',
    data: {
      id: person.id,
      uid: person.uid,
      name: person.name,
      department: person.department,
      identity: person.identity,
      avatar: person.avatar,
      isWin: person.isWin,
      prizeCount: prizes.length,
      prizes,                 // [{ prizeId, prizeName, prizeTime }, ...]
      createTime: person.createTime,
      updateTime: person.updateTime,
    },
  })
})
app.get('/api/admin/person/list', (req, res) => {
  const auth = req.headers.authorization ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (token !== ADMIN_TOKEN) return res.status(401).json({ code: 40100, message: '未授权' })

  res.json({ code: 0, data: listAllPersons() })
})

// ---------- 启动 ----------
const server = http.createServer(app)

// 关键：把 WebSocket 挂到同一个 server 上
attachWebSocket(server, { adminToken: ADMIN_TOKEN })

// 显式监听 0.0.0.0（和不写 host 效果一样，但意图更明确）
server.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP Server listening on 0.0.0.0:${PORT}`)

  const ips = []
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets ?? []) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address)
    }
  }

  if (ips.length === 0) {
    console.log(`  本机: http://localhost:${PORT}`)
  } else {
    for (const ip of ips) {
      console.log(`  局域网: http://${ip}:${PORT}`)
      console.log(`    SSE:  http://${ip}:${PORT}/api/sse/person?token=${ADMIN_TOKEN}`)
      console.log(`    WS:   ws://${ip}:${PORT}/ws/admin?token=${ADMIN_TOKEN}`)
    }
  }
})


// 提交中奖结果
app.post('/api/lottery/result', (req, res) => {
  // 鉴权：抽奖是敏感操作，建议用 ADMIN_TOKEN
  const auth = req.headers.authorization ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (token !== ADMIN_TOKEN && token !== ACTIVITY_TOKEN) {
    return res.status(401).json({ code: 40100, message: '未授权' })
  }

  const { prizeId, prizeName, count, winners, isUsedCount, isUsed, roundId } = req.body ?? {}

  // 参数校验
  if (!prizeId || !prizeName || !Array.isArray(winners) || winners.length === 0) {
    return res.status(400).json({ code: 40000, message: '参数不合法' })
  }
  if (typeof isUsedCount !== 'number' || typeof isUsed !== 'boolean') {
    return res.status(400).json({ code: 40000, message: '参数不合法' })
  }
  for (const w of winners) {
    if (!w.uid || !w.name || !w.department) {
      return res.status(400).json({ code: 40000, message: '中奖者信息不完整' })
    }
  }

  // 幂等：优先用前端传的 roundId，没有就用 prizeId + isUsedCount 兜底
  const idempotencyKey = roundId || `${prizeId}:${isUsedCount}`
  if (hasProcessedRound(idempotencyKey)) {
    return res.json({ code: 0, message: 'ok', data: { duplicated: true } })
  }

  const record = {
    recordId: `${prizeId}-${Date.now()}`,
    roundId: idempotencyKey,
    prizeId,
    prizeName,
    count,
    winners,
    isUsedCount,
    isUsed,
    submittedAt: new Date().toISOString(),
  }

  addLotteryResult(record)
  markRoundProcessed(idempotencyKey)
  // 更新人员中奖信息
  const updatedPersons = []
  for (const w of winners) {
    const updated = markPersonWin(w.uid, { id: prizeId, name: prizeName })
    if (updated) updatedPersons.push(updated)
  }

  // 广播给大屏/其他页面，让人员列表刷新
  for (const person of updatedPersons) {
    broadcastSSE(person)
  }
  // 可选：广播给大屏/其他页面
  broadcastSSE({ event: 'LOTTERY_RESULT', record })

  res.status(201).json({ code: 0, message: 'ok', data: record })
})

// 删除参会人员（按 id，前后端唯一主键）
app.post('/api/person/delete', (req, res) => {
  // 鉴权：删除是敏感操作，必须 ADMIN_TOKEN
  const auth = req.headers.authorization ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ code: 40100, message: '未授权' })
  }

  const id = String(req.body?.id ?? '').trim()
  if (!id) {
    return res.status(400).json({ code: 40000, message: '缺少 id 参数' })
  }

  const deleted = deletePersonById(id)
  if (!deleted) {
    return res.status(404).json({ code: 40400, message: '人员不存在' })
  }

  // 广播给大屏/其他页面，让列表刷新（沿用现有 broadcastSSE，事件名统一为 PERSON_ADDED，data 里带 event 区分）
  broadcastSSE({ event: 'PERSON_DELETED', id })

  res.json({ code: 0, message: 'ok', data: { id } })
})

// 可选：查询中奖记录
app.get('/api/lottery/results', (req, res) => {
  const auth = req.headers.authorization ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ code: 40100, message: '未授权' })
  }
  res.json({ code: 0, data: listLotteryResults() })
})

// 进程退出时清理心跳（可选，但更规范）
process.on('SIGINT', () => {
  clearInterval(heartbeat)
  server.close(() => process.exit(0))
})