import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Button, 
  Badge, 
  Tabs, 
  Input, 
  Spin, 
  Alert,
  Space,
  Typography,
  Row,
  Col,
  Statistic,
  List,
  Tag,
  Divider
} from 'antd';
import { 
  DatabaseOutlined, 
  ContainerOutlined, 
  PlayCircleOutlined, 
  StopOutlined, 
  ReloadOutlined, 
  DashboardOutlined, 
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined
} from '@ant-design/icons';
import SplitText from '@/components/SplitText';

const { Title, Text } = Typography;
const { TabPane } = Tabs;
const { Search } = Input;

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface Server {
  id: number;
  name: string;
  host: string;
  port: number;
  status: 'online' | 'offline';
  statusIcon: string;
  description?: string;
}

interface Container {
  id: string;
  name: string;
  image: string;
  status: string;
  created: string;
  ports?: Array<{
    publicPort: number;
    privatePort: number;
    type: string;
  }>;
}

const TelegramWebApp: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [servers, setServers] = useState<Server[]>([]);
  const [containers, setContainers] = useState<Container[]>([]);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const initializeData = async () => {
      setLoading(true);
      
      // 检查是否被内联脚本阻止加载
      if ((window as any).stopReactApp) {
        setError('应用初始化失败');
        setLoading(false);
        return;
      }
      
      // 等待内联脚本完成初始化（最多等待10秒）
      let attempts = 0;
      const maxAttempts = 50; // 10秒，每200ms检查一次
      
      while (attempts < maxAttempts) {
        const authToken = (window as any).authToken;
        const userInfo = (window as any).userInfo;
        const serversList = (window as any).serversList;
        const telegramUserData = (window as any).telegramUserData;
        
        if (authToken && userInfo && serversList && telegramUserData) {
          setToken(authToken);
          setUser(telegramUserData);
          setServers(serversList);
          console.log('使用内联脚本准备的数据初始化完成', {
            telegramUser: telegramUserData,
            backendUser: userInfo,
            serversCount: serversList.length
          });
          setLoading(false);
          return;
        }
        
        // 等待200ms后重试
        await new Promise(resolve => setTimeout(resolve, 200));
        attempts++;
      }
      
      // 如果超时仍未获取到数据，显示错误
      console.error('等待内联脚本初始化超时', {
        authToken: (window as any).authToken,
        userInfo: (window as any).userInfo,
        serversList: (window as any).serversList,
        telegramUserData: (window as any).telegramUserData,
        stopReactApp: (window as any).stopReactApp
      });
      setError('数据初始化超时，请刷新页面重试');
      setLoading(false);
    };

    initializeData();
  }, []);

  // 定时刷新服务器状态
  useEffect(() => {
    if (!token || !user) return;

    // 立即刷新一次
    refreshServers();

    // 设置定时器，每30秒刷新一次
    const interval = setInterval(() => {
      refreshServers();
    }, 5000);

    return () => clearInterval(interval);
  }, [token, user]);


  const loadContainers = async (serverId: number) => {
    if (!user) return;
    
    try {
      const response = await fetch(`/api/telegram-webapp/servers/${serverId}/containers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user.id.toString()
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setContainers(data.containers);
        console.log(`加载服务器 ${serverId} 的容器列表成功`, { count: data.containers.length });
      } else {
        console.error('加载容器列表失败:', data.message);
        setError(data.message || '加载容器列表失败');
      }
    } catch (err) {
      console.error('加载容器失败:', err);
      setError('加载容器失败');
    }
  };

  const executeContainerAction = async (serverId: number, containerId: string, action: string) => {
    if (!user) return;
    
    try {
      const response = await fetch(`/api/telegram-webapp/containers/${serverId}/${containerId}/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user.id.toString()
        })
      });

      const data = await response.json();
      
      if (data.success) {
        // 刷新容器列表
        await loadContainers(serverId);
        if (selectedContainer?.id === containerId) {
          await loadContainerDetails(serverId, containerId);
        }
        console.log(`容器 ${containerId} ${action} 操作成功`);
      } else {
        console.error(`容器${action}失败:`, data.message);
        setError(data.message || `容器${action}失败`);
      }
    } catch (err) {
      console.error('执行容器操作失败:', err);
      setError(`容器${action}失败`);
    }
  };

  const loadContainerDetails = async (serverId: number, containerId: string) => {
    if (!user) return;
    
    try {
      const response = await fetch(`/api/telegram-webapp/containers/${serverId}/${containerId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user.id.toString()
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setSelectedContainer(data.container);
        console.log(`加载容器 ${containerId} 详情成功`);
      } else {
        console.error('加载容器详情失败:', data.message);
        setError(data.message || '加载容器详情失败');
      }
    } catch (err) {
      console.error('加载容器详情失败:', err);
      setError('加载容器详情失败');
    }
  };

  const getStatusColor = (status: string) => {
    const lowerStatus = status.toLowerCase();
    if (lowerStatus.includes('running') || lowerStatus.includes('up')) {
      return 'success';
    } else if (lowerStatus.includes('exited') || lowerStatus.includes('stopped') || lowerStatus.includes('down')) {
      return 'error';
    } else if (lowerStatus.includes('paused')) {
      return 'warning';
    } else if (lowerStatus.includes('created') || lowerStatus.includes('restarting')) {
      return 'processing';
    } else {
      return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    const lowerStatus = status.toLowerCase();
    if (lowerStatus.includes('running') || lowerStatus.includes('up')) {
      return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
    } else if (lowerStatus.includes('exited') || lowerStatus.includes('stopped') || lowerStatus.includes('down')) {
      return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
    } else if (lowerStatus.includes('paused')) {
      return <ExclamationCircleOutlined style={{ color: '#faad14' }} />;
    } else if (lowerStatus.includes('created') || lowerStatus.includes('restarting')) {
      return <LoadingOutlined style={{ color: '#1890ff' }} />;
    } else {
      return <ExclamationCircleOutlined style={{ color: '#faad14' }} />;
    }
  };

  const getStatusText = (status: string) => {
    const lowerStatus = status.toLowerCase();
    if (lowerStatus.includes('running') || lowerStatus.includes('up')) {
      return '运行中';
    } else if (lowerStatus.includes('exited') || lowerStatus.includes('stopped') || lowerStatus.includes('down')) {
      return '已停止';
    } else if (lowerStatus.includes('paused')) {
      return '已暂停';
    } else if (lowerStatus.includes('created')) {
      return '已创建';
    } else if (lowerStatus.includes('restarting')) {
      return '重启中';
    } else {
      return status;
    }
  };

  const filteredServers = servers.filter(server => 
    server.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    server.host.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 刷新服务器列表
  const refreshServers = async () => {
    if (!token || !user) return;
    
    setRefreshing(true);
    try {
      const response = await fetch('/api/telegram-webapp/servers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user.id.toString()
        })
      });

      const data = await response.json();
      if (data.success) {
        setServers(data.servers);
        console.log('服务器列表刷新成功', { count: data.servers.length });
      } else {
        console.error('刷新服务器列表失败:', data.message);
      }
    } catch (error) {
      console.error('刷新服务器列表异常:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const filteredContainers = containers.filter(container => 
    container.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    container.image.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#f5f5f5',
        flexDirection: 'column',
        gap: '24px'
      }}>
        <div style={{ textAlign: 'center' }}>
          <SplitText
            text="Docker Manager"
            className="text-4xl font-bold text-blue-600 mb-4"
            delay={150}
            duration={0.8}
            ease="power3.out"
            splitType="chars"
            from={{ opacity: 0, y: 50, rotationX: 90 }}
            to={{ opacity: 1, y: 0, rotationX: 0 }}
            tag="h1"
          />
        </div>
        <div style={{ textAlign: 'center' }}>
          <SplitText
            text="正在初始化系统..."
            className="text-lg text-gray-600"
            delay={200}
            duration={0.6}
            ease="power2.out"
            splitType="words"
            from={{ opacity: 0, y: 30 }}
            to={{ opacity: 1, y: 0 }}
            tag="p"
          />
        </div>
        <div style={{ marginTop: '16px' }}>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 24, color: '#1890ff' }} spin />} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#f5f5f5'
      }}>
        <Card style={{ width: 400 }}>
          <Alert
            message="错误"
            description={
              <div>
                <div>{error}</div>
                <div style={{ marginTop: 8 }}>
                  <Button 
                    size="small" 
                    type="link" 
                    onClick={() => window.location.href = '/telegram-debug'}
                  >
                    打开调试页面
                  </Button>
                </div>
              </div>
            }
            type="error"
            showIcon
          />
        </Card>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#f5f5f5',
      padding: '16px'
    }}>
      <style>{`
        .split-parent {
          perspective: 1000px;
        }
        .split-char, .split-word, .split-line {
          display: inline-block;
          transform-origin: center;
        }
        .text-4xl {
          font-size: 2.25rem;
          line-height: 2.5rem;
        }
        .text-2xl {
          font-size: 1.5rem;
          line-height: 2rem;
        }
        .text-lg {
          font-size: 1.125rem;
          line-height: 1.75rem;
        }
        .text-sm {
          font-size: 0.875rem;
          line-height: 1.25rem;
        }
        .font-bold {
          font-weight: 700;
        }
        .font-medium {
          font-weight: 500;
        }
        .text-blue-600 {
          color: #2563eb;
        }
        .text-gray-600 {
          color: #4b5563;
        }
        .text-gray-500 {
          color: #6b7280;
        }
        .mb-4 {
          margin-bottom: 1rem;
        }
        .mb-8 {
          margin-bottom: 0.5rem;
        }
      `}</style>
      <Card>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ marginBottom: '8px' }}>
            <SplitText
              text="Docker Manager"
              className="text-2xl font-bold text-blue-600"
              delay={100}
              duration={0.6}
              ease="power2.out"
              splitType="chars"
              from={{ opacity: 0, y: 20 }}
              to={{ opacity: 1, y: 0 }}
              tag="h3"
            />
          </div>
          {user && (
            <SplitText
              text={`欢迎，${user.first_name} ${user.last_name || ''}`}
              className="text-gray-500"
              delay={200}
              duration={0.5}
              ease="power2.out"
              splitType="words"
              from={{ opacity: 0, x: -20 }}
              to={{ opacity: 1, x: 0 }}
              tag="span"
            />
          )}
        </div>

        <Tabs defaultActiveKey="servers">
          <TabPane tab={<span><DatabaseOutlined />服务器</span>} key="servers">
            <Space direction="vertical" style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <Search
                  placeholder="搜索服务器..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ width: 300 }}
                />
                <Button
                  type="primary"
                  icon={<ReloadOutlined spin={refreshing} />}
                  onClick={refreshServers}
                  loading={refreshing}
                  size="small"
                >
                  刷新
                </Button>
              </div>
              
              {/* 服务器统计 */}
              <Row gutter={[16, 16]}>
                <Col span={8}>
                  <Card size="small">
                    <Statistic
                      title={
                        <SplitText
                          text="总服务器"
                          className="text-sm font-medium"
                          delay={300}
                          duration={0.4}
                          ease="power2.out"
                          splitType="chars"
                          from={{ opacity: 0, y: 10 }}
                          to={{ opacity: 1, y: 0 }}
                          tag="span"
                        />
                      }
                      value={servers.length}
                      prefix={<DatabaseOutlined />}
                    />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card size="small">
                    <Statistic
                      title={
                        <SplitText
                          text="在线服务器"
                          className="text-sm font-medium"
                          delay={400}
                          duration={0.4}
                          ease="power2.out"
                          splitType="chars"
                          from={{ opacity: 0, y: 10 }}
                          to={{ opacity: 1, y: 0 }}
                          tag="span"
                        />
                      }
                      value={servers.filter(s => s.status === 'online').length}
                      valueStyle={{ color: '#3f8600' }}
                      prefix={<CheckCircleOutlined />}
                    />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card size="small">
                    <Statistic
                      title={
                        <SplitText
                          text="离线服务器"
                          className="text-sm font-medium"
                          delay={500}
                          duration={0.4}
                          ease="power2.out"
                          splitType="chars"
                          from={{ opacity: 0, y: 10 }}
                          to={{ opacity: 1, y: 0 }}
                          tag="span"
                        />
                      }
                      value={servers.filter(s => s.status === 'offline').length}
                      valueStyle={{ color: '#cf1322' }}
                      prefix={<CloseCircleOutlined />}
                    />
                  </Card>
                </Col>
              </Row>
              
              <Row gutter={[16, 16]}>
                {filteredServers.map(server => (
                  <Col xs={24} sm={12} md={8} lg={6} key={server.id}>
                    <Card
                      hoverable
                      onClick={() => {
                        setSelectedServer(server);
                        loadContainers(server.id);
                      }}
                    >
                      <Card.Meta
                        avatar={<DatabaseOutlined />}
                        title={server.name}
                        description={
                          <Space direction="vertical" size="small">
                            <Text type="secondary">{server.host}:{server.port}</Text>
                            <Badge 
                              status={server.status === 'online' ? 'success' : 'error'} 
                              text={server.status === 'online' ? '在线' : '离线'} 
                            />
                          </Space>
                        }
                      />
                    </Card>
                  </Col>
                ))}
              </Row>
            </Space>
          </TabPane>

          {selectedServer && (
            <TabPane tab={<span><ContainerOutlined />容器</span>} key="containers">
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <Title level={4}>
                    <DatabaseOutlined /> {selectedServer.name}
                  </Title>
                  <Text type="secondary">{selectedServer.host}:{selectedServer.port}</Text>
                </div>

                <Search
                  placeholder="搜索容器..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ width: 300 }}
                />

                <List
                  dataSource={filteredContainers}
                  renderItem={container => (
                    <List.Item
                      actions={[
                        <Button
                          type="link"
                          onClick={() => loadContainerDetails(selectedServer.id, container.id)}
                        >
                          详情
                        </Button>
                      ]}
                    >
                      <List.Item.Meta
                        avatar={<ContainerOutlined />}
                        title={
                          <Space>
                            {getStatusIcon(container.status)}
                            {container.name}
                          </Space>
                        }
                        description={
                          <Space direction="vertical" size="small">
                            <Text type="secondary">{container.image}</Text>
                            <Tag color={getStatusColor(container.status)}>
                              {getStatusText(container.status)}
                            </Tag>
                          </Space>
                        }
                      />
                    </List.Item>
                  )}
                />
              </Space>
            </TabPane>
          )}

          {selectedContainer && (
            <TabPane tab={<span><DashboardOutlined />详情</span>} key="details">
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <Title level={4}>
                    <ContainerOutlined /> {selectedContainer.name}
                  </Title>
                  <Text type="secondary">{selectedContainer.image}</Text>
                </div>

                {/* 容器状态统计 */}
                <Row gutter={[16, 16]}>
                  <Col span={8}>
                    <Statistic
                      title="状态"
                      value={getStatusText(selectedContainer.status)}
                      prefix={getStatusIcon(selectedContainer.status)}
                      valueStyle={{ 
                        color: getStatusColor(selectedContainer.status) === 'success' ? '#3f8600' : 
                               getStatusColor(selectedContainer.status) === 'error' ? '#cf1322' : 
                               getStatusColor(selectedContainer.status) === 'warning' ? '#d48806' : '#1890ff'
                      }}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title="容器ID"
                      value={selectedContainer.id.substring(0, 12)}
                      valueStyle={{ fontSize: '14px' }}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title="创建时间"
                      value={new Date(selectedContainer.created).toLocaleDateString()}
                      valueStyle={{ fontSize: '14px' }}
                    />
                  </Col>
                </Row>

                <Divider />

                {/* 容器操作按钮 */}
                <div>
                  <Title level={5}>容器操作</Title>
                  <Space wrap>
                    <Button
                      type="primary"
                      icon={<PlayCircleOutlined />}
                      onClick={() => executeContainerAction(selectedServer!.id, selectedContainer.id, 'start')}
                      disabled={selectedContainer.status.toLowerCase().includes('running')}
                    >
                      启动
                    </Button>
                    <Button
                      danger
                      icon={<StopOutlined />}
                      onClick={() => executeContainerAction(selectedServer!.id, selectedContainer.id, 'stop')}
                      disabled={!selectedContainer.status.toLowerCase().includes('running')}
                    >
                      停止
                    </Button>
                    <Button
                      icon={<ReloadOutlined />}
                      onClick={() => executeContainerAction(selectedServer!.id, selectedContainer.id, 'restart')}
                    >
                      重启
                    </Button>
                    <Button
                      icon={<ReloadOutlined />}
                      onClick={() => loadContainerDetails(selectedServer!.id, selectedContainer.id)}
                    >
                      刷新
                    </Button>
                  </Space>
                </div>

                {/* 容器详细信息 */}
                <div>
                  <Title level={5}>详细信息</Title>
                  <Card size="small">
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <div>
                        <Text strong>容器名称：</Text>
                        <Text>{selectedContainer.name}</Text>
                      </div>
                      <div>
                        <Text strong>镜像：</Text>
                        <Text code>{selectedContainer.image}</Text>
                      </div>
                      <div>
                        <Text strong>容器ID：</Text>
                        <Text code>{selectedContainer.id}</Text>
                      </div>
                      <div>
                        <Text strong>状态：</Text>
                        <Tag color={getStatusColor(selectedContainer.status)}>
                          {getStatusText(selectedContainer.status)}
                        </Tag>
                      </div>
                      <div>
                        <Text strong>创建时间：</Text>
                        <Text>{new Date(selectedContainer.created).toLocaleString()}</Text>
                      </div>
                    </Space>
                  </Card>
                </div>
              </Space>
            </TabPane>
          )}
        </Tabs>
      </Card>
    </div>
  );
};

export default TelegramWebApp;