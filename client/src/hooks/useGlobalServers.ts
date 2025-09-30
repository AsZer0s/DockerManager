import { useQuery } from 'react-query'
import { serverAPI } from '@/services/api'

/**
 * 全局服务器状态管理Hook
 * 提供统一的服务器数据获取和缓存
 */
export const useGlobalServers = () => {
  return useQuery({
    queryKey: ['servers'],
    queryFn: () => serverAPI.getServers(),
    refetchInterval: 30000, // 30秒自动刷新
    refetchIntervalInBackground: true, // 后台也继续刷新
    staleTime: 0, // 数据立即过期，强制重新获取
    cacheTime: 5 * 60 * 1000, // 缓存5分钟
  })
}

export default useGlobalServers
