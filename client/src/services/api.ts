import axios, { AxiosInstance, AxiosResponse } from 'axios'
import toast from 'react-hot-toast'

// 根据当前域名自动检测API服务器地址
const apiBaseURL = import.meta.env.VITE_API_URL ? 
  `${import.meta.env.VITE_API_URL}/api` : 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3001/api' 
    : `${window.location.origin}/api`);

// 创建 axios 实例
const api: AxiosInstance = axios.create({
  baseURL: apiBaseURL,
  timeout: 60000, // 增加超时时间到60秒
  headers: {
    'Content-Type': 'application/json',
  },
  // 连接优化配置
  maxRedirects: 3,
  maxContentLength: 50 * 1024 * 1024, // 50MB
  maxBodyLength: 50 * 1024 * 1024, // 50MB
})

// 重试配置
const retryConfig = {
  retries: 3,
  retryDelay: (retryCount: number) => {
    return Math.min(1000 * Math.pow(2, retryCount), 10000) // 指数退避，最大10秒
  },
  retryCondition: (error: any) => {
    // 网络错误或5xx错误时重试
    return !error.response || (error.response.status >= 500 && error.response.status < 600)
  }
}

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    // 从 localStorage 获取 token
    const token = localStorage.getItem('auth-storage')
    if (token) {
      try {
        const authData = JSON.parse(token)
        if (authData.state?.token) {
          config.headers.Authorization = `Bearer ${authData.state.token}`
        }
      } catch (error) {
        // Token解析失败，静默处理
      }
    }
    
    // 添加重试配置
    ;(config as any).retry = retryConfig.retries
    ;(config as any).retryCount = 0
    ;(config as any).retryDelay = retryConfig.retryDelay
    
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
api.interceptors.response.use(
  (response: AxiosResponse) => {
    return response
  },
  async (error) => {
    const config = error.config
    
    // 重试逻辑
    if (config && retryConfig.retryCondition(error)) {
      const retryCount = (config as any).retryCount || 0
      
      if (retryCount < retryConfig.retries) {
        ;(config as any).retryCount = retryCount + 1
        
        // 等待重试延迟
        const delay = retryConfig.retryDelay((config as any).retryCount)
        // 请求失败，正在重试
        
        await new Promise(resolve => setTimeout(resolve, delay))
        
        // 重试请求
        return api(config)
      }
    }
    
    // 错误处理
    if (error.response) {
      const { status, data } = error.response
      
      switch (status) {
        case 401:
          // 未授权，清除本地存储并跳转到登录页
          localStorage.removeItem('auth-storage')
          window.location.href = '/login'
          toast.error('登录已过期，请重新登录')
          break
        case 403:
          toast.error(data.message || '权限不足')
          break
        case 404:
          toast.error(data.message || '资源不存在')
          break
        case 429:
          toast.error(data.message || '请求过于频繁，请稍后重试')
          break
        case 500:
          toast.error(data.message || '服务器内部错误')
          break
        case 502:
        case 503:
        case 504:
          toast.error('服务器暂时不可用，请稍后重试')
          break
        default:
          toast.error(data.message || '请求失败')
      }
    } else if (error.request) {
      // 网络错误
      if (error.code === 'ECONNABORTED') {
        toast.error('请求超时，请检查网络连接')
      } else if (error.code === 'NETWORK_ERROR') {
        toast.error('网络连接失败，请检查网络设置')
      } else {
        toast.error('网络连接失败，请检查网络设置')
      }
    } else {
      toast.error('请求配置错误')
    }
    
    return Promise.reject(error)
  }
)

// API 接口类型定义
export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  message: string
  user: {
    id: number
    username: string
    email: string
    role: 'admin' | 'user'
    telegramId?: number
  }
  token: string
}


export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

export interface UserProfile {
  id: number
  username: string
  email: string
  role: string
  telegramId?: number
  avatar?: string
  phone?: string
  bio?: string
  createdAt: string
  updatedAt: string
}

export interface SystemSettings {
  refreshInterval: number
  pageSize: number
  proxyEnabled: boolean
  proxyType: 'http' | 'socks5'
  proxyHost: string
  proxyPort: number
  proxyUsername?: string
  proxyPassword?: string
}

export interface NotificationSettings {
  emailNotifications: boolean
  telegramNotifications: boolean
  browserNotifications: boolean
  emailAddress: string
  telegramId: string
  containerEvents: boolean
  serverAlerts: boolean
  securityAlerts: boolean
  lowDiskSpace: boolean
  highCpuUsage: boolean
  highMemoryUsage: boolean
  alertThreshold: {
    cpu: number
    memory: number
    disk: number
  }
}

