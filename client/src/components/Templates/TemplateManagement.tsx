import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Button,
  Space,
  Input,
  Modal,
  Form,
  message,
  Popconfirm,
  Tag,
  Tooltip,
  Drawer,
  Descriptions,
  Typography,
  Divider,
  Upload,
  Select,
  Badge,
  Tabs,
  List,
  Avatar,
  Progress,
  Timeline,
  Alert
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  DownloadOutlined,
  UploadOutlined,
  PlayCircleOutlined,
  EyeOutlined,
  SettingOutlined,
  FileTextOutlined,
  CloudServerOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { templateAPI } from '../../services/api';
import { useGlobalServers } from '../../hooks/useGlobalServers';

const { Search } = Input;
const { Text, Title, Paragraph } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;

interface Template {
  id: number;
  name: string;
  description: string;
  type: string;
  category: string;
  icon: string;
  config: any;
  compose_file?: string;
  dependencies: string[];
  created_by: number;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

interface Deployment {
  id: number;
  template_id: number;
  server_id: number;
  user_id: number;
  status: string;
  containers: string[];
  deployed_at: string;
  template_name: string;
  server_name: string;
}

const TemplateManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState('templates');
  const [searchTerm, setSearchTerm] = useState('');
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [deployModalVisible, setDeployModalVisible] = useState(false);
  const [detailDrawerVisible, setDetailDrawerVisible] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [deployForm] = Form.useForm();
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const queryClient = useQueryClient();
  const { data: serversData } = useGlobalServers();
  const servers = serversData?.data?.servers || [];

  // 获取Compose文件列表
  const { data: templatesData, isLoading: templatesLoading, refetch: refetchTemplates } = useQuery({
    queryKey: ['templates', searchTerm],
    queryFn: () => templateAPI.getTemplates(),
    refetchInterval: 30000,
  });

  // 获取部署记录
  const { data: deploymentsData, isLoading: deploymentsLoading, refetch: refetchDeployments } = useQuery({
    queryKey: ['deployments'],
    queryFn: () => templateAPI.getDeployments(),
    refetchInterval: 10000, // 10秒刷新部署状态
  });

  // 创建Compose文件
  const createTemplateMutation = useMutation({
    mutationFn: (data: any) => templateAPI.createTemplate(data),
    onSuccess: () => {
      message.success('Compose文件创建成功');
      setCreateModalVisible(false);
      createForm.resetFields();
      refetchTemplates();
    },
    onError: (error: any) => {
        message.error(`Compose文件创建失败: ${error.response?.data?.message || error.message}`);
    },
  });

  // 更新Compose文件
  const updateTemplateMutation = useMutation({
    mutationFn: ({ templateId, data }: { templateId: number; data: any }) =>
      templateAPI.updateTemplate(templateId, data),
    onSuccess: () => {
      message.success('Compose文件更新成功');
      setEditModalVisible(false);
      editForm.resetFields();
      refetchTemplates();
    },
    onError: (error: any) => {
      message.error(`Compose文件更新失败: ${error.response?.data?.message || error.message}`);
    },
  });

  // 删除Compose文件
  const deleteTemplateMutation = useMutation({
    mutationFn: (templateId: number) => templateAPI.deleteTemplate(templateId),
    onSuccess: () => {
      message.success('Compose文件删除成功');
      refetchTemplates();
    },
    onError: (error: any) => {
      message.error(`Compose文件删除失败: ${error.response?.data?.message || error.message}`);
    },
  });

  // 部署模板
  const deployTemplateMutation = useMutation({
    mutationFn: ({ templateId, serverId, params }: { templateId: number; serverId: number; params: any }) =>
      templateAPI.deployTemplate(templateId, serverId, params),
    onSuccess: () => {
      message.success('模板部署成功');
      setDeployModalVisible(false);
      deployForm.resetFields();
      refetchDeployments();
    },
    onError: (error: any) => {
      message.error(`模板部署失败: ${error.response?.data?.message || error.message}`);
    },
  });

