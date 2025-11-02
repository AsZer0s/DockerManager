import React, { useState } from 'react'
import { 
  Form, 
  Input, 
  Button, 
  Card, 
  Typography, 
  notification, 
  Space,
  Divider,
  Modal,
  Alert,
  Row,
  Col
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
        notification.success({
          message: '修改成功',
          description: '密码修改成功',
          placement: 'topRight',
        })
        setChangePasswordVisible(false)
        passwordForm.resetFields()
      },
      onError: (error: any) => {
        notification.error({
          message: '修改失败',
          description: error.response?.data?.message || '密码修改失败',
          placement: 'topRight',
        })
      }
    }
  )

  // 修改邮箱
  const changeEmailMutation = useMutation(
    (data: { email: string }) => settingsAPI.updateProfile(data),
    {
      onSuccess: () => {
        notification.success({
          message: '修改成功',
          description: '邮箱修改成功',
          placement: 'topRight',
        })
        setChangeEmailVisible(false)
        emailForm.resetFields()
        queryClient.invalidateQueries('userProfile')
      },
      onError: (error: any) => {
        notification.error({
          message: '修改失败',
          description: error.response?.data?.message || '邮箱修改失败',
          placement: 'topRight',
        })
      }
    }
  )

  // 发送验证码
  const sendCodeMutation = useMutation(
    (telegramId: string) => 
      settingsAPI.sendTelegramCode(telegramId),
    {
      onSuccess: () => {
        notification.success({
          message: '验证码已发送',
          description: '请检查您的Telegram',
          placement: 'topRight',
        })
        setBindTelegramVisible(false)
        setVerificationCodeVisible(true)
      },
      onError: (error: any) => {
        notification.error({
          message: '发送失败',
          description: error.response?.data?.message || '发送验证码失败',
          placement: 'topRight',
        })
      }
    }
  )


  // 完成绑定
  const completeBindingMutation = useMutation(
    (data: { telegramId: string; code: string; userId: number }) => 
      settingsAPI.completeTelegramBinding(data.telegramId, data.code, data.userId),
    {
      onSuccess: () => {
        notification.success({
          message: '绑定成功',
          description: 'Telegram绑定成功',
          placement: 'topRight',
        })
        setVerificationCodeVisible(false)
        verificationForm.resetFields()
        queryClient.invalidateQueries('userProfile')
      },
      onError: (error: any) => {
        notification.error({
          message: '绑定失败',
          description: error.response?.data?.message || 'Telegram绑定失败',
          placement: 'topRight',
        })
      }
    }
  )


  // 发送解绑验证码
  const sendUnbindCodeMutation = useMutation(
    (userId: number) => 
      settingsAPI.sendUnbindCode(userId),
    {
      onSuccess: () => {
        notification.success({
          message: '验证码已发送',
          description: '解绑验证码已发送，请检查您的Telegram',
          placement: 'topRight',
        })
        setUnbindCodeVisible(true)
      },
      onError: (error: any) => {
        notification.error({
          message: '发送失败',
          description: error.response?.data?.message || '发送解绑验证码失败',
          placement: 'topRight',
        })
      }
    }
  )

  // 验证解绑验证码
  const verifyUnbindCodeMutation = useMutation(
    (data: { userId: number; code: string }) => 
      settingsAPI.verifyUnbindCode(data.userId, data.code),
    {
      onSuccess: () => {
        notification.success({
          message: '解绑成功',
          description: 'Telegram解绑成功',
          placement: 'topRight',
        })
        setUnbindCodeVisible(false)
        unbindForm.resetFields()
        queryClient.invalidateQueries('userProfile')
      },
      onError: (error: any) => {
        notification.error({
          message: '解绑失败',
          description: error.response?.data?.message || 'Telegram解绑失败',
          placement: 'topRight',
        })
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
      notification.error({
        message: '获取失败',
        description: '用户信息获取失败，请重新登录',
        placement: 'topRight',
      })
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
      notification.error({
        message: '获取失败',
        description: '用户信息获取失败，请重新登录',
        placement: 'topRight',
      })
      return
    }
    
    sendUnbindCodeMutation.mutate(user.id)
  }

  // 处理解绑验证码验证
  const handleVerifyUnbindCode = (values: any) => {
    if (!user?.id) {
      notification.error({
        message: '获取失败',
        description: '用户信息获取失败，请重新登录',
        placement: 'topRight',
      })
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
        notification.success({
          message: '功能待实现',
          description: '账户删除功能待实现',
          placement: 'topRight',
        })
      }
    })
  }

  return (
    <div>
      <style>{`
        /* Apple-style 账户设置 */
        .account-settings {
          max-width: 800px;
          margin: 0 auto;
        }
        
        .settings-header {
          text-align: center;
          margin-bottom: 48px;
        }
        
        .settings-title {
          font-size: 2rem !important;
          font-weight: 700 !important;
          margin-bottom: 8px !important;
          background: linear-gradient(135deg, #007AFF 0%, #5856D6 100%) !important;
          -webkit-background-clip: text !important;
          -webkit-text-fill-color: transparent !important;
          background-clip: text !important;
          color: transparent !important;
          letter-spacing: -0.02em !important;
        }
        
        .settings-description {
          color: #6b7280 !important;
          font-size: 1.1rem !important;
          font-weight: 400 !important;
        }
        
        .settings-section {
          background: white;
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 16px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          border: 1px solid #e5e7eb;
        }
        
        .settings-section:hover {
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          transform: translateY(-2px);
        }
        
        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        
        .section-info {
          flex: 1;
        }
        
        .section-title {
          font-size: 1.1rem !important;
          font-weight: 600 !important;
          color: #1f2937 !important;
          margin-bottom: 4px !important;
          display: flex;
          align-items: center;
        }
        
        .section-title .anticon {
          margin-right: 8px !important;
          color: #007AFF !important;
          font-size: 18px !important;
        }
        
        .section-description {
          color: #6b7280 !important;
          font-size: 0.95rem !important;
          font-weight: 400 !important;
        }
        
        .section-actions {
          display: flex;
          gap: 8px;
        }
        
        .settings-button {
          border-radius: 12px !important;
          font-weight: 500 !important;
          height: 40px !important;
          padding: 0 20px !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          border: none !important;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important;
        }
        
        .settings-button:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15) !important;
        }
        
        .settings-button-primary {
          background: linear-gradient(135deg, #007AFF 0%, #5856D6 100%) !important;
        }
        
        .settings-button-danger {
          background: linear-gradient(135deg, #FF3B30 0%, #FF2D92 100%) !important;
        }
        
        .danger-section {
          border: 2px solid #fee2e2 !important;
          background: #fffafa !important;
        }
        
        .danger-section:hover {
          border-color: #fecaca !important;
          box-shadow: 0 4px 6px -1px rgba(239, 68, 68, 0.1), 0 2px 4px -1px rgba(239, 68, 68, 0.06) !important;
        }
        
        .device-info {
          background: #f8fafc;
          padding: 16px;
          border-radius: 12px;
          margin-bottom: 16px;
        }
        
        .device-name {
          font-weight: 600 !important;
          color: #1f2937 !important;
          margin-bottom: 4px !important;
        }
        
        .device-time {
          color: #6b7280 !important;
          font-size: 0.9rem !important;
        }
        
        /* Modal Styles */
        .modal-form .ant-form-item-label > label {
          font-weight: 600 !important;
          color: #374151 !important;
          font-size: 0.95rem !important;
        }
        
        .modal-form .ant-input-affix-wrapper {
          border-radius: 12px !important;
          border: 2px solid #e5e7eb !important;
          padding: 12px 16px !important;
          font-size: 1rem !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        
        .modal-form .ant-input-affix-wrapper:hover {
          border-color: #007AFF !important;
        }
        
        .modal-form .ant-input-affix-wrapper-focused {
          border-color: #007AFF !important;
          box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1) !important;
        }
        
        .modal-form .ant-input {
          border: none !important;
          font-size: 1rem !important;
        }
        
        .modal-form .ant-input-prefix {
          color: #007AFF !important;
        }
        
        .modal-button {
          border-radius: 12px !important;
          height: 44px !important;
          font-weight: 600 !important;
          padding: 0 24px !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        
        .modal-button-primary {
          background: linear-gradient(135deg, #007AFF 0%, #5856D6 100%) !important;
          border: none !important;
          box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3) !important;
        }
        
        .modal-button-primary:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 6px 16px rgba(0, 122, 255, 0.4) !important;
        }
        
        .modal-button-default {
          background: #f3f4f6 !important;
          border: 2px solid #e5e7eb !important;
          color: #374151 !important;
        }
        
        .modal-button-default:hover {
          background: #e5e7eb !important;
          border-color: #d1d5db !important;
        }
        
        .modal-button-danger {
          background: linear-gradient(135deg, #FF3B30 0%, #FF2D92 100%) !important;
          border: none !important;
          box-shadow: 0 4px 12px rgba(255, 59, 48, 0.3) !important;
        }
        
        .modal-button-danger:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 6px 16px rgba(255, 59, 48, 0.4) !important;
        }
        
        .ant-alert {
          border-radius: 12px !important;
          border: none !important;
          font-size: 0.95rem !important;
        }
        
        .ant-alert-info {
          background: linear-gradient(135deg, #e0f2fe 0%, #dbeafe 100%) !important;
          color: #0369a1 !important;
        }
        
        .ant-alert-warning {
          background: linear-gradient(135deg, #fef3c7 0%, #fed7aa 100%) !important;
          color: #92400e !important;
        }
      `}</style>
      
      <div className="account-settings">
        <div className="settings-header">
          <Title level={2} className="settings-title">账户设置</Title>
          <Text className="settings-description">管理您的账户安全和隐私设置</Text>
        </div>

        {/* 密码设置 */}
        <div className="settings-section">
          <div className="section-header">
            <div className="section-info">
              <div className="section-title">
                <LockOutlined />
                登录密码
              </div>
              <div className="section-description">
                定期更新密码以确保账户安全
              </div>
            </div>
            <div className="section-actions">
              <Button 
                type="primary" 
                className="settings-button settings-button-primary"
                icon={<LockOutlined />}
                onClick={() => setChangePasswordVisible(true)}
              >
                修改密码
              </Button>
            </div>
          </div>
        </div>

        {/* 邮箱设置 */}
        <div className="settings-section">
          <div className="section-header">
            <div className="section-info">
              <div className="section-title">
                <MailOutlined />
                邮箱地址
              </div>
              <div className="section-description">
                当前邮箱：{userData?.email || user?.email}
              </div>
            </div>
            <div className="section-actions">
              <Button 
                type="primary" 
                className="settings-button settings-button-primary"
                icon={<MailOutlined />}
                onClick={() => setChangeEmailVisible(true)}
              >
                修改邮箱
              </Button>
            </div>
          </div>
        </div>

        {/* Telegram设置 */}
        <div className="settings-section">
          <div className="section-header">
            <div className="section-info">
              <div className="section-title">
                <SendOutlined />
                Telegram绑定
              </div>
              <div className="section-description">
                {userData?.telegramId ? 
                  `已绑定：ID ${userData.telegramId}` : 
                  '未绑定Telegram账号'
                }
              </div>
            </div>
            <div className="section-actions">
              {userData?.telegramId ? (
                <Button 
                  danger
                  className="settings-button settings-button-danger"
                  onClick={handleUnbindTelegram}
                  loading={sendUnbindCodeMutation.isLoading}
                >
                  解绑
                </Button>
              ) : (
                <Button 
                  type="primary" 
                  className="settings-button settings-button-primary"
                  icon={<SendOutlined />}
                  onClick={() => setBindTelegramVisible(true)}
                >
                  绑定
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* 登录设备 */}
        <div className="settings-section">
          <div className="section-header">
            <div className="section-info">
              <div className="section-title">
                <SafetyOutlined />
                登录设备
              </div>
              <div className="device-info">
                <div className="device-name">
                  {navigator.userAgent.includes('Windows') ? 'Windows' : 
                   navigator.userAgent.includes('Mac') ? 'macOS' : 
                   navigator.userAgent.includes('Linux') ? 'Linux' : '未知系统'}
                </div>
                <div className="device-time">
                  {new Date().toLocaleString()}
                </div>
              </div>
            </div>
            <div className="section-actions">
              <Button type="link" style={{ padding: 0 }}>
                查看所有设备
              </Button>
            </div>
          </div>
        </div>

        {/* 账户删除 */}
        <div className="settings-section danger-section">
          <div className="section-header">
            <div className="section-info">
              <div className="section-title" style={{ color: '#dc2626 !important' }}>
                <ExclamationCircleOutlined style={{ color: '#dc2626 !important' }} />
                删除账户
              </div>
              <div className="section-description">
                永久删除您的账户和所有相关数据，此操作无法撤销
              </div>
            </div>
            <div className="section-actions">
              <Button 
                danger 
                className="settings-button settings-button-danger"
                icon={<ExclamationCircleOutlined />}
                onClick={handleDeleteAccount}
              >
                删除账户
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 修改密码模态框 */}
      <Modal
        title={
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ 
              fontSize: '1.5rem', 
              fontWeight: 600, 
              background: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              color: 'transparent'
            }}>
              修改密码
            </div>
          </div>
        }
        open={changePasswordVisible}
        onCancel={() => setChangePasswordVisible(false)}
        footer={null}
        width={500}
        styles={{
          body: { padding: '24px 32px 32px' },
          content: { borderRadius: '20px', overflow: 'hidden' }
        }}
      >
        <Form
          form={passwordForm}
          layout="vertical"
          onFinish={handleChangePassword}
          className="modal-form"
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

          <Form.Item style={{ marginBottom: 0, textAlign: 'right', marginTop: 32 }}>
            <Space size={12}>
              <Button 
                className="modal-button modal-button-default"
                onClick={() => setChangePasswordVisible(false)}
              >
                取消
              </Button>
              <Button 
                type="primary" 
                className="modal-button modal-button-primary"
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
        title={
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ 
              fontSize: '1.5rem', 
              fontWeight: 600, 
              background: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              color: 'transparent'
            }}>
              修改邮箱
            </div>
          </div>
        }
        open={changeEmailVisible}
        onCancel={() => setChangeEmailVisible(false)}
        footer={null}
        width={500}
        styles={{
          body: { padding: '24px 32px 32px' },
          content: { borderRadius: '20px', overflow: 'hidden' }
        }}
      >
        <Form
          form={emailForm}
          layout="vertical"
          onFinish={handleChangeEmail}
          initialValues={{ email: userData?.email || user?.email }}
          className="modal-form"
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

          <Form.Item style={{ marginBottom: 0, textAlign: 'right', marginTop: 32 }}>
            <Space size={12}>
              <Button 
                className="modal-button modal-button-default"
                onClick={() => setChangeEmailVisible(false)}
              >
                取消
              </Button>
              <Button 
                type="primary" 
                className="modal-button modal-button-primary"
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
        title={
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ 
              fontSize: '1.5rem', 
              fontWeight: 600, 
              background: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              color: 'transparent'
            }}>
              绑定Telegram
            </div>
          </div>
        }
        open={bindTelegramVisible}
        onCancel={() => setBindTelegramVisible(false)}
        footer={null}
        width={500}
        styles={{
          body: { padding: '24px 32px 32px' },
          content: { borderRadius: '20px', overflow: 'hidden' }
        }}
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
          className="modal-form"
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

          <Form.Item style={{ marginBottom: 0, textAlign: 'right', marginTop: 32 }}>
            <Space size={12}>
              <Button 
                className="modal-button modal-button-default"
                onClick={() => setBindTelegramVisible(false)}
              >
                取消
              </Button>
              <Button 
                type="primary" 
                className="modal-button modal-button-primary"
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
        title={
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ 
              fontSize: '1.5rem', 
              fontWeight: 600, 
              background: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              color: 'transparent'
            }}>
              输入验证码
            </div>
          </div>
        }
        open={verificationCodeVisible}
        onCancel={() => {
          setVerificationCodeVisible(false)
          verificationForm.resetFields()
        }}
        footer={null}
        width={400}
        styles={{
          body: { padding: '24px 32px 32px' },
          content: { borderRadius: '20px', overflow: 'hidden' }
        }}
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
          className="modal-form"
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

          <Form.Item style={{ marginBottom: 0, textAlign: 'right', marginTop: 32 }}>
            <Space size={12}>
              <Button 
                className="modal-button modal-button-default"
                onClick={() => {
                  setVerificationCodeVisible(false)
                  verificationForm.resetFields()
                }}>
                取消
              </Button>
              <Button 
                type="primary" 
                className="modal-button modal-button-primary"
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
        title={
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ 
              fontSize: '1.5rem', 
              fontWeight: 600, 
              background: 'linear-gradient(135deg, #FF3B30 0%, #FF2D92 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              color: 'transparent'
            }}>
              输入解绑验证码
            </div>
          </div>
        }
        open={unbindCodeVisible}
        onCancel={() => {
          setUnbindCodeVisible(false)
          unbindForm.resetFields()
        }}
        footer={null}
        width={400}
        styles={{
          body: { padding: '24px 32px 32px' },
          content: { borderRadius: '20px', overflow: 'hidden' }
        }}
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
          className="modal-form"
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

          <Form.Item style={{ marginBottom: 0, textAlign: 'right', marginTop: 32 }}>
            <Space size={12}>
              <Button 
                className="modal-button modal-button-default"
                onClick={() => {
                  setUnbindCodeVisible(false)
                  unbindForm.resetFields()
                }}>
                取消
              </Button>
              <Button 
                danger
                className="modal-button modal-button-danger"
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
