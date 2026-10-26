import type { IPersonConfig } from '@/types/storeType'
import { onMounted, onUnmounted } from 'vue'

type PersonAddedPayload = IPersonConfig

export function usePersonRealtime(
  onPersonAdded: (p: PersonAddedPayload) => void
) {
  let es: EventSource | null = null

  const connect = () => {
    if (es) return // 防止重复连接

    const url = `/api/sse/person?token=${encodeURIComponent("admin-secret")}`

    try {
      // 跨域 Cookie 鉴权时可用 { withCredentials: true }
      es = new EventSource(url)
    } catch (e) {
      console.error('创建 SSE 连接失败', e)
      es = null
      return
    }

    es.addEventListener('open', () => {
      // 可在这里更新连接状态
    })

    es.addEventListener('PERSON_ADDED', (event) => {
      let data: PersonAddedPayload

      try {
        data = JSON.parse((event as MessageEvent).data)
      } catch (e) {
        console.warn('SSE 人员数据解析失败', (event as MessageEvent).data, e)
        return
      }

      try {
        onPersonAdded(data)
      } catch (e) {
        console.error('处理 PERSON_ADDED 回调失败', e)
      }
    })

    es.onerror = (err) => {
      console.error('SSE 连接出错', err)
      // 如果需要 token 刷新/手动重建，可在这里根据 es?.readyState 处理
    }
  }

  const close = () => {
    es?.close()
    es = null
  }

  onMounted(connect)
  onUnmounted(close)

  return { connect, close }
}