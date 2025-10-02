import React, { useState, useEffect } from 'react'
import { 
  Form, 
  Button, 
  Card, 
  Typography, 
  notification, 
  Space,
  Divider,
  Row,
  Col,
  InputNumber,
  Input,
  Select,
  Switch
} from 'antd'
import { 
  SaveOutlined,
  InfoCircleOutlined,
  GlobalOutlined
} from '@ant-design/icons'
import { useMutation, useQuery } from 'react-query'
import { settingsAPI } from '../../services/api'
import { useThemeStore } from '../../stores/themeStore'

const { Title, Text } = Typography

interface SystemSettings {
  refreshInterval: number
  pageSize: number
  proxyEnabled: boolean
  proxyType: 'http' | 'socks5'
  proxyHost: string
  proxyPort: number
  proxyUsername?: string
  proxyPassword?: string
}

interface IpInfoResult {
  ip: string
  city: string
  region: string
  country: string
  loc: string
  org: string
  timezone: string
  readme?: string
}

const SystemSettings: React.FC = () => {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [testResult, setTestResult] = useState<string>('')
  const { isDark } = useThemeStore()

  // 获取系统设置
  const { data: settings } = useQuery(
    'systemSettings',
    () => settingsAPI.getSystemSettings(),
    {
      select: (response) => response.data.settings
    }
  )

  // 更新系统设置
  const updateMutation = useMutation(
    (data: SystemSettings) => settingsAPI.updateSystemSettings(data),
    {
      onSuccess: () => {
        notification.success({
          message: '保存成功',
          description: '系统设置保存成功',
          placement: 'topRight',
        })
      },
      onError: (error: any) => {
        notification.error({
          message: '保存失败',
          description: error.response?.data?.message || '系统设置保存失败',
          placement: 'topRight',
        })
      }
    }
  )

  // 测试代理
  const testProxyMutation = useMutation(
    (proxyConfig: any) => settingsAPI.testProxy(proxyConfig),
    {
      onSuccess: (response) => {
        const result = response.data.result
        // 格式化显示结果
        if (typeof result === 'object' && result !== null) {
          const ipInfo = result as IpInfoResult
          const formattedResult = `IP地址: ${ipInfo.ip}
城市: ${ipInfo.city}
地区: ${ipInfo.region}
国家: ${ipInfo.country}
位置: ${ipInfo.loc}
运营商: ${ipInfo.org}
时区: ${ipInfo.timezone}`
          setTestResult(formattedResult)
        } else {
          setTestResult(result)
        }
        notification.success({
          message: '测试成功',
          description: '代理连接测试成功',
          placement: 'topRight',
        })
      },
      onError: (error: any) => {
        setTestResult('')
        notification.error({
          message: '测试失败',
          description: error.response?.data?.message || '代理连接测试失败',
          placement: 'topRight',
        })
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
  const handleSubmit = (values: SystemSettings) => {
    setLoading(true)
    updateMutation.mutate(values, {
      onSettled: () => {
        setLoading(false)
      }
    })
  }


  // 重置设置
  const handleReset = () => {
    form.resetFields()
    notification.info({
      message: '设置重置',
      description: '系统设置已重置为默认值',
      placement: 'topRight',
    })
  }

  // 测试代理
  const handleTestProxy = () => {
    const values = form.getFieldsValue()
    if (!values.proxyEnabled) {
      notification.warning({
        message: '代理未启用',
        description: '请先启用代理',
        placement: 'topRight',
      })
      return
    }
    
    if (!values.proxyHost || !values.proxyPort) {
      notification.warning({
        message: '配置不完整',
        description: '请填写完整的代理配置',
        placement: 'topRight',
      })
      return
    }

    const proxyConfig = {
      proxyType: values.proxyType,
      proxyHost: values.proxyHost,
      proxyPort: values.proxyPort,
      proxyUsername: values.proxyUsername || '',
      proxyPassword: values.proxyPassword || ''
    }

    testProxyMutation.mutate(proxyConfig)
  }

  return (
    <div style={{ padding: '0 24px' }}>
      <Title level={3}>系统设置</Title>
      <Text type="secondary">配置系统行为和界面偏好</Text>
      
      <Divider />

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={settings}
      >

        {/* 界面设置 */}
        <Card title="界面设置" size="small" style={{ marginBottom: 24 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="每页显示数量"
                name="pageSize"
                tooltip="设置列表页面每页显示的项目数量"
              >
                <InputNumber min={10} max={100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="刷新间隔"
                name="refreshInterval"
                tooltip="自动刷新的时间间隔（秒）"
              >
                <InputNumber 
                  min={10} 
                  max={300} 
                  style={{ width: '100%' }}
                  addonAfter="秒"
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={24}>
              <Text type="secondary">
                <InfoCircleOutlined /> 建议刷新间隔为30-60秒
              </Text>
            </Col>
          </Row>
        </Card>

        {/* 代理设置 */}
        <Card title="代理设置" size="small" style={{ marginBottom: 24 }}>
          <Form.Item
            label="启用代理"
            name="proxyEnabled"
            valuePropName="checked"
            tooltip="启用HTTP/SOCKS5代理服务器"
          >
            <Switch />
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => 
              prevValues.proxyEnabled !== currentValues.proxyEnabled
            }
          >
            {({ getFieldValue }) => {
              const proxyEnabled = getFieldValue('proxyEnabled')
              return proxyEnabled ? (
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item
                      label="代理类型"
                      name="proxyType"
                      rules={[{ required: true, message: '请选择代理类型' }]}
                    >
                      <Select>
                        <Select.Option value="http">HTTP</Select.Option>
                        <Select.Option value="socks5">SOCKS5</Select.Option>
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item
                      label="代理主机"
                      name="proxyHost"
                      rules={[
                        { required: true, message: '请输入代理主机地址' },
                        { pattern: /^[\w\.-]+$/, message: '请输入有效的主机地址' }
                      ]}
                    >
                      <Input placeholder="例如: 127.0.0.1" />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item
                      label="代理端口"
                      name="proxyPort"
                      rules={[
                        { required: true, message: '请输入代理端口' },
                        { type: 'number', min: 1, max: 65535, message: '端口范围: 1-65535' }
                      ]}
                    >
                      <InputNumber 
                        min={1} 
                        max={65535} 
                        style={{ width: '100%' }}
                        placeholder="例如: 8080"
                      />
                    </Form.Item>
                  </Col>
                </Row>
              ) : null
            }}
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => 
              prevValues.proxyEnabled !== currentValues.proxyEnabled
            }
          >
            {({ getFieldValue }) => {
              const proxyEnabled = getFieldValue('proxyEnabled')
              return proxyEnabled ? (
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item
                      label="用户名（可选）"
                      name="proxyUsername"
                    >
                      <Input placeholder="代理服务器用户名" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      label="密码（可选）"
                      name="proxyPassword"
                    >
                      <Input.Password placeholder="代理服务器密码" />
                    </Form.Item>
                  </Col>
                </Row>
              ) : null
            }}
          </Form.Item>

          <Row gutter={16}>
            <Col span={24}>
              <Text type="secondary">
                <InfoCircleOutlined /> 代理设置将应用于所有网络请求，包括Docker API调用
              </Text>
            </Col>
          </Row>

          <Row gutter={16} style={{ marginTop: 16 }}>
            <Col span={24}>
              <Space>
                <Button 
                  type="default"
                  icon={<GlobalOutlined />}
                  loading={testProxyMutation.isLoading}
                  onClick={handleTestProxy}
                >
                  测试代理连接
                </Button>
                <Text type="secondary">
                  测试代理是否正常工作
                </Text>
              </Space>
            </Col>
          </Row>

          {testResult && (
            <Row gutter={16} style={{ marginTop: 16 }}>
              <Col span={24}>
                <div style={{ 
                  background: isDark ? '#162312' : '#f6ffed', 
                  border: `1px solid ${isDark ? '#274916' : '#b7eb8f'}`, 
                  borderRadius: '6px', 
                  padding: '12px',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  whiteSpace: 'pre-wrap'
                }}>
                  <Text strong style={{ color: isDark ? '#73d13d' : '#52c41a' }}>代理测试结果：</Text>
                  <br />
                  {testResult}
                </div>
              </Col>
            </Row>
          )}
        </Card>

        {/* 操作按钮 */}
        <Card size="small">
          <Row justify="space-between" align="middle">
            <Col>
              <Space>
                <InfoCircleOutlined style={{ color: '#1890ff' }} />
                <Text type="secondary">
                  设置将在保存后立即生效
                </Text>
              </Space>
            </Col>
            <Col>
              <Space>
                <Button onClick={handleReset}>
                  重置
                </Button>
                <Button 
                  type="primary" 
                  htmlType="submit"
                  loading={loading}
                  icon={<SaveOutlined />}
                >
                  保存设置
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>
      </Form>
    </div>
  )
}

export default SystemSettings
