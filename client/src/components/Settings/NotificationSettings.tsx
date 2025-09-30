import React, { useState, useEffect } from 'react'
import { 
  Form, 
  Button, 
  Card, 
  Typography, 
  message, 
  Space,
  Divider,
  Row,
  Col,
  Switch,
  InputNumber,
  List,
  Modal,
  Input
} from 'antd'
import { 
  BellOutlined, 
  MailOutlined, 
  PhoneOutlined,
  SaveOutlined,
  ExperimentOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined
} from '@ant-design/icons'
import { useMutation, useQuery } from 'react-query'
import { settingsAPI } from '../../services/api'

const { Title, Text } = Typography

interface NotificationSettings {
  emailNotifications: boolean
  telegramNotifications: boolean
  browserNotifications: boolean
  emailAddress: string
  telegramId: string
  containerEvents: boolean
  serverAlerts: boolean
  systemUpdates: boolean
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

const NotificationSettings: React.FC = () => {
  const [form] = Form.useForm()
  const [testModalVisible, setTestModalVisible] = useState(false)
  const [testType, setTestType] = useState('')

  // 获取通知设置
  const { data: settings } = useQuery(
    'notificationSettings',
    () => settingsAPI.getNotificationSettings(),
    {
      select: (response) => response.data.settings
    }
  )

  // 更新通知设置
  const updateMutation = useMutation(
    (data: NotificationSettings) => settingsAPI.updateNotificationSettings(data),
    {
      onSuccess: () => {
        message.success('通知设置保存成功')
      },
      onError: (error: any) => {
        message.error(error.response?.data?.message || '保存失败')
      }
    }
  )

  // 测试通知
  const testMutation = useMutation(
    (type: string) => settingsAPI.testNotification(type as 'email' | 'telegram' | 'browser'),
    {
      onSuccess: (response) => {
        message.success(response.data.message)
        setTestModalVisible(false)
      },
      onError: (error: any) => {
        message.error(error.response?.data?.message || '测试失败')
      }
    }
  )

  // 初始化表单数据
  useEffect(() => {
    if (settings) {
      form.setFieldsValue(settings)
    }
  }, [settings, form])

  // 处理表单提交
  const handleSubmit = (values: NotificationSettings) => {
    updateMutation.mutate(values)
  }

  // 处理测试通知
  const handleTestNotification = (type: string) => {
    setTestType(type)
    setTestModalVisible(true)
    testMutation.mutate(type)
  }

  // 通知类型配置
  const notificationTypes = [
    {
      key: 'containerEvents',
      label: '容器事件',
      description: '容器启动、停止、重启等事件通知',
      icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />
    },
    {
      key: 'serverAlerts',
      label: '服务器告警',
      description: '服务器连接失败、服务异常等告警',
      icon: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
    },
    {
      key: 'securityAlerts',
      label: '安全告警',
      description: '登录异常、权限变更等安全相关通知',
      icon: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
    }
  ]

  return (
    <div style={{ padding: '0 24px' }}>
      <Title level={3}>通知设置</Title>
      <Text type="secondary">配置您希望接收的通知类型和方式</Text>
      
      <Divider />

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={settings}
      >
        {/* 通知方式 */}
        <Card title="通知方式" size="small" style={{ marginBottom: 24 }}>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                label="邮件通知"
                name="emailNotifications"
                valuePropName="checked"
                tooltip="通过邮件接收通知"
              >
                <Switch />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="Telegram 通知"
                name="telegramNotifications"
                valuePropName="checked"
                tooltip="通过 Telegram 接收通知"
              >
                <Switch />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="浏览器通知"
                name="browserNotifications"
                valuePropName="checked"
                tooltip="通过浏览器推送接收通知"
              >
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="邮件地址"
                name="emailAddress"
                rules={[
                  { type: 'email', message: '请输入有效的邮箱地址' }
                ]}
              >
                <Input 
                  prefix={<MailOutlined />} 
                  placeholder="请输入邮箱地址"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Telegram ID"
                name="telegramId"
              >
                <Input 
                  prefix={<PhoneOutlined />} 
                  placeholder="请输入 Telegram ID"
                />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* 通知类型 */}
        <Card title="通知类型" size="small" style={{ marginBottom: 24 }}>
          <List
            dataSource={notificationTypes}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Form.Item
                    key={item.key}
                    name={item.key}
                    valuePropName="checked"
                    style={{ margin: 0 }}
                  >
                    <Switch />
                  </Form.Item>
                ]}
              >
                <List.Item.Meta
                  avatar={item.icon}
                  title={item.label}
                  description={item.description}
                />
              </List.Item>
            )}
          />
        </Card>

        {/* 系统监控告警 */}
        <Card title="系统监控告警" size="small" style={{ marginBottom: 24 }}>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                label="磁盘空间不足"
                name="lowDiskSpace"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="CPU 使用率过高"
                name="highCpuUsage"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="内存使用率过高"
                name="highMemoryUsage"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <Divider />

          <Title level={5}>告警阈值设置</Title>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                label="CPU 使用率阈值"
                name={['alertThreshold', 'cpu']}
                tooltip="CPU 使用率超过此值时发送告警"
              >
                <InputNumber 
                  min={50} 
                  max={100} 
                  style={{ width: '100%' }}
                  addonAfter="%"
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="内存使用率阈值"
                name={['alertThreshold', 'memory']}
                tooltip="内存使用率超过此值时发送告警"
              >
                <InputNumber 
                  min={50} 
                  max={100} 
                  style={{ width: '100%' }}
                  addonAfter="%"
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="磁盘使用率阈值"
                name={['alertThreshold', 'disk']}
                tooltip="磁盘使用率超过此值时发送告警"
              >
                <InputNumber 
                  min={50} 
                  max={100} 
                  style={{ width: '100%' }}
                  addonAfter="%"
                />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* 测试通知 */}
        <Card title="测试通知" size="small" style={{ marginBottom: 24 }}>
          <Space wrap>
            <Button 
              icon={<ExperimentOutlined />}
              onClick={() => handleTestNotification('email')}
            >
              测试邮件通知
            </Button>
            <Button 
              icon={<ExperimentOutlined />}
              onClick={() => handleTestNotification('telegram')}
            >
              测试 Telegram 通知
            </Button>
            <Button 
              icon={<ExperimentOutlined />}
              onClick={() => handleTestNotification('browser')}
            >
              测试浏览器通知
            </Button>
          </Space>
        </Card>

        {/* 操作按钮 */}
        <Card size="small">
          <Row justify="end">
            <Button 
              type="primary" 
              htmlType="submit"
              loading={updateMutation.isLoading}
              icon={<SaveOutlined />}
            >
              保存设置
            </Button>
          </Row>
        </Card>
      </Form>

      {/* 测试通知模态框 */}
      <Modal
        title="测试通知"
        open={testModalVisible}
        onCancel={() => setTestModalVisible(false)}
        footer={null}
      >
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <BellOutlined style={{ fontSize: 48, color: '#1890ff', marginBottom: 16 }} />
          <p>正在发送 {testType} 测试通知...</p>
          <Text type="secondary">
            请检查您的 {testType === 'email' ? '邮箱' : 
                        testType === 'telegram' ? 'Telegram' : '浏览器'} 
            是否收到测试通知
          </Text>
        </div>
      </Modal>
    </div>
  )
}

export default NotificationSettings
