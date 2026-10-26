// src/api/lottery.ts
import request from './request'

export interface LotteryWinner {
  uid: string
  name: string
  department: string
}

export interface SubmitLotteryResultParams {
  prizeId: string | number
  prizeName: string
  count: number
  winners: LotteryWinner[]
  isUsedCount: number
  isUsed: boolean
}

export function submitLotteryResult(data: SubmitLotteryResultParams) {
  return request<{ status: string }>({
    url: '/lottery/result',
    method: 'POST',
    data,
  })
}

export interface DeletePersonParams {
  id: number
}

export function deletePerson(data: DeletePersonParams) {
  return request<{ status: string }>({
    url: '/person/delete',
    method: 'POST',
    headers:{
      Authorization:"Bearer admin-secret"
    },
    data,
  })
}