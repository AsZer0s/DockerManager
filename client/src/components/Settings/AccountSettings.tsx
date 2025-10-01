import React, { useState } from 'react'
import { 
  Form, 
  Input, 
  Button, 
  Card, 
  Typography, 
  message, 
  Space,
  Divider,
  Modal,
  Alert,
  Row,
  Col,
  Switch
} from 'antd'
import { 
  LockOutlined, 
  SafetyOutlined, 
  EyeInvisibleOutlined,
  EyeTwoTone,
  ExclamationCircleOutlined,
  MailOutlined,
  SendOutlined
} from '@ant-design/icons'
import { useAuthStore } from '../../stores/authStore'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { authAPI, settingsAPI } from '../../services/api'

const { Title, Text } = Typography

const AccountSettings: React.FC = () => {
  const { user } = useAuthStore()
  const [passwordForm] = Form.useForm()
  const [emailForm] = Form.useForm()
  const [telegramForm] = Form.useForm()
  const [changePasswordVisible, setChangePasswordVisible] = useState(false)
  const [changeEmailVisible, setChangeEmailVisible] = useState(false)
  const [bindTelegramVisible, setBindTelegramVisible] = useState(false)
  const [verificationCodeVisible, setVerificationCodeVisible] = useState(false)
  const [unbindCodeVisible, setUnbindCodeVisible] = useState(false)
  const [currentTelegramId, setCurrentTelegramId] = useState('')
  const [verificationForm] = Form.useForm()
  const [unbindForm] = Form.useForm()
  const queryClient = useQueryClient()

  // 获取用户信息
  const { data: userData } = useQuery(
    'userProfile',
    () => settingsAPI.getProfile(),
    {
      select: (response) => response.data.user
    }
  )

  // 修改密码
  const changePasswordMutation = useMutation(
    (data: { currentPassword: string; newPassword: string }) => 
      authAPI.changePassword(data),
    {
      onSuccess: () => {
        message.success('密码修改成功')
        setChangePasswordVisible(false)
        passwordForm.resetFields()
      },
      onError: (error: any) => {
        message.error(error.response?.data?.message || '密码修改失败')
      }
    }
  )

  // 修改邮箱
  const changeEmailMutation = useMutation(
    (data: { email: string }) => settingsAPI.updateProfile(data),
    {
      onSuccess: () => {
        message.success('邮箱修改成功')
        setChangeEmailVisible(false)
        emailForm.resetFields()
        queryClient.invalidateQueries('userProfile')
      },
      onError: (error: any) => {
        message.error(error.response?.data?.message || '邮箱修改失败')
      }
    }
  )

  // 发送验证码
  const sendCodeMutation = useMutation(
    (telegramId: string) => 
      settingsAPI.sendTelegramCode(telegramId),
    {
      onSuccess: () => {
        message.success('验证码已发送，请检查您的Telegram')
        setBindTelegramVisible(false)
        setVerificationCodeVisible(true)
      },
      onError: (error: any) => {
        message.error(error.response?.data?.message || '发送验证码失败')
      }
    }
  )


  // 完成绑定
  const completeBindingMutation = useMutation(
    (data: { telegramId: string; code: string; userId: number }) => 
      settingsAPI.completeTelegramBinding(data.telegramId, data.code, data.userId),
    {
      onSuccess: () => {
        message.success('Telegram绑定成功')
        setVerificationCodeVisible(false)
        verificationForm.resetFields()
        queryClient.invalidateQueries('userProfile')
      },
      onError: (error: any) => {
        message.error(error.response?.data?.message || '绑定失败')
      }
    }
  )


  // 发送解绑验证码
  const sendUnbindCodeMutation = useMutation(
    (userId: number) => 
      settingsAPI.sendUnbindCode(userId),
    {
      onSuccess: () => {
        message.success('解绑验证码已发送，请检查您的Telegram')
        setUnbindCodeVisible(true)
      },
      onError: (error: any) => {
        message.error(error.response?.data?.message || '发送解绑验证码失败')
      }
    }
  )

  // 验证解绑验证码
  const verifyUnbindCodeMutation = useMutation(
    (data: { userId: number; code: string }) => 
      settingsAPI.verifyUnbindCode(data.userId, data.code),
    {
      onSuccess: () => {
        message.success('Telegram解绑成功')
        setUnbindCodeVisible(false)
        unbindForm.resetFields()
        queryClient.invalidateQueries('userProfile')
      },
      onError: (error: any) => {
        message.error(error.response?.data?.message || '解绑失败')
      }
    }
  )

  // 处理密码修改
  const handleChangePassword = (values: any) => {
    changePasswordMutation.mutate({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword
    })
  }

  // 处理邮箱修改
  const handleChangeEmail = (values: any) => {
    changeEmailMutation.mutate({
      email: values.email
    })
  }

  // 处理Telegram绑定
  const handleBindTelegram = (values: any) => {
    setCurrentTelegramId(values.telegramId)
    sendCodeMutation.mutate(values.telegramId)
  }

  const handleVerifyCode = (values: any) => {
    if (!user?.id) {
      message.error('用户信息获取失败，请重新登录')
      return
    }
    
    completeBindingMutation.mutate({
      telegramId: currentTelegramId,
      code: values.code,
      userId: user.id
    })
  }

  // 处理Telegram解绑
  const handleUnbindTelegram = () => {
    if (!user?.id) {
      message.error('用户信息获取失败，请重新登录')
      return
    }
    
    sendUnbindCodeMutation.mutate(user.id)
  }

  // 处理解绑验证码验证
  const handleVerifyUnbindCode = (values: any) => {
    if (!user?.id) {
      message.error('用户信息获取失败，请重新登录')
      return
    }
    
    verifyUnbindCodeMutation.mutate({
      userId: user.id,
      code: values.code
    })
  }

  // 处理删除账户
  const handleDeleteAccount = () => {
    Modal.confirm({
      title: '确认删除账户',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <Alert
            message="警告"
            description="删除账户后，所有数据将被永久删除且无法恢复。请谨慎操作！"
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <p>请输入您的密码以确认删除：</p>
        </div>
      ),
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk() {
        // 这里需要实现删除账户的API
        message.success('账户删除功能待实现')
      }
    })
  }

  return (
    <div style={{ padding: '0 24px' }}>
      <Title level={3}>账户设置</Title>
      <Text type="secondary">管理您的账户安全和隐私设置</Text>
      
      <Divider />

      {/* 密码设置 */}
      <Card title="密码设置" size="small" style={{ marginBottom: 24 }}>
        <Row gutter={16} align="middle">
          <Col span={16}>
            <div>
              <Text strong>登录密码</Text>
              <br />
              <Text type="secondary">定期更新密码以确保账户安全</Text>
            </div>
          </Col>
          <Col span={8} style={{ textAlign: 'right' }}>
            <Button 
              type="primary" 
              icon={<LockOutlined />}
              onClick={() => setChangePasswordVisible(true)}
            >
              修改密码
            </Button>
          </Col>
        </Row>
      </Card>

      {/* 邮箱设置 */}
      <Card title="邮箱设置" size="small" style={{ marginBottom: 24 }}>
        <Row gutter={16} align="middle">
          <Col span={16}>
            <div>
              <Text strong>邮箱地址</Text>
              <br />
              <Text type="secondary">当前邮箱：{userData?.email || user?.email}</Text>
            </div>
          </Col>
          <Col span={8} style={{ textAlign: 'right' }}>
            <Button 
              type="primary" 
              icon={<MailOutlined />}
              onClick={() => setChangeEmailVisible(true)}
            >
              修改邮箱
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Telegram设置 */}
      <Card title="Telegram设置" size="small" style={{ marginBottom: 24 }}>
        <Row gutter={16} align="middle">
          <Col span={16}>
            <div>
              <Text strong>Telegram绑定</Text>
              <br />
              <Text type="secondary">
                {userData?.telegramId ? 
                  (userData.telegramUsername ? `已绑定：${userData.telegramUsername}` : `已绑定：ID ${userData.telegramId}`) : 
                  '未绑定Telegram账号'
                }
              </Text>
            </div>
          </Col>
          <Col span={8} style={{ textAlign: 'right' }}>
            <Space>
              {userData?.telegramId ? (
                <Button 
                  danger
                  onClick={handleUnbindTelegram}
                  loading={sendUnbindCodeMutation.isLoading}
                >
                  解绑
                </Button>
              ) : (
                <Button 
                  type="primary" 
                  icon={<SendOutlined />}
                  onClick={() => setBindTelegramVisible(true)}
                >
                  绑定
                </Button>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 两步验证 */}
      <Card title="两步验证" size="small" style={{ marginBottom: 24 }}>
        <Row gutter={16} align="middle">
          <Col span={16}>
            <div>
              <Text strong>两步验证</Text>
              <br />
              <Text type="secondary">为您的账户添加额外的安全保护</Text>
            </div>
          </Col>
          <Col span={8} style={{ textAlign: 'right' }}>
            <Switch 
              checked={false} 
              onChange={(checked) => {
                message.info(checked ? '启用两步验证' : '禁用两步验证')
              }}
            />
          </Col>
        </Row>
      </Card>

      {/* 登录设备 */}
      <Card title="登录设备" size="small" style={{ marginBottom: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <Text strong>当前设备</Text>
          <br />
          <Text type="secondary">
            {navigator.userAgent.includes('Windows') ? 'Windows' : 
             navigator.userAgent.includes('Mac') ? 'macOS' : 
             navigator.userAgent.includes('Linux') ? 'Linux' : '未知系统'} - 
            {new Date().toLocaleString()}
          </Text>
        </div>
        <Button type="link" size="small">
          查看所有登录设备
        </Button>
      </Card>

      {/* 账户删除 */}
      <Card title="危险操作" size="small" style={{ borderColor: '#ff4d4f' }}>
        <Row gutter={16} align="middle">
          <Col span={16}>
            <div>
              <Text strong style={{ color: '#ff4d4f' }}>删除账户</Text>
              <br />
              <Text type="secondary">永久删除您的账户和所有相关数据</Text>
            </div>
          </Col>
          <Col span={8} style={{ textAlign: 'right' }}>
            <Button 
              danger 
              icon={<ExclamationCircleOutlined />}
              onClick={handleDeleteAccount}
            >
              删除账户
            </Button>
          </Col>
        </Row>
      </Card>

      {/* 修改密码模态框 */}
      <Modal
        title="修改密码"
        open={changePasswordVisible}
        onCancel={() => setChangePasswordVisible(false)}
        footer={null}
        width={500}
      >
        <Form
          form={passwordForm}
          layout="vertical"
          onFinish={handleChangePassword}
        >
          <Form.Item
            label="当前密码"
            name="currentPassword"
            rules={[{ required: true, message: '请输入当前密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请输入当前密码"
              iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
            />
          </Form.Item>

          <Form.Item
            label="新密码"
            name="newPassword"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码至少6个字符' }
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请输入新密码"
              iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
            />
          </Form.Item>

          <Form.Item
            label="确认新密码"
            name="confirmPassword"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请确认新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'))
                }
              })
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请再次输入新密码"
              iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setChangePasswordVisible(false)}>
                取消
              </Button>
              <Button 
                type="primary" 
                htmlType="submit"
                loading={changePasswordMutation.isLoading}
                icon={<SafetyOutlined />}
              >
                确认修改
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 修改邮箱模态框 */}
      <Modal
        title="修改邮箱"
        open={changeEmailVisible}
        onCancel={() => setChangeEmailVisible(false)}
        footer={null}
        width={500}
      >
        <Form
          form={emailForm}
          layout="vertical"
          onFinish={handleChangeEmail}
          initialValues={{ email: userData?.email || user?.email }}
        >
          <Form.Item
            label="新邮箱地址"
            name="email"
            rules={[
              { required: true, message: '请输入邮箱地址' },
              { type: 'email', message: '请输入有效的邮箱地址' }
            ]}
          >
            <Input
              prefix={<MailOutlined />}
              placeholder="请输入新的邮箱地址"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setChangeEmailVisible(false)}>
                取消
              </Button>
              <Button 
                type="primary" 
                htmlType="submit"
                loading={changeEmailMutation.isLoading}
                icon={<MailOutlined />}
              >
                确认修改
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 绑定Telegram模态框 */}
      <Modal
        title="绑定Telegram"
        open={bindTelegramVisible}
        onCancel={() => setBindTelegramVisible(false)}
        footer={null}
        width={500}
      >
        <Alert
          message="绑定说明"
          description="请输入您的Telegram用户ID。您可以在Telegram中向@userinfobot发送消息获取您的用户ID。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form
          form={telegramForm}
          layout="vertical"
          onFinish={handleBindTelegram}
        >
          <Form.Item
            label="Telegram用户ID"
            name="telegramId"
            rules={[
              { required: true, message: '请输入Telegram用户ID' },
              { pattern: /^\d+$/, message: 'Telegram用户ID必须是数字' }
            ]}
          >
            <Input
              prefix={<SendOutlined />}
              placeholder="请输入Telegram用户ID"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setBindTelegramVisible(false)}>
                取消
              </Button>
              <Button 
                type="primary" 
                htmlType="submit"
                loading={sendCodeMutation.isLoading}
                icon={<SendOutlined />}
              >
                发送验证码
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 验证码输入模态框 */}
      <Modal
        title="输入验证码"
        open={verificationCodeVisible}
        onCancel={() => {
          setVerificationCodeVisible(false)
          verificationForm.resetFields()
        }}
        footer={null}
        width={400}
      >
        <Alert
          message="验证码已发送"
          description={`验证码已发送到您的Telegram (ID: ${currentTelegramId})，请输入6位验证码完成绑定。`}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form
          form={verificationForm}
          layout="vertical"
          onFinish={handleVerifyCode}
        >
          <Form.Item
            label="验证码"
            name="code"
            rules={[
              { required: true, message: '请输入验证码' },
              { pattern: /^\d{6}$/, message: '验证码必须是6位数字' }
            ]}
          >
            <Input
              placeholder="请输入6位验证码"
              maxLength={6}
              style={{ textAlign: 'center', fontSize: '18px', letterSpacing: '2px' }}
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setVerificationCodeVisible(false)
                verificationForm.resetFields()
              }}>
                取消
              </Button>
              <Button 
                type="primary" 
                htmlType="submit"
                loading={completeBindingMutation.isLoading}
              >
                确认绑定
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 解绑验证码输入模态框 */}
      <Modal
        title="输入解绑验证码"
        open={unbindCodeVisible}
        onCancel={() => {
          setUnbindCodeVisible(false)
          unbindForm.resetFields()
        }}
        footer={null}
        width={400}
      >
        <Alert
          message="解绑验证码已发送"
          description="验证码已发送到您的Telegram，请输入6位验证码完成解绑操作。"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form
          form={unbindForm}
          layout="vertical"
          onFinish={handleVerifyUnbindCode}
        >
          <Form.Item
            label="验证码"
            name="code"
            rules={[
              { required: true, message: '请输入验证码' },
              { pattern: /^\d{6}$/, message: '验证码必须是6位数字' }
            ]}
          >
            <Input
              placeholder="请输入6位验证码"
              maxLength={6}
              style={{ textAlign: 'center', fontSize: '18px', letterSpacing: '2px' }}
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setUnbindCodeVisible(false)
                unbindForm.resetFields()
              }}>
                取消
              </Button>
              <Button 
                danger
                htmlType="submit"
                loading={verifyUnbindCodeMutation.isLoading}
              >
                确认解绑
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default AccountSettings