export interface DatabaseStats {
  totalSize: number
  usedSize: number
  freeSize: number
  tableCount: number
  recordCount: number
  lastBackup: string
  connectionStatus: 'connected' | 'disconnected' | 'error'
}

export interface TableInfo {
  name: string
  size: number
  records: number
  lastModified: string
  status: 'healthy' | 'warning' | 'error'
}

export interface Server {
  id: number
  name: string
  host: string
  port: number
  ssh_port?: number
  username: string
  password?: string
  private_key?: string
  description?: string
  is_active: boolean
  status?: string
  created_at: string
  updated_at: string
  created_by_name?: string
  user_count?: number
  can_view?: boolean
  can_control?: boolean
  can_ssh?: boolean
  hide_sensitive_info?: boolean
  // 代理配置
  proxy_enabled?: boolean
  proxy_host?: string
  proxy_port?: number
  proxy_username?: string
  proxy_password?: string
}

export interface Container {
  id: string
  name: string
  image: string
  status: string
  created: string
  ports: Array<{
    privatePort: number
    publicPort: number
    type: string
    ip?: string
  }>
  labels: Record<string, string>
  command: string
  sizeRw: number
  sizeRootFs: number
}

export interface MonitoringData {
  id: number
  server_id: number
  cpu_usage: number
  memory_usage: number
  memory_total: number
  memory_used: number
  disk_usage: number
  disk_total: number
  disk_used: number
  network_in: number
  network_out: number
  load_average: number
  uptime: number
  uptime_formatted?: string
  timestamp: string
}

// 认证相关 API
export const authAPI = {
  login: (data: LoginRequest): Promise<AxiosResponse<LoginResponse>> =>
    api.post('/auth/login', data),
    
    
  verify: (): Promise<AxiosResponse<{ valid: boolean; user: any }>> =>
    api.post('/auth/verify'),
    
  refresh: (): Promise<AxiosResponse<{ message: string; token: string }>> =>
    api.post('/auth/refresh'),
    
  logout: (): Promise<AxiosResponse<{ message: string }>> =>
    api.post('/auth/logout'),
    
  bindTelegram: (telegramId: number): Promise<AxiosResponse<{ message: string; telegramId: number }>> =>
    api.post('/auth/bind-telegram', { telegramId }),
    
  unbindTelegram: (): Promise<AxiosResponse<{ message: string }>> =>
    api.post('/auth/unbind-telegram'),
    
  changePassword: (data: ChangePasswordRequest): Promise<AxiosResponse<{ message: string }>> =>
    api.post('/auth/change-password', data),
}