  // 导入模板
  const importTemplateMutation = useMutation({
    mutationFn: (file: File) => templateAPI.importTemplate(file),
    onSuccess: () => {
      message.success('模板导入成功');
      refetchTemplates();
    },
    onError: (error: any) => {
      message.error(`模板导入失败: ${error.response?.data?.message || error.message}`);
    },
  });

  const handleCreateTemplate = (values: any) => {
    createTemplateMutation.mutate(values);
  };

  const handleUpdateTemplate = (values: any) => {
    if (!selectedTemplate) return;
    updateTemplateMutation.mutate({ templateId: selectedTemplate.id, data: values });
  };

  const handleDeleteTemplate = (templateId: number) => {
    deleteTemplateMutation.mutate(templateId);
  };

  const handleDeployTemplate = (values: any) => {
    if (!selectedTemplate) return;
    deployTemplateMutation.mutate({
      templateId: selectedTemplate.id,
      serverId: values.serverId,
      params: values
    });
  };

  const handleShowEditModal = (template: Template) => {
    setSelectedTemplate(template);
    editForm.setFieldsValue(template);
    setEditModalVisible(true);
  };

  const handleShowDeployModal = (template: Template) => {
    setSelectedTemplate(template);
    setDeployModalVisible(true);
  };

  const handleShowDetail = (template: Template) => {
    setSelectedTemplate(template);
    setDetailDrawerVisible(true);
  };

