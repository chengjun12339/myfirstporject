import { randomUUID } from 'node:crypto'

// uid -> person
const persons = new Map()
// id (UUID) -> person
const idIndex = new Map()
// 按 createTime 升序维护一份，方便全量接口
let sortedList = []

let currentDay = ''
let seq = 0

function pad(n) {
  return String(n).padStart(2, '0')
}

export function formatTime(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
    + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// 生成 uid：P + yyyyMMdd + 4 位当天序号
export function nextUid() {
  const now = new Date()
  const day = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  if (day !== currentDay) {
    currentDay = day
    seq = 0
  }
  seq++
  return `P${day}${String(seq).padStart(4, '0')}`
}

export function addPerson(input) {
  const now = formatTime()
  const person = {
    id: randomUUID(),
    uid: nextUid(),
    name: input.name,
    department: input.department,
    identity: input.identity,
    avatar: input.avatar ?? '',
    isWin: false,
    prizeName: [],
    prizeTime: [],
    prizeId: [],
    createTime: now,
    updateTime: now,
  }
  persons.set(person.uid, person)
  idIndex.set(person.id, person)   // ← 新增：维护 id 索引
  sortedList.push(person)
  return person
}

export function getPersonByUid(uid) {
  return persons.get(uid) ?? null
}

// 新增：按 id（UUID）查人
export function getPersonById(id) {
  return idIndex.get(id) ?? null
}

export function listAllPersons() {
  return sortedList.slice()
}

// ---------- 抽奖相关 ----------
const lotteryResults = []           // 或持久化到文件/DB
const processedRoundIds = new Set() // 幂等用

export function addLotteryResult(record) {
  lotteryResults.push(record)
  return record
}

export function listLotteryResults() {
  return lotteryResults
}

export function hasProcessedRound(roundId) {
  return processedRoundIds.has(roundId)
}

export function markRoundProcessed(roundId) {
  processedRoundIds.add(roundId)
}

export function markPersonWin(uid, prize) {
  const person = persons.get(uid)
  if (!person) return null

  person.isWin = true
  person.prizeName.push(prize.name)
  person.prizeTime.push(formatTime())
  person.prizeId.push(prize.id)
  person.updateTime = formatTime()

  return person
}

// ---------- 删除人员 ----------
/**
 * 按 id（UUID，前后端唯一主键）删除人员
 * @param {string} id
 * @returns {object|null} 删除成功返回被删对象，不存在返回 null
 */
export function deletePersonById(id) {
  const person = idIndex.get(id)
  if (!person) return null

  idIndex.delete(id)
  persons.delete(person.uid)
  sortedList = sortedList.filter(p => p.id !== id)   // sortedList 是 let，重新赋值更安全

  return person
}