// 设置相关 API
export const settingsAPI = {
  // 个人资料
  getProfile: (): Promise<AxiosResponse<{ user: UserProfile }>> =>
    api.get('/settings/profile'),
    
  updateProfile: (data: Partial<UserProfile>): Promise<AxiosResponse<{ message: string }>> =>
    api.put('/settings/profile', data),
  
  bindTelegram: (telegramId: number): Promise<AxiosResponse<{ message: string; telegramId: number }>> =>
    api.post('/settings/bind-telegram', { telegramId }),
    
  unbindTelegram: (): Promise<AxiosResponse<{ message: string }>> =>
    api.post('/settings/unbind-telegram'),

  // Telegram 验证码相关
  sendTelegramCode: (telegramId: string): Promise<AxiosResponse<{ success: boolean; message: string }>> =>
    api.post('/telegram-verification/send-code', { telegramId }),
    
  verifyTelegramCode: (telegramId: string, code: string): Promise<AxiosResponse<{ success: boolean; message: string }>> =>
    api.post('/telegram-verification/verify-code', { telegramId, code }),
    
  completeTelegramBinding: (telegramId: string, code: string, userId: number): Promise<AxiosResponse<{ success: boolean; message: string }>> =>
    api.post('/telegram-verification/complete-binding', { telegramId, code, userId }),
    
  getTelegramBindingStatus: (telegramId: string): Promise<AxiosResponse<{ success: boolean; data: { isVerified: boolean; verifiedAt?: string } }>> =>
    api.get(`/telegram-verification/binding-status/${telegramId}`),

  // Telegram 解绑验证码相关
  sendUnbindCode: (userId: number): Promise<AxiosResponse<{ success: boolean; message: string }>> =>
    api.post('/telegram-verification/send-unbind-code', { userId }),
    
  verifyUnbindCode: (userId: number, code: string): Promise<AxiosResponse<{ success: boolean; message: string }>> =>
    api.post('/telegram-verification/verify-unbind-code', { userId, code }),

  // 系统设置
  getSystemSettings: (): Promise<AxiosResponse<{ settings: SystemSettings }>> =>
    api.get('/settings/system'),
    
  updateSystemSettings: (settings: SystemSettings): Promise<AxiosResponse<{ message: string }>> =>
    api.put('/settings/system', { settings }),

  // 测试代理
  testProxy: (proxyConfig: any): Promise<AxiosResponse<{ result: string }>> =>
    api.post('/settings/test-proxy', proxyConfig),

  // 通知设置
  getNotificationSettings: (): Promise<AxiosResponse<{ settings: NotificationSettings }>> =>
    api.get('/settings/notifications'),
    
  updateNotificationSettings: (settings: NotificationSettings): Promise<AxiosResponse<{ message: string }>> =>
    api.put('/settings/notifications', { settings }),
    
  testNotification: (type: 'email' | 'telegram' | 'browser'): Promise<AxiosResponse<{ message: string }>> =>
    api.post('/settings/test-notification', { type }),

  // SMTP配置（管理员）
  getSMTPSettings: (): Promise<AxiosResponse<{ config: any }>> =>
    api.get('/settings/smtp'),
    
  updateSMTPSettings: (config: any): Promise<AxiosResponse<{ message: string }>> =>
    api.put('/settings/smtp', config),
    
  testSMTPConnection: (config: any): Promise<AxiosResponse<{ message: string }>> =>
    api.post('/settings/smtp/test', config),

  // 数据库设置（管理员）
  getDatabaseInfo: (): Promise<AxiosResponse<{ stats: DatabaseStats; tableInfo: TableInfo[] }>> =>
    api.get('/settings/database'),
    
  backupDatabase: (): Promise<AxiosResponse<{ message: string }>> =>
    api.post('/settings/database/backup'),
    
  cleanupDatabase: (retentionDays?: number): Promise<AxiosResponse<{ message: string }>> =>
    api.post('/settings/database/cleanup', { retentionDays }),
}

// 服务器相关 API
export const serverAPI = {
  getServers: (): Promise<AxiosResponse<{ servers: Server[]; total: number }>> =>
    api.get('/servers'),
    
  getServer: (id: number): Promise<AxiosResponse<{ server: Server }>> =>
    api.get(`/servers/${id}`),
    
  createServer: (data: Partial<Server>): Promise<AxiosResponse<{ message: string; server: Server }>> =>
    api.post('/servers', data),
    
  updateServer: (id: number, data: Partial<Server>): Promise<AxiosResponse<{ message: string; server: Server }>> =>
    api.put(`/servers/${id}`, data),
    
  deleteServer: (id: number): Promise<AxiosResponse<{ message: string }>> =>
    api.delete(`/servers/${id}`),
    
  testConnection: (id: number): Promise<AxiosResponse<{ success: boolean; message: string; error?: string }>> =>
    api.post(`/servers/${id}/test-connection`),
    
  getServerContainers: (id: number): Promise<AxiosResponse<{ serverId: number; containers: Container[]; total: number }>> =>
    api.get(`/servers/${id}/containers`),
    
  getVersion: (): Promise<AxiosResponse<{ success: boolean; version: string; name: string; description: string }>> =>
    api.get('/system/version'),
}

// 网络监控相关 API
export const networkAPI = {
  getNetworkSpeed: (): Promise<AxiosResponse<{ success: boolean; data: any }>> =>
    api.get('/network/speed'),
    
  getNetworkStatus: (): Promise<AxiosResponse<{ success: boolean; data: any }>> =>
    api.get('/network/status'),
    
  startNetworkMonitoring: (): Promise<AxiosResponse<{ success: boolean; message: string }>> =>
    api.post('/network/start'),
    
  stopNetworkMonitoring: (): Promise<AxiosResponse<{ success: boolean; message: string }>> =>
    api.post('/network/stop'),
    
  resetNetworkStats: (): Promise<AxiosResponse<{ success: boolean; message: string }>> =>
    api.post('/network/reset'),
    
  getNetworkHistory: (limit = 60): Promise<AxiosResponse<{ success: boolean; data: any[] }>> =>
    api.get('/network/history', { params: { limit } }),
}