  const handleImportTemplate = (file: File) => {
    importTemplateMutation.mutate(file);
    return false; // 阻止默认上传行为
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'deploying':
        return 'processing';
      case 'failed':
        return 'error';
      default:
        return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleOutlined />;
      case 'deploying':
        return <ClockCircleOutlined />;
      case 'failed':
        return <ExclamationCircleOutlined />;
      default:
        return <ClockCircleOutlined />;
    }
  };

  const templates = templatesData?.data?.data || [];
  const deployments = deploymentsData?.data?.data || [];

  const filteredTemplates = templates.filter(template =>
    template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    template.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      <Card>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={8}>
            <Search
              placeholder="搜索Compose文件..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onSearch={(value) => setSearchTerm(value)}
              allowClear
            />
          </Col>
          <Col span={8}>
            <Space>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setCreateModalVisible(true)}
              >
                创建Compose
              </Button>
              <Upload
                accept=".json,.yaml,.yml"
                beforeUpload={handleImportTemplate}
                showUploadList={false}
              >
                <Button icon={<UploadOutlined />}>
                  导入Compose
                </Button>
              </Upload>
            </Space>
          </Col>
        </Row>

        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <TabPane tab="Compose文件" key="templates">
            <Row gutter={[16, 16]}>
              {filteredTemplates.map(template => (
                <Col xs={24} sm={12} md={8} lg={6} key={template.id}>
                  <Card
                    hoverable
                    cover={
                      <div style={{ height: 120, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Avatar size={64} icon={<CloudServerOutlined />} />
                      </div>
                    }
                    actions={[
                      <Tooltip title="查看详情">
                        <Button
                          type="text"
                          icon={<EyeOutlined />}
                          onClick={() => handleShowDetail(template)}
                        />
                      </Tooltip>,
                      <Tooltip title="编辑模板">
                        <Button
                          type="text"
                          icon={<EditOutlined />}
                          onClick={() => handleShowEditModal(template)}
                        />
                      </Tooltip>,
                      <Tooltip title="部署模板">
                        <Button
                          type="text"
                          icon={<PlayCircleOutlined />}
                          onClick={() => handleShowDeployModal(template)}
                        />
                      </Tooltip>,
                      <Popconfirm
                        title="确定要删除这个模板吗？"
                        onConfirm={() => handleDeleteTemplate(template.id)}
                        okText="确定"
                        cancelText="取消"
                      >
                        <Button
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                        />
                      </Popconfirm>
                    ]}
                  >
                    <Card.Meta
                      title={
                        <Text strong>{template.name}</Text>
                      }
                      description={
                        <div>
                          <Paragraph ellipsis={{ rows: 2 }}>
                            {template.description}
                          </Paragraph>
                          <Space>
                            <Tag color="green">{template.category}</Tag>
                            <Text type="secondary" style={{ fontSize: '12px' }}>
                              创建者: {template.created_by_name}
                            </Text>
                          </Space>
                        </div>
                      }
                    />
                  </Card>
                </Col>
              ))}
            </Row>
          </TabPane>

          <TabPane tab="运行状态" key="deployments">
            <List
              dataSource={deployments}
              loading={deploymentsLoading}
              renderItem={(deployment: Deployment) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={
                      <Space>
                        <Badge status={getStatusColor(deployment.status)} />
                        {getStatusIcon(deployment.status)}
                      </Space>
                    }
                    title={
                      <Space>
                        <Text strong>{deployment.template_name}</Text>
                        <Tag color="blue">{deployment.server_name}</Tag>
                      </Space>
                    }
                    description={
                      <div>
                        <Text type="secondary">
                          部署时间: {new Date(deployment.deployed_at).toLocaleString('zh-CN')}
                        </Text>
                        <br />
                        <Text type="secondary">
                          容器: {deployment.containers.join(', ')}
                        </Text>
                      </div>
                    }
                  />
                </List.Item>
              )}
            />
          </TabPane>
        </Tabs>
      </Card>

      {/* 创建Compose对话框 */}
      <Modal
        title="创建Compose文件"
        open={createModalVisible}
        onCancel={() => {
          setCreateModalVisible(false);
          createForm.resetFields();
        }}
        onOk={() => createForm.submit()}
        confirmLoading={createTemplateMutation.isLoading}
        width={800}
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreateTemplate}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="模板名称"
                rules={[{ required: true, message: '请输入模板名称' }]}
              >
                <Input placeholder="例如: Nginx Web Server" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="category"
                label="分类"
                rules={[{ required: true, message: '请选择分类' }]}
              >
                <Select placeholder="选择分类">
                  <Option value="web">Web服务</Option>
                  <Option value="database">数据库</Option>
                  <Option value="cache">缓存</Option>
                  <Option value="cms">内容管理</Option>
                  <Option value="monitoring">监控</Option>
                  <Option value="development">开发工具</Option>
                  <Option value="other">其他</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          
          <Form.Item
            name="description"
            label="描述"
            rules={[{ required: true, message: '请输入描述' }]}
          >
            <Input.TextArea rows={3} placeholder="描述Compose文件的用途和特点" />
          </Form.Item>

          <Form.Item
            name="icon"
            label="图标"
          >
            <Input placeholder="例如: nginx, mysql, redis" />
          </Form.Item>

          <Form.Item
            name="config"
            label="容器配置"
            rules={[{ required: true, message: '请输入容器配置' }]}
          >
            <Input.TextArea
              rows={8}
              placeholder='{"image": "nginx:latest", "ports": ["80:80"], "volumes": ["./nginx.conf:/etc/nginx/nginx.conf"]}'
            />
          </Form.Item>

          <Form.Item
            name="compose_file"
            label="Docker Compose文件"
          >
            <Input.TextArea
              rows={6}
              placeholder="version: '3.8'&#10;services:&#10;  nginx:&#10;    image: nginx:latest&#10;    ports:&#10;      - '80:80'"
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑模板对话框 */}
      <Modal
        title="编辑模板"
        open={editModalVisible}
        onCancel={() => {
          setEditModalVisible(false);
          editForm.resetFields();
        }}
        onOk={() => editForm.submit()}
        confirmLoading={updateTemplateMutation.isLoading}
        width={800}
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={handleUpdateTemplate}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="模板名称"
                rules={[{ required: true, message: '请输入模板名称' }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="category"
                label="分类"
                rules={[{ required: true, message: '请选择分类' }]}
              >
                <Select>
                  <Option value="web">Web服务</Option>
                  <Option value="database">数据库</Option>
                  <Option value="cache">缓存</Option>
                  <Option value="cms">内容管理</Option>
                  <Option value="monitoring">监控</Option>
                  <Option value="development">开发工具</Option>
                  <Option value="other">其他</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          
          <Form.Item
            name="description"
            label="描述"
            rules={[{ required: true, message: '请输入描述' }]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>

          <Form.Item
            name="icon"
            label="图标"
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="config"
            label="容器配置"
            rules={[{ required: true, message: '请输入容器配置' }]}
          >
            <Input.TextArea rows={8} />
          </Form.Item>

          <Form.Item
            name="compose_file"
            label="Docker Compose文件"
          >
            <Input.TextArea rows={6} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 部署模板对话框 */}
      <Modal
        title="部署模板"
        open={deployModalVisible}
        onCancel={() => {
          setDeployModalVisible(false);
          deployForm.resetFields();
        }}
        onOk={() => deployForm.submit()}
        confirmLoading={deployTemplateMutation.isLoading}
      >
        <Form
          form={deployForm}
          layout="vertical"
          onFinish={handleDeployTemplate}
        >
          <Form.Item
            name="serverId"
            label="选择服务器"
            rules={[{ required: true, message: '请选择服务器' }]}
          >
            <Select placeholder="选择要部署的服务器">
              {servers?.map(server => (
                <Option key={server.id} value={server.id}>
                  {server.name} ({server.host})
                </Option>
              )) || []}
            </Select>
          </Form.Item>

          <Form.Item
            name="projectName"
            label="项目名称"
            initialValue={selectedTemplate?.name.toLowerCase().replace(/\s+/g, '-')}
          >
            <Input placeholder="部署项目的名称" />
          </Form.Item>

          <Form.Item
            name="containerName"
            label="容器名称"
          >
            <Input placeholder="自定义容器名称（可选）" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 模板详情抽屉 */}
      <Drawer
        title="模板详细信息"
        placement="right"
        width={600}
        open={detailDrawerVisible}
        onClose={() => setDetailDrawerVisible(false)}
      >
        {selectedTemplate && (
          <div>
            <Title level={4}>{selectedTemplate.name}</Title>
            <Paragraph>{selectedTemplate.description}</Paragraph>
            
            <Divider />
            
            <Title level={5}>基本信息</Title>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="分类">
                <Tag color="green">{selectedTemplate.category}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="类型">
                <Tag color="blue">{selectedTemplate.type}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="创建者">
                {selectedTemplate.created_by_name}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {new Date(selectedTemplate.created_at).toLocaleString('zh-CN')}
              </Descriptions.Item>
              <Descriptions.Item label="更新时间">
                {new Date(selectedTemplate.updated_at).toLocaleString('zh-CN')}
              </Descriptions.Item>
            </Descriptions>

            <Divider />

            <Title level={5}>容器配置</Title>
            <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, overflow: 'auto' }}>
              {JSON.stringify(selectedTemplate.config, null, 2)}
            </pre>

            {selectedTemplate.compose_file && (
              <>
                <Divider />
                <Title level={5}>Docker Compose文件</Title>
                <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, overflow: 'auto' }}>
                  {selectedTemplate.compose_file}
                </pre>
              </>
            )}

            {selectedTemplate.dependencies && selectedTemplate.dependencies.length > 0 && (
              <>
                <Divider />
                <Title level={5}>依赖服务</Title>
                <div>
                  {selectedTemplate.dependencies.map((dep, index) => (
                    <Tag key={index} color="orange">{dep}</Tag>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default TemplateManagement;
