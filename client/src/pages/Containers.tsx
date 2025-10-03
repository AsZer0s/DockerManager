import React, { useState, useEffect, useCallback } from 'react'
import { 
  Table, 
  Space, 
  Tag, 
  Row, 
  Col, 
  Statistic,
  Modal,
  notification,
  Popconfirm,
  Tooltip,
  Segmented,
  Button,
  Card,
  Typography
} from 'antd'
import { 
  PlayCircleOutlined, 
  StopOutlined, 
  ReloadOutlined,
  DeleteOutlined,
  FileTextOutlined,
  ContainerOutlined,
  VerticalAlignBottomOutlined
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  SlideInText 
} from '@/components/animations/TextAnimations'

import { containerAPI, Container } from '@/services/api'
import { useGlobalServers } from '@/hooks/useGlobalServers'

// const { Title } = Typography

const Containers: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedServer, setSelectedServer] = useState<number | 'all'>('all')
  const [logsModalVisible, setLogsModalVisible] = useState(false)
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null)
  const [columnWidths, setColumnWidths] = useState({
    serverName: 120,
    name: 150,
    image: 200,
    status: 100,
    ports: 120,
    created: 150,
    action: 200
  })
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshCooldown, setRefreshCooldown] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [autoScroll, setAutoScroll] = useState(true)
  const [logsContainerRef, setLogsContainerRef] = useState<HTMLDivElement | null>(null)
  const queryClient = useQueryClient()

  // 获取服务器列表
  const { data: serversData } = useGlobalServers()

  // 获取所有服务器的容器列表
  const { data: containersData, isLoading, refetch } = useQuery({
    queryKey: ['containers', selectedServer],
    queryFn: async () => {
      try {
        if (selectedServer === 'all') {
          // 使用新的API获取所有容器信息
          const response = await containerAPI.getAllContainers(true)
          const containersData = response.data.data
          
          const allContainers = []
          for (const [serverId, serverData] of Object.entries(containersData)) {
            const serverDataTyped = serverData as { containers: any[]; serverName: string }
            const containers = serverDataTyped.containers.map((container: any) => ({
              ...container,
              serverName: serverDataTyped.serverName,
              serverId: parseInt(serverId)
            }))
            allContainers.push(...containers)
          }
          
          return { data: { containers: allContainers, total: allContainers.length } }
        } else {
          // 直接获取指定服务器的容器
          const response = await containerAPI.getContainers(selectedServer)
          const containers = response.data.containers.map((container: any) => ({
            ...container,
            serverName: servers.find(s => s.id === selectedServer)?.name || 'Unknown',
            serverId: selectedServer
          }))
          return { data: { containers, total: containers.length } }
        }
      } catch (error) {
        console.error('获取容器数据失败:', error)
        // 返回空数据而不是抛出错误
        return { data: { containers: [], total: 0 } }
      }
    },
    enabled: true,
    refetchInterval: 10000, // 10秒刷新一次
  })

  // 容器操作 mutations
  const startMutation = useMutation({
    mutationFn: ({ serverId, containerId }: { serverId: number; containerId: string }) =>
      containerAPI.startContainer(serverId, containerId),
    onSuccess: () => {
      notification.success({
        message: '启动成功',
        description: '容器启动成功',
        placement: 'topRight',
      })
      queryClient.invalidateQueries({ queryKey: ['containers'] })
    },
    onError: (error: any) => {
      notification.error({
        message: '启动失败',
        description: error.response?.data?.message || '容器启动失败',
        placement: 'topRight',
      })
    },
  })

  const stopMutation = useMutation({
    mutationFn: ({ serverId, containerId }: { serverId: number; containerId: string }) =>
      containerAPI.stopContainer(serverId, containerId),
    onSuccess: () => {
      notification.success({
        message: '停止成功',
        description: '容器停止成功',
        placement: 'topRight',
      })
      queryClient.invalidateQueries({ queryKey: ['containers'] })
    },
    onError: (error: any) => {
      notification.error({
        message: '停止失败',
        description: error.response?.data?.message || '容器停止失败',
        placement: 'topRight',
      })
    },
  })

  const refreshCacheMutation = useMutation({
    mutationFn: () => containerAPI.refreshCache(),
    onSuccess: () => {
      notification.success({
        message: '刷新成功',
        description: '缓存已刷新',
        placement: 'topRight',
      })
      queryClient.invalidateQueries({ queryKey: ['containers'] })
    },
    onError: (error: any) => {
      notification.error({
        message: '刷新失败',
        description: error.response?.data?.message || '刷新缓存失败',
        placement: 'topRight',
      })
    },
  })

  const restartMutation = useMutation({
    mutationFn: ({ serverId, containerId }: { serverId: number; containerId: string }) =>
      containerAPI.restartContainer(serverId, containerId),
    onSuccess: () => {
      notification.success({
        message: '重启成功',
        description: '容器重启成功',
        placement: 'topRight',
      })
      queryClient.invalidateQueries({ queryKey: ['containers'] })
    },
    onError: (error: any) => {
      notification.error({
        message: '重启失败',
        description: error.response?.data?.message || '容器重启失败',
        placement: 'topRight',
      })
    },
  })

  const removeMutation = useMutation({
    mutationFn: ({ serverId, containerId }: { serverId: number; containerId: string }) =>
      containerAPI.removeContainer(serverId, containerId, true),
    onSuccess: () => {
      notification.success({
        message: '删除成功',
        description: '容器删除成功',
        placement: 'topRight',
      })
      queryClient.invalidateQueries({ queryKey: ['containers'] })
    },
    onError: (error: any) => {
      notification.error({
        message: '删除失败',
        description: error.response?.data?.message || '容器删除失败',
        placement: 'topRight',
      })
    },
  })

  // 获取容器日志
  const { data: containerLogs, isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ['container-logs', (selectedContainer as Container & { serverId: number })?.serverId, selectedContainer?.id],
    queryFn: async () => {
      if (!selectedContainer) return ''
      const container = selectedContainer as Container & { serverId: number }
      const response = await containerAPI.getContainerLogs(container.serverId, container.id, {
        tail: 100,
        timestamps: true
      })
      return response.data
    },
    enabled: !!selectedContainer && logsModalVisible,
    refetchInterval: 5000, // 5秒刷新一次日志
  })

  // 自动滚动到最新日志
  useEffect(() => {
    if (autoScroll && logsContainerRef && containerLogs) {
      logsContainerRef.scrollTop = logsContainerRef.scrollHeight
    }
  }, [containerLogs, autoScroll, logsContainerRef])

  const servers = serversData?.data.servers || []
  const containers = containersData?.data.containers || []

  // 初始化服务器选择
  useEffect(() => {
    const serverParam = searchParams.get('server')
    if (serverParam) {
      const serverId = parseInt(serverParam)
      // 验证服务器 ID 是否存在于服务器列表中
      const serverExists = serversData?.data.servers.some(server => server.id === serverId)
      if (serverExists) {
        setSelectedServer(serverId)
      } else {
        setSelectedServer('all')
        // 清除无效的 URL 参数
        setSearchParams({})
      }
    } else {
      setSelectedServer('all')
    }
  }, [searchParams, serversData])

  // 处理服务器选择
  const handleServerChange = (value: number | 'all') => {
    setSelectedServer(value)
    setCurrentPage(1) // 切换服务器时重置到第一页
    if (value === 'all') {
      setSearchParams({})
    } else {
      setSearchParams({ server: value.toString() })
    }
  }

  // 处理容器操作
  const handleContainerAction = (action: string, container: Container & { serverId: number }) => {
    const mutations = {
      start: startMutation,
      stop: stopMutation,
      restart: restartMutation,
      remove: removeMutation,
    }

    const mutation = mutations[action as keyof typeof mutations]
    if (mutation) {
      mutation.mutate({ serverId: container.serverId, containerId: container.id })
    }
  }

  // 处理查看日志
  const handleViewLogs = (container: Container & { serverId: number }) => {
    setSelectedContainer(container)
    setLogsModalVisible(true)
  }

  // 获取状态颜色
  const getStatusColor = (status: string) => {
    const statusColors: Record<string, string> = {
      // 基本状态
      running: 'green',
      stopped: 'red',
      paused: 'orange',
      exited: 'gray',
      created: 'blue',
      
      // Docker 状态
      'Up': 'green',
      'Up (healthy)': 'green',
      'Up (unhealthy)': 'orange',
      'Up (paused)': 'orange',
      'Exited': 'red',
      'Created': 'blue',
      'Removing': 'orange',
      'Dead': 'red',
      'Restarting': 'blue',
    }
    
    // 根据状态内容判断颜色
    if (status.includes('Up')) {
      if (status.includes('healthy')) return 'green'
      if (status.includes('unhealthy')) return 'orange'
      if (status.includes('paused')) return 'orange'
      return 'green'
    }
    
    if (status.includes('Exited')) return 'gray'
    if (status.includes('Created')) return 'blue'
    if (status.includes('Removing')) return 'orange'
    if (status.includes('Dead')) return 'red'
    if (status.includes('Restarting')) return 'orange'
    
    return statusColors[status] || 'default'
  }

  // 获取状态文本
  const getStatusText = (status: string) => {
    const statusTexts: Record<string, string> = {
      // 基本状态
      running: '运行中',
      stopped: '已停止',
      paused: '已暂停',
      exited: '已退出',
      created: '已创建',
      
      // Docker 状态
      'Up': '运行中',
      'Up (healthy)': '运行中 (健康)',
      'Up (unhealthy)': '运行中 (不健康)',
      'Up (paused)': '运行中 (暂停)',
      'Exited': '已退出',
      'Created': '已创建',
      'Removing': '删除中',
      'Dead': '已死亡',
      'Restarting': '重启中',
      
      // 带时间的状态
      'Up 16 seconds': '运行中 (16秒)',
      'Up 8 minutes (healthy)': '运行中 (8分钟, 健康)',
      'Exited (0) 5 days ago': '已退出 (5天前)',
      'Exited (1) 2 hours ago': '已退出 (2小时前)',
      'Exited (137) 1 day ago': '已退出 (1天前)',
    }
    
    // 处理带时间的状态
    if (status.includes('Up') && status.includes('ago')) {
      return `运行中 (${status.replace('Up ', '').replace(' ago', '前')})`
    }
    
    // 处理 Exited 状态，统一显示为"已停止"
    if (status.includes('Exited')) {
      return '已停止'
    }
    
    // 处理 Restarting 状态
    if (status.includes('Restarting')) {
      return '重启中'
    }
    
    // 处理带时间的状态（分钟、小时、天）
    if (status.includes('Up') && (status.includes('seconds') || status.includes('minutes') || status.includes('hours') || status.includes('days'))) {
      const timeMatch = status.match(/Up\s+(.+?)(?:\s+\((.+?)\))?$/)
      if (timeMatch) {
        const time = timeMatch[1]
        const health = timeMatch[2]
        return health ? `运行中 (${time}, ${health === 'healthy' ? '健康' : '不健康'})` : `运行中 (${time})`
      }
    }
    
    if (status.includes('Exited') && (status.includes('seconds') || status.includes('minutes') || status.includes('hours') || status.includes('days'))) {
      const timeMatch = status.match(/Exited\s+(.+?)(?:\s+\((.+?)\))?$/)
      if (timeMatch) {
        const time = timeMatch[1]
        const code = timeMatch[2]
        return code ? `已退出 (${time}, 代码${code})` : `已退出 (${time})`
      }
    }
    
    return statusTexts[status] || status
  }


  // 防抖刷新函数
  const handleRefresh = useCallback(async () => {
    if (refreshCooldown) {
      notification.warning({
        message: '刷新过于频繁',
        description: '请稍后再试',
        placement: 'topRight',
      })
      return
    }

    setIsRefreshing(true)
    setRefreshCooldown(true)

    try {
      await refetch()
      notification.success({
        message: '刷新成功',
        description: '容器列表已更新',
        placement: 'topRight',
      })
    } catch (error) {
      notification.error({
        message: '刷新失败',
        description: '无法刷新容器列表',
        placement: 'topRight',
      })
    } finally {
      setIsRefreshing(false)
      // 2秒冷却时间
      setTimeout(() => {
        setRefreshCooldown(false)
      }, 2000)
    }
  }, [refreshCooldown, refetch])

  // 拖拽调整列宽度的处理函数
  const handleMouseDown = (e: React.MouseEvent, columnKey: keyof typeof columnWidths) => {
    e.preventDefault()
    e.stopPropagation()
    
    const startX = e.clientX
    const startWidth = columnWidths[columnKey]
    
    // 添加拖拽状态类
    document.body.classList.add('resizing')
    
    // 找到对应的表头元素并添加拖拽状态
    const thElement = e.currentTarget.closest('th')
    if (thElement) {
      thElement.classList.add('dragging')
    }

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX
      const newWidth = Math.max(80, Math.min(400, startWidth + deltaX))
      setColumnWidths(prev => ({
        ...prev,
        [columnKey]: newWidth
      }))
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      
      // 移除拖拽状态类
      document.body.classList.remove('resizing')
      if (thElement) {
        thElement.classList.remove('dragging')
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  // 列标题组件
  const ColumnTitle = ({ title, columnKey }: { title: string; columnKey: keyof typeof columnWidths }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
      <span style={{ textAlign: 'center', flex: 1 }}>{title}</span>
      <div
        style={{
          position: 'absolute',
          right: '-8px',
          top: '0',
          bottom: '0',
          width: '8px',
          cursor: 'col-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          zIndex: 1
        }}
        onMouseDown={(e) => handleMouseDown(e, columnKey)}
      >
        <div
          style={{
            width: '2px',
            height: '16px',
            background: 'var(--ant-color-border)',
            borderRadius: '1px',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--ant-color-primary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--ant-color-border)'
          }}
        />
      </div>
    </div>
  )

  // 表格列配置
  const columns = [
    {
      title: <ColumnTitle title="服务器" columnKey="serverName" />,
      dataIndex: 'serverName',
      key: 'serverName',
      width: columnWidths.serverName,
      fixed: 'left' as const,
      align: 'center' as const,
      render: (text: string) => (
        <Tag color="blue" style={{ margin: 0, textAlign: 'center' }}>
          {text}
        </Tag>
      ),
    },
    {
      title: <ColumnTitle title="容器名称" columnKey="name" />,
      dataIndex: 'name',
      key: 'name',
      width: columnWidths.name,
      align: 'center' as const,
      render: (text: string) => (
        <div style={{ fontWeight: 600, color: '#1890ff', textAlign: 'center' }}>
          {text}
        </div>
      ),
    },
    {
      title: <ColumnTitle title="镜像" columnKey="image" />,
      dataIndex: 'image',
      key: 'image',
      width: columnWidths.image,
      ellipsis: true,
      align: 'center' as const,
      render: (text: string) => (
        <div style={{ 
          fontFamily: 'monospace', 
          fontSize: '12px',
          color: 'var(--ant-color-text-secondary)',
          background: 'var(--ant-color-fill-quaternary)',
          padding: '2px 6px',
          borderRadius: '4px',
          display: 'inline-block',
          textAlign: 'center'
        }}>
          {text}
        </div>
      ),
    },
    {
      title: <ColumnTitle title="状态" columnKey="status" />,
      dataIndex: 'status',
      key: 'status',
      width: columnWidths.status,
      align: 'center' as const,
      render: (status: string) => (
        <Tag 
          color={getStatusColor(status)}
          style={{ 
            margin: 0,
            borderRadius: '12px',
            fontWeight: 500
          }}
        >
          {getStatusText(status)}
        </Tag>
      ),
    },
    {
      title: <ColumnTitle title="端口映射" columnKey="ports" />,
      dataIndex: 'ports',
      key: 'ports',
      width: columnWidths.ports,
      align: 'center' as const,
      render: (ports: any) => {
        // 处理端口数据，可能是数组或字符串
        if (Array.isArray(ports) && ports.length > 0) {
          return (
            <div style={{ textAlign: 'center' }}>
              {ports.slice(0, 2).map((port, index) => {
                // 处理解析后的端口对象
                if (port.PublicPort && port.PrivatePort) {
                  return (
                    <Tag 
                      key={index}
                      color="green"
                      style={{ margin: '2px', fontSize: '11px' }}
                    >
                      {port.PublicPort}:{port.PrivatePort}/{port.Type}
                    </Tag>
                  );
                } else if (port.PrivatePort) {
                  // 仅内部端口
                  return (
                    <Tag 
                      key={index}
                      color="blue"
                      style={{ margin: '2px', fontSize: '11px' }}
                    >
                      {port.PrivatePort}/{port.Type}
                    </Tag>
                  );
                }
                return null;
              })}
              {ports.length > 2 && (
                <Tooltip title={ports.slice(2).map(p => {
                  if (p.PublicPort && p.PrivatePort) {
                    return `${p.PublicPort}:${p.PrivatePort}/${p.Type}`;
                  } else if (p.PrivatePort) {
                    return `${p.PrivatePort}/${p.Type}`;
                  }
                  return '';
                }).filter(Boolean).join(', ')}>
                  <Tag color="default" style={{ margin: '2px', fontSize: '11px' }}>
                    +{ports.length - 2}
                  </Tag>
                </Tooltip>
              )}
            </div>
          );
        } else if (typeof ports === 'string' && ports.trim()) {
          // 如果是字符串，直接显示
          return (
            <div style={{ textAlign: 'center' }}>
              <Tag color="green" style={{ margin: 0, fontSize: '11px' }}>
                {ports}
              </Tag>
            </div>
          );
        } else {
          // 空端口
          return <span style={{ color: '#ccc', textAlign: 'center', display: 'block' }}>-</span>;
        }
      },
    },
    {
      title: <ColumnTitle title="创建时间" columnKey="created" />,
      dataIndex: 'created',
      key: 'created',
      width: columnWidths.created,
      align: 'center' as const,
      render: (date: string) => (
        <div style={{ fontSize: '12px', color: 'var(--ant-color-text-secondary)', textAlign: 'center' }}>
          {new Date(date).toLocaleString('zh-CN')}
        </div>
      ),
    },
    {
      title: <ColumnTitle title="操作" columnKey="action" />,
      key: 'action',
      width: columnWidths.action,
      fixed: 'right' as const,
      align: 'center' as const,
      render: (record: Container & { serverId: number }) => (
        <Space size="small" style={{ justifyContent: 'center', display: 'flex' }}>
          {record.status && record.status.includes('Up') ? (
            <>
              <Button
                size="small"
                icon={<StopOutlined />}
                onClick={() => handleContainerAction('stop', record)}
                loading={stopMutation.isLoading}
              >
                关闭
              </Button>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => handleContainerAction('restart', record)}
                loading={restartMutation.isLoading}
              >
                重启
              </Button>
            </>
          ) : (
            <Button
              size="small"
              icon={<PlayCircleOutlined />}
              onClick={() => handleContainerAction('start', record)}
              loading={startMutation.isLoading}
            >
              启动
            </Button>
          )}
          <Button
            size="small"
            icon={<FileTextOutlined />}
            onClick={() => handleViewLogs(record)}
          >
            日志
          </Button>
          <Popconfirm
            title="确定要删除这个容器吗？"
            description="删除后无法恢复"
            onConfirm={() => handleContainerAction('remove', record)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              size="small"
              icon={<DeleteOutlined />}
              loading={removeMutation.isLoading}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // 计算统计信息
  const stats = {
    total: containers.length,
    running: containers.filter((c: any) => c.status && c.status.includes('Up')).length,
    stopped: containers.filter((c: any) => c.status && !c.status.includes('Up')).length,
  }

  // 准备服务器选项（显示所有活跃服务器，包括离线服务器）
  const serverOptions: Array<{ label: string; value: number | 'all' }> = [
    { label: '全部服务器', value: 'all' },
    ...servers
      .filter(server => server.is_active)
      .map(server => ({
        label: `${server.name} ${server.status === '在线' ? '🟢' : '🔴'}`,
        value: server.id as number
      }))
  ]

  return (
    <div>
      <style>{`
        .table-row-light {
          background-color: var(--ant-color-fill-quaternary);
        }
        .table-row-dark {
          background-color: var(--ant-color-bg-container);
        }
        .table-row-light:hover,
        .table-row-dark:hover {
          background-color: var(--ant-color-primary-bg-hover) !important;
        }
        .ant-table-thead > tr > th {
          background-color: var(--ant-color-fill-quaternary);
          font-weight: 600;
          color: var(--ant-color-text-heading);
          position: relative;
        }
        .ant-table-tbody > tr > td {
          border-bottom: 1px solid var(--ant-color-border);
        }
        /* 拖拽手柄样式 */
        .ant-table-thead > tr > th {
          position: relative;
        }
        .ant-table-thead > tr > th:hover {
          background-color: var(--ant-color-primary-bg-hover);
        }
        /* 拖拽时的视觉反馈 */
        .ant-table-thead > tr > th.dragging {
          background-color: var(--ant-color-primary-bg) !important;
        }
        /* 全局拖拽状态 */
        body.resizing {
          cursor: col-resize !important;
          user-select: none !important;
        }
        /* 表格刷新动画 */
        .table-refreshing {
          animation: tableRefresh 0.6s ease-in-out;
        }
        @keyframes tableRefresh {
          0% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.7;
            transform: scale(0.98);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
        /* 刷新按钮动画 */
        .ant-btn-loading .anticon {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        
        /* 页面标题样式 */
        .page-title {
          font-size: 2rem;
          font-weight: 700;
          background: linear-gradient(135deg, #10b981, #3b82f6);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        
        .stat-title {
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
        }
      `}</style>
      <motion.div 
        style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <Typography.Title level={1} className="page-title">
          容器管理
        </Typography.Title>
        <Space>
          <Segmented
            options={serverOptions}
            value={selectedServer}
            onChange={handleServerChange}
            size="large"
          />
          <Button 
            icon={<ReloadOutlined />} 
            onClick={handleRefresh}
            loading={isRefreshing}
            disabled={refreshCooldown}
          >
            刷新
          </Button>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={() => refreshCacheMutation.mutate()}
            loading={refreshCacheMutation.isLoading}
          >
            刷新缓存
          </Button>
        </Space>
      </motion.div>

      {/* 统计信息 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <Card hoverable>
              <Statistic
                title={
                  <SlideInText 
                    text="容器总数" 
                    direction="left" 
                    delay={0.2}
                    className="stat-title"
                  />
                }
                value={stats.total}
                prefix={<ContainerOutlined />}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </motion.div>
        </Col>
        <Col xs={24} sm={8}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Card hoverable>
              <Statistic
                title={
                  <SlideInText 
                    text="运行中" 
                    direction="left" 
                    delay={0.3}
                    className="stat-title"
                  />
                }
                value={stats.running}
                prefix={<PlayCircleOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </motion.div>
        </Col>
        <Col xs={24} sm={8}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <Card hoverable>
              <Statistic
                title={
                  <SlideInText 
                    text="已停止" 
                    direction="left" 
                    delay={0.4}
                    className="stat-title"
                  />
                }
                value={stats.stopped}
                prefix={<StopOutlined />}
                valueStyle={{ color: '#ff4d4f' }}
              />
            </Card>
          </motion.div>
        </Col>
      </Row>

      {/* 容器列表 */}
      <Card 
        styles={{ body: { padding: 0 } }}
      >
        <Table
          columns={columns}
          dataSource={containers}
          loading={isLoading}
          rowKey={(record: any) => `${record?.serverId || 'unknown'}-${record?.id || 'unknown'}`}
          pagination={{
            current: currentPage,
            pageSize: pageSize,
            total: containers.length,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `第 ${range[0]}-${range[1]} 个，共 ${total} 个容器`,
            pageSizeOptions: ['10', '20', '50'],
            onChange: (page, size) => {
              setCurrentPage(page)
              if (size !== pageSize) {
                setPageSize(size)
                setCurrentPage(1) // 重置到第一页
              }
            },
            style: { padding: '16px 24px' }
          }}
          scroll={{ x: 1200 }}
          size="middle"
          className={isRefreshing ? 'table-refreshing' : ''}
          style={{
            borderRadius: '8px'
          }}
          rowClassName={(_, index) => 
            index % 2 === 0 ? 'table-row-light' : 'table-row-dark'
          }
        />
      </Card>

      {/* 日志查看模态框 */}
      <Modal
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <span>容器日志 - {selectedContainer?.name}</span>
            <Space style={{ marginRight: 40 }}>
              <Button 
                size="small" 
                type={autoScroll ? 'primary' : 'default'}
                icon={<VerticalAlignBottomOutlined />} 
                onClick={() => setAutoScroll(!autoScroll)}
              >
                {autoScroll ? '自动滚动' : '手动滚动'}
              </Button>
              <Button 
                size="small" 
                icon={<ReloadOutlined />} 
                onClick={() => refetchLogs()}
                loading={logsLoading}
              >
                刷新
              </Button>
            </Space>
          </div>
        }
        open={logsModalVisible}
        onCancel={() => setLogsModalVisible(false)}
        footer={null}
        width={900}
        style={{ top: 20 }}
      >
        <div 
          ref={setLogsContainerRef}
          style={{ 
            height: 500, 
            overflow: 'auto', 
            background: '#1e1e1e', 
            color: '#d4d4d4', 
            padding: 16, 
            borderRadius: 6,
            position: 'relative'
          }}
        >
          {logsLoading ? (
            <div style={{ textAlign: 'center', padding: '50px 0', color: '#666' }}>
              正在加载日志...
            </div>
          ) : containerLogs ? (
            <pre style={{ 
              margin: 0, 
              fontFamily: 'Consolas, Monaco, Courier New, monospace', 
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}>
              {typeof containerLogs === 'string' ? containerLogs : containerLogs.logs || ''}
            </pre>
          ) : (
            <div style={{ textAlign: 'center', padding: '50px 0', color: '#666' }}>
              暂无日志数据
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

export default Containers