// 容器相关 API
export const containerAPI = {
  getAllContainers: (all = true): Promise<AxiosResponse<{ success: boolean; data: any }>> =>
    api.get(`/containers/all?all=${all}`),
    
  refreshCache: (): Promise<AxiosResponse<{ success: boolean; message: string }>> =>
    api.post('/containers/refresh-cache'),
    
  getContainers: (serverId: number, all = false): Promise<AxiosResponse<{ serverId: number; containers: Container[]; total: number }>> =>
    api.get(`/containers/${serverId}?all=${all}`),
    
  getContainer: (serverId: number, containerId: string): Promise<AxiosResponse<{ serverId: number; container: any }>> =>
    api.get(`/containers/${serverId}/${containerId}`),
    
  startContainer: (serverId: number, containerId: string): Promise<AxiosResponse<{ message: string; result: any }>> =>
    api.post(`/containers/${serverId}/${containerId}/start`),
    
  stopContainer: (serverId: number, containerId: string, timeout = 10): Promise<AxiosResponse<{ message: string; result: any }>> =>
    api.post(`/containers/${serverId}/${containerId}/stop`, { timeout }),
    
  restartContainer: (serverId: number, containerId: string, timeout = 10): Promise<AxiosResponse<{ message: string; result: any }>> =>
    api.post(`/containers/${serverId}/${containerId}/restart`, { timeout }),
    
  pauseContainer: (serverId: number, containerId: string): Promise<AxiosResponse<{ message: string; result: any }>> =>
    api.post(`/containers/${serverId}/${containerId}/pause`),
    
  unpauseContainer: (serverId: number, containerId: string): Promise<AxiosResponse<{ message: string; result: any }>> =>
    api.post(`/containers/${serverId}/${containerId}/unpause`),
    
  removeContainer: (serverId: number, containerId: string, force = false): Promise<AxiosResponse<{ message: string; result: any }>> =>
    api.delete(`/containers/${serverId}/${containerId}`, { data: { force } }),
    
  getContainerLogs: (serverId: number, containerId: string, options?: any): Promise<AxiosResponse<{ serverId: number; containerId: string; logs: string; options: any }>> =>
    api.get(`/containers/${serverId}/${containerId}/logs`, { params: options }),
    
  createContainer: (serverId: number, data: any): Promise<AxiosResponse<{ message: string; result: any }>> =>
    api.post(`/containers/${serverId}/create`, data),
    
  getImages: (serverId: number): Promise<AxiosResponse<{ serverId: number; images: any[]; total: number }>> =>
    api.get(`/containers/${serverId}/images`),
}

// 监控相关 API
export const monitoringAPI = {
  getServerMonitoring: (serverId: number, timeRange = '24h', interval = '5m'): Promise<AxiosResponse<{ serverId: number; type: string; timeRange: string; interval: string; data: MonitoringData[]; total: number }>> =>
    api.get(`/monitoring/servers/${serverId}`, { params: { timeRange, interval } }),
    
  getContainerMonitoring: (serverId: number, containerId: string, timeRange = '24h', interval = '5m'): Promise<AxiosResponse<{ serverId: number; containerId: string; type: string; timeRange: string; interval: string; data: any[]; total: number }>> =>
    api.get(`/monitoring/containers/${serverId}/${containerId}`, { params: { timeRange, interval } }),
    
  getCurrentMonitoring: (serverId: number): Promise<AxiosResponse<{ serverId: number; type: string; data: MonitoringData; timestamp: string }>> =>
    api.get(`/monitoring/current/${serverId}`),
    
  getCurrentContainerMonitoring: (serverId: number, containerId: string): Promise<AxiosResponse<{ serverId: number; containerId: string; type: string; data: any; timestamp: string }>> =>
    api.get(`/monitoring/containers/current/${serverId}/${containerId}`),
    
  getMonitoringStats: (): Promise<AxiosResponse<{ monitoring: any; database: any }>> =>
    api.get('/monitoring/stats'),
    
  cleanupMonitoringData: (retentionDays = 30): Promise<AxiosResponse<{ message: string }>> =>
    api.post('/monitoring/cleanup', { retentionDays }),
    
  getAlerts: (serverId?: number, severity = 'all'): Promise<AxiosResponse<{ alerts: any[]; total: number }>> =>
    api.get('/monitoring/alerts', { params: { serverId, severity } }),
}

