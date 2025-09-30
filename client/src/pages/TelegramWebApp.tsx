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

  useEffect(() => {
    const initTelegramWebApp = async () => {
      try {
        // 等待 Telegram Web App 脚本加载
        let attempts = 0;
        const maxAttempts = 50; // 5秒超时
        
        while (attempts < maxAttempts && !(window as any).Telegram?.WebApp) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        // 使用更严格的检测方法
        if (
          typeof (window as any).Telegram === 'undefined' ||
          typeof (window as any).Telegram.WebApp === 'undefined' ||
          !(window as any).Telegram.WebApp.initData
        ) {
          // 检查是否在桌面浏览器中访问
          const isDesktopBrowser = !navigator.userAgent.includes('Telegram') && 
                                 !window.location.search.includes('tgWebAppData') &&
                                 !document.referrer.includes('telegram');
          
          if (isDesktopBrowser) {
            setError('此应用只能在 Telegram 中打开，请通过 Telegram 机器人访问');
          } else {
            setError('Telegram Web App 初始化失败，请刷新页面重试');
          }
          return;
        }
        
        const tg = (window as any).Telegram.WebApp;
        tg.ready();
        tg.expand();

        const initData = tg.initData;
        const user = tg.initDataUnsafe?.user;

          if (user) {
            setUser(user);

            const response = await fetch('/api/telegram-webapp/auth', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ initData }),
            });

            const data = await response.json();
            
            if (data.success) {
              setToken(data.token);
              await loadServers(data.token);
            } else {
              setError(data.message || '认证失败');
            }
          } else {
            setError('无法获取 Telegram 用户信息');
          }
      } catch (err) {
        console.error('初始化失败:', err);
        setError('初始化失败，请重试');
      } finally {
        setLoading(false);
      }
    };

    initTelegramWebApp();
  }, []);

  const loadServers = async (authToken: string) => {
    try {
      const response = await fetch('/api/telegram-webapp/servers', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      const data = await response.json();
      
      if (data.success) {
        setServers(data.servers);
      } else {
        setError(data.message || '加载服务器列表失败');
      }
    } catch (err) {
      console.error('加载服务器失败:', err);
      setError('加载服务器失败');
    }
  };

  const loadContainers = async (serverId: number) => {
    try {
      const response = await fetch(`/api/telegram-webapp/containers/${serverId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      
      if (data.success) {
        setContainers(data.containers);
      } else {
        setError(data.message || '加载容器列表失败');
      }
    } catch (err) {
      console.error('加载容器失败:', err);
      setError('加载容器失败');
    }
  };

  const executeContainerAction = async (serverId: number, containerId: string, action: string) => {
    try {
      const response = await fetch(`/api/telegram-webapp/containers/${serverId}/${containerId}/${action}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      
      if (data.success) {
        // 刷新容器列表
        await loadContainers(serverId);
        if (selectedContainer?.id === containerId) {
          await loadContainerDetails(serverId, containerId);
        }
      } else {
        setError(data.message || `容器${action}失败`);
      }
    } catch (err) {
      console.error('执行容器操作失败:', err);
      setError(`容器${action}失败`);
    }
  };

  const loadContainerDetails = async (serverId: number, containerId: string) => {
    try {
      const response = await fetch(`/api/telegram-webapp/containers/${serverId}/${containerId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      
      if (data.success) {
        setSelectedContainer(data.container);
      } else {
        setError(data.message || '加载容器详情失败');
      }
    } catch (err) {
      console.error('加载容器详情失败:', err);
      setError('加载容器详情失败');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'success';
      case 'exited':
        return 'error';
      default:
        return 'warning';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'exited':
        return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      default:
        return <ExclamationCircleOutlined style={{ color: '#faad14' }} />;
    }
  };

  const filteredServers = servers.filter(server => 
    server.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    server.host.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        backgroundColor: '#f5f5f5'
      }}>
        <Space direction="vertical" align="center">
          <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
          <Text>正在初始化...</Text>
        </Space>
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
      <Card>
        <div style={{ marginBottom: '16px' }}>
          <Title level={3}>
            <DatabaseOutlined /> Docker Manager
          </Title>
          {user && (
            <Text type="secondary">
              欢迎，{user.first_name} {user.last_name || ''}
            </Text>
          )}
        </div>

        <Tabs defaultActiveKey="servers">
          <TabPane tab={<span><DatabaseOutlined />服务器</span>} key="servers">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Search
                placeholder="搜索服务器..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: 300 }}
              />
              
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
                              {container.status}
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

                <Row gutter={16}>
                  <Col span={8}>
                    <Statistic
                      title="状态"
                      value={selectedContainer.status}
                      prefix={getStatusIcon(selectedContainer.status)}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title="创建时间"
                      value={new Date(selectedContainer.created).toLocaleString()}
                    />
                  </Col>
                </Row>

                <Divider />

                <Space>
                  <Button
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    onClick={() => executeContainerAction(selectedServer!.id, selectedContainer.id, 'start')}
                    disabled={selectedContainer.status === 'running'}
                  >
                    启动
                  </Button>
                  <Button
                    icon={<StopOutlined />}
                    onClick={() => executeContainerAction(selectedServer!.id, selectedContainer.id, 'stop')}
                    disabled={selectedContainer.status !== 'running'}
                  >
                    停止
                  </Button>
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={() => executeContainerAction(selectedServer!.id, selectedContainer.id, 'restart')}
                  >
                    重启
                  </Button>
                </Space>
              </Space>
            </TabPane>
          )}
        </Tabs>
      </Card>
    </div>
  );
};

export default TelegramWebApp;