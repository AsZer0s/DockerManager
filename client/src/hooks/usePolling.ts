import { useEffect, useCallback } from 'react'
import { useAuthStore } from '@/stores/authStore'
import pollingService from '@/services/pollingService'

export const usePolling = (subscriptions: string[] = []) => {
  const { isAuthenticated, token } = useAuthStore()

  const startPolling = useCallback(async () => {
    if (isAuthenticated && token) {
      try {
        await pollingService.startPolling(subscriptions)
      } catch (error) {
        console.error('启动轮询失败:', error)
      }
    }
  }, [isAuthenticated, token, subscriptions])

  const stopPolling = useCallback(async () => {
    await pollingService.stopPolling()
  }, [])

  const subscribe = useCallback((key: string, callback: (data: any) => void) => {
    pollingService.subscribe(key, callback)
  }, [])

  const unsubscribe = useCallback((key: string) => {
    pollingService.unsubscribe(key)
  }, [])

  const refresh = useCallback(async () => {
    await pollingService.refresh()
  }, [])

  useEffect(() => {
    if (isAuthenticated && token) {
      startPolling()
    }

    return () => {
      stopPolling()
    }
  }, [isAuthenticated, token, startPolling, stopPolling])

  return {
    pollingService,
    startPolling,
    stopPolling,
    subscribe,
    unsubscribe,
    refresh,
    isPolling: pollingService.getStatus().isPolling
  }
}