// SSH 相关 API
export const sshAPI = {
  testConnection: (serverId: number): Promise<AxiosResponse<{ message: string; server: any }>> =>
    api.post(`/ssh/${serverId}/connect`),
    
  executeCommand: (serverId: number, command: string, timeout = 30000): Promise<AxiosResponse<{ message: string; result: any }>> =>
    api.post(`/ssh/${serverId}/execute`, { command, timeout }),
    
  getFiles: (serverId: number, path = '/'): Promise<AxiosResponse<{ path: string; files: any[]; total: number }>> =>
    api.get(`/ssh/${serverId}/files`, { params: { path } }),
    
  getSystemInfo: (serverId: number): Promise<AxiosResponse<{ serverId: number; systemInfo: any; timestamp: string }>> =>
    api.get(`/ssh/${serverId}/system-info`),
}

// 用户管理相关 API
export const userManagementAPI = {
  // 获取用户列表
  getUsers: (): Promise<AxiosResponse<{ users: any[] }>> =>
    api.get('/user-management/users'),
    
  // 创建用户
  createUser: (data: { username: string; email: string; password: string; role: string }): Promise<AxiosResponse<{ message: string }>> =>
    api.post('/user-management/users', data),
    
  // 更新用户
  updateUser: (id: number, data: any): Promise<AxiosResponse<{ message: string }>> =>
    api.put(`/user-management/users/${id}`, data),
    
  // 删除用户
  deleteUser: (id: number): Promise<AxiosResponse<{ message: string }>> =>
    api.delete(`/user-management/users/${id}`),
    
  // 获取服务器列表
  getServers: (): Promise<AxiosResponse<{ servers: any[] }>> =>
    api.get('/user-management/servers'),
    
  // 获取容器列表
  getContainers: (): Promise<AxiosResponse<{ containers: any[] }>> =>
    api.get('/user-management/containers'),
    
  // 更新用户可见服务器
  updateUserServers: (userId: number, serverIds: number[]): Promise<AxiosResponse<{ message: string }>> =>
    api.put(`/user-management/users/${userId}/servers`, { serverIds }),
    
  // 更新用户可见容器
  updateUserContainers: (userId: number, containerIds: string[]): Promise<AxiosResponse<{ message: string }>> =>
    api.put(`/user-management/users/${userId}/containers`, { containerIds })
}

// 镜像管理相关 API
export const imageAPI = {
  // 获取镜像列表
  getImages: (serverId: number, search?: string): Promise<AxiosResponse<{ data: any[] }>> =>
    api.get(`/images/${serverId}`, { params: { search } }),
    
  // 拉取镜像
  pullImage: (serverId: number, imageName: string, tag: string = 'latest'): Promise<AxiosResponse<{ message: string; data: any }>> =>
    api.post(`/images/${serverId}/pull`, { imageName, tag }),
    
  // 删除镜像
  removeImage: (serverId: number, imageId: string, force: boolean = false): Promise<AxiosResponse<{ message: string; data: any }>> =>
    api.delete(`/images/${serverId}/${imageId}`, { params: { force } }),
    
  // 修改镜像标签
  tagImage: (serverId: number, imageId: string, newTag: string): Promise<AxiosResponse<{ message: string; data: any }>> =>
    api.post(`/images/${serverId}/${imageId}/tag`, { newTag }),
    
  // 获取镜像详细信息
  getImageInfo: (serverId: number, imageId: string): Promise<AxiosResponse<{ data: any }>> =>
    api.get(`/images/${serverId}/${imageId}/info`),
    
  // 搜索镜像
  searchImages: (serverId: number, term: string): Promise<AxiosResponse<{ data: any[] }>> =>
    api.get(`/images/${serverId}/search`, { params: { term } }),
}

