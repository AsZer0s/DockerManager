import { useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { websocketService } from '@/services/websocket'

export const useWebSocket = () => {
  const { isAuthenticated, token } = useAuthStore()

  useEffect(() => {
    if (isAuthenticated && token) {
      // 连接 WebSocket
      websocketService.connect(token)

      // 清理函数
      return () => {
        websocketService.disconnect()
      }
    }
  }, [isAuthenticated, token])

  return websocketService
}