// 模板管理相关 API
export const templateAPI = {
  // 获取模板列表
  getTemplates: (isPublic?: boolean): Promise<AxiosResponse<{ data: any[] }>> =>
    api.get('/templates', { params: { isPublic } }),
    
  // 获取模板详情
  getTemplate: (templateId: number): Promise<AxiosResponse<{ data: any }>> =>
    api.get(`/templates/${templateId}`),
    
  // 创建模板
  createTemplate: (data: any): Promise<AxiosResponse<{ message: string; data: any }>> =>
    api.post('/templates', data),
    
  // 更新模板
  updateTemplate: (templateId: number, data: any): Promise<AxiosResponse<{ message: string; data: any }>> =>
    api.put(`/templates/${templateId}`, data),
    
  // 删除模板
  deleteTemplate: (templateId: number): Promise<AxiosResponse<{ message: string }>> =>
    api.delete(`/templates/${templateId}`),
    
  // 导出模板
  exportTemplate: (templateId: number): Promise<AxiosResponse<{ data: any }>> =>
    api.get(`/templates/${templateId}/export`),
    
  // 导入模板
  importTemplate: (file: File): Promise<AxiosResponse<{ message: string; data: any }>> => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/templates/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  
  // 部署模板
  deployTemplate: (templateId: number, serverId: number, params: any): Promise<AxiosResponse<{ message: string; data: any }>> =>
    api.post(`/templates/${templateId}/deploy`, { serverId, params }),
    
  // 验证Compose文件
  validateCompose: (composeContent: string): Promise<AxiosResponse<{ success: boolean; message: string; data: any }>> =>
    api.post('/templates/validate-compose', { composeContent }),
    
  // 获取部署记录
  getDeployments: (): Promise<AxiosResponse<{ data: any[] }>> =>
    api.get('/templates/deployments'),
    
  // 获取部署状态
  getDeploymentStatus: (deploymentId: number): Promise<AxiosResponse<{ data: any }>> =>
    api.get(`/templates/deployments/${deploymentId}`),
    
  // 检查服务依赖
  checkDependencies: (containers: any[]): Promise<AxiosResponse<{ data: any }>> =>
    api.post('/templates/check-dependencies', { containers }),
    
  // 按依赖顺序部署服务
  deployWithDependencies: (serverId: number, services: any[]): Promise<AxiosResponse<{ message: string; data: any }>> =>
    api.post('/templates/deploy-with-dependencies', { serverId, services }),
}

// Docker网络管理相关 API
export const dockerNetworkAPI = {
  // 获取网络列表
  getNetworks: (serverId: number): Promise<AxiosResponse<{ data: any[] }>> =>
    api.get(`/docker-networks/${serverId}`),
    
  // 获取网络详情
  getNetworkInfo: (serverId: number, networkId: string): Promise<AxiosResponse<{ data: any }>> =>
    api.get(`/docker-networks/${serverId}/${networkId}`),
    
  // 创建网络
  createNetwork: (serverId: number, options: any): Promise<AxiosResponse<{ message: string; data: any }>> =>
    api.post(`/docker-networks/${serverId}`, options),
    
  // 删除网络
  removeNetwork: (serverId: number, networkId: string): Promise<AxiosResponse<{ message: string; data: any }>> =>
    api.delete(`/docker-networks/${serverId}/${networkId}`),
    
  // 连接容器到网络
  connectContainer: (serverId: number, networkId: string, containerId: string, options?: any): Promise<AxiosResponse<{ message: string; data: any }>> =>
    api.post(`/docker-networks/${serverId}/${networkId}/connect`, { containerId, ...options }),
    
  // 断开容器与网络的连接
  disconnectContainer: (serverId: number, networkId: string, containerId: string): Promise<AxiosResponse<{ message: string; data: any }>> =>
    api.post(`/docker-networks/${serverId}/${networkId}/disconnect`, { containerId }),
    
  // 清理未使用网络
  pruneNetworks: (serverId: number): Promise<AxiosResponse<{ message: string; data: any }>> =>
    api.post(`/docker-networks/${serverId}/prune`),
}

// Docker卷管理相关 API
export const volumeAPI = {
  // 获取卷列表
  getVolumes: (serverId: number): Promise<AxiosResponse<{ data: any[] }>> =>
    api.get(`/volumes/${serverId}`),
    
  // 获取卷详情
  getVolumeInfo: (serverId: number, volumeName: string): Promise<AxiosResponse<{ data: any }>> =>
    api.get(`/volumes/${serverId}/${volumeName}`),
    
  // 创建卷
  createVolume: (serverId: number, options: any): Promise<AxiosResponse<{ message: string; data: any }>> =>
    api.post(`/volumes/${serverId}`, options),
    
  // 删除卷
  removeVolume: (serverId: number, volumeName: string, force?: boolean): Promise<AxiosResponse<{ message: string; data: any }>> =>
    api.delete(`/volumes/${serverId}/${volumeName}`, { params: { force } }),
    
  // 清理未使用卷
  pruneVolumes: (serverId: number): Promise<AxiosResponse<{ message: string; data: any }>> =>
    api.post(`/volumes/${serverId}/prune`),
}

export default api
