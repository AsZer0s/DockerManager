import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Input,
  Modal,
  Form,
  message,
  Popconfirm,
  Tag,
  Tooltip,
  Row,
  Col,
  Statistic,
  Drawer,
  Descriptions,
  Typography,
  Divider,
  Badge,
  Select
} from 'antd';
import {
  SearchOutlined,
  DownloadOutlined,
  DeleteOutlined,
  TagOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  PlusOutlined,
  EyeOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { imageAPI } from '../../services/api';
import { useGlobalServers } from '../../hooks/useGlobalServers';

const { Search } = Input;
const { Text, Title } = Typography;
const { Option } = Select;

interface Image {
  id: string;
  repository: string;
  tag: string;
  imageId: string;
  created: string;
  size: string;
  virtualSize: string;
}

interface ImageInfo {
  id: string;
  repoDigests: string[];
  repoTags: string[];
  parent: string;
  comment: string;
  created: string;
  container: string;
  containerConfig: any;
  dockerVersion: string;
  author: string;
  config: any;
  architecture: string;
  os: string;
  size: number;
  virtualSize: number;
  rootFS: any;
  metadata: any;
}

const ImagesManagement: React.FC = () => {
  const [selectedServer, setSelectedServer] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [pullModalVisible, setPullModalVisible] = useState(false);
  const [tagModalVisible, setTagModalVisible] = useState(false);
  const [imageInfoVisible, setImageInfoVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState<Image | null>(null);
  const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null);
  const [pullForm] = Form.useForm();
  const [tagForm] = Form.useForm();
  const queryClient = useQueryClient();
  const { data: serversData } = useGlobalServers();
  const servers = serversData?.data?.servers || [];

  // 获取镜像列表
  const { data: imagesData, isLoading: imagesLoading, refetch: refetchImages } = useQuery({
    queryKey: ['images', selectedServer, searchTerm],
    queryFn: () => imageAPI.getImages(selectedServer!, searchTerm),
    enabled: !!selectedServer,
    refetchInterval: 30000, // 30秒自动刷新
  });

  // 拉取镜像
  const pullImageMutation = useMutation({
    mutationFn: ({ imageName, tag }: { imageName: string; tag: string }) =>
      imageAPI.pullImage(selectedServer!, imageName, tag),
    onSuccess: () => {
      message.success('镜像拉取成功');
      setPullModalVisible(false);
      pullForm.resetFields();
      refetchImages();
    },
    onError: (error: any) => {
      message.error(`镜像拉取失败: ${error.response?.data?.message || error.message}`);
    },
  });

  // 删除镜像
  const removeImageMutation = useMutation({
    mutationFn: ({ imageId, force }: { imageId: string; force: boolean }) =>
      imageAPI.removeImage(selectedServer!, imageId, force),
    onSuccess: () => {
      message.success('镜像删除成功');
      refetchImages();
    },
    onError: (error: any) => {
      message.error(`镜像删除失败: ${error.response?.data?.message || error.message}`);
    },
  });

  // 修改镜像标签
  const tagImageMutation = useMutation({
    mutationFn: ({ imageId, newTag }: { imageId: string; newTag: string }) =>
      imageAPI.tagImage(selectedServer!, imageId, newTag),
    onSuccess: () => {
      message.success('镜像标签修改成功');
      setTagModalVisible(false);
      tagForm.resetFields();
      refetchImages();
    },
    onError: (error: any) => {
      message.error(`镜像标签修改失败: ${error.response?.data?.message || error.message}`);
    },
  });

  // 获取镜像详细信息
  const getImageInfo = async (imageId: string) => {
    try {
      const response = await imageAPI.getImageInfo(selectedServer!, imageId);
      setImageInfo(response.data.data);
      setImageInfoVisible(true);
    } catch (error: any) {
      message.error(`获取镜像信息失败: ${error.response?.data?.message || error.message}`);
    }
  };

  const handlePullImage = (values: { imageName: string; tag: string }) => {
    pullImageMutation.mutate(values);
  };

  const handleRemoveImage = (imageId: string, force: boolean = false) => {
    removeImageMutation.mutate({ imageId, force });
  };

  const handleTagImage = (values: { newTag: string }) => {
    if (!selectedImage) return;
    tagImageMutation.mutate({ imageId: selectedImage.imageId, newTag: values.newTag });
  };

  const handleShowTagModal = (image: Image) => {
    setSelectedImage(image);
    setTagModalVisible(true);
  };

  const handleShowImageInfo = (image: Image) => {
    setSelectedImage(image);
    getImageInfo(image.imageId);
  };

  const handlePullUpdate = (image: Image) => {
    pullImageMutation.mutate({ 
      imageName: image.repository, 
      tag: image.tag 
    });
  };

  const formatSize = (size: string) => {
    if (!size) return '0 B';
    const bytes = parseInt(size);
    if (isNaN(bytes)) return size;
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unitIndex = 0;
    let sizeValue = bytes;
    
    while (sizeValue >= 1024 && unitIndex < units.length - 1) {
      sizeValue /= 1024;
      unitIndex++;
    }
    
    return `${sizeValue.toFixed(1)} ${units[unitIndex]}`;
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString('zh-CN');
    } catch {
      return dateString;
    }
  };

  const columns = [
    {
      title: '镜像名称',
      dataIndex: 'repository',
      key: 'repository',
      align: 'center' as const,
      render: (text: string, record: Image) => (
        <Space>
          <Text strong>{text}</Text>
          <Tag color="blue">{record.tag}</Tag>
        </Space>
      ),
    },
    {
      title: '镜像ID',
      dataIndex: 'imageId',
      key: 'imageId',
      align: 'center' as const,
      render: (text: string) => (
        <Tooltip title={text || '无镜像ID'} placement="topLeft">
          <Text code style={{ fontSize: '12px', cursor: 'pointer' }}>
            {text ? text.substring(0, 12) + '...' : '-'}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      align: 'center' as const,
      render: (text: string, record: Image) => (
        <Space direction="vertical" size={0}>
          <Text>{formatSize(text)}</Text>
          {record.virtualSize && record.virtualSize !== text && (
            <Text type="secondary" style={{ fontSize: '12px' }}>
              虚拟: {formatSize(record.virtualSize)}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created',
      key: 'created',
      align: 'center' as const,
      render: (text: string) => (
        <Text type="secondary">{formatDate(text)}</Text>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      align: 'center' as const,
      render: (_: any, record: Image) => (
        <Space>
          <Tooltip title="查看详情">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => handleShowImageInfo(record)}
            />
          </Tooltip>
          {record.tag === 'latest' && (
            <Tooltip title="拉取更新">
              <Button
                type="text"
                icon={<DownloadOutlined />}
                onClick={() => handlePullUpdate(record)}
                loading={pullImageMutation.isLoading}
              />
            </Tooltip>
          )}
          <Tooltip title="修改标签">
            <Button
              type="text"
              icon={<TagOutlined />}
              onClick={() => handleShowTagModal(record)}
            />
          </Tooltip>
          <Popconfirm
            title="确定要删除这个镜像吗？"
            description="删除后无法恢复，请谨慎操作"
            onConfirm={() => handleRemoveImage(record.imageId)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const images = imagesData?.data?.data || [];

  return (
    <div>
      <Card>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Select
              placeholder="选择服务器"
              value={selectedServer}
              onChange={setSelectedServer}
              style={{ width: '100%' }}
              allowClear
            >
              {servers?.map(server => (
                <Option key={server.id} value={server.id}>
                  {server.name} ({server.host})
                </Option>
              )) || []}
            </Select>
          </Col>
          <Col span={6}>
            <Search
              placeholder="搜索镜像..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onSearch={(value) => setSearchTerm(value)}
              enterButton={<SearchOutlined />}
              allowClear
              disabled={!selectedServer}
            />
          </Col>
          <Col span={6}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setPullModalVisible(true)}
              disabled={!selectedServer}
            >
              拉取镜像
            </Button>
          </Col>
          <Col span={6}>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => refetchImages()}
              loading={imagesLoading}
              disabled={!selectedServer}
            >
              刷新
            </Button>
          </Col>
        </Row>

        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Statistic
              title="镜像总数"
              value={images.length}
              prefix={<DownloadOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="总大小"
              value={images.reduce((sum, img) => {
                const size = parseInt(img.size) || 0;
                return sum + size;
              }, 0)}
              formatter={(value) => formatSize(value.toString())}
            />
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={images}
          loading={imagesLoading}
          rowKey={(record) => record.imageId || record.id || `image-${record.repository}-${record.tag}`}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
          }}
          scroll={{ x: 800 }}
        />
      </Card>

      {/* 拉取镜像对话框 */}
      <Modal
        title="拉取镜像"
        open={pullModalVisible}
        onCancel={() => {
          setPullModalVisible(false);
          pullForm.resetFields();
        }}
        onOk={() => pullForm.submit()}
        confirmLoading={pullImageMutation.isLoading}
      >
        <Form
          form={pullForm}
          layout="vertical"
          onFinish={handlePullImage}
          initialValues={{ tag: 'latest' }}
        >
          <Form.Item
            name="imageName"
            label="镜像名称"
            rules={[{ required: true, message: '请输入镜像名称' }]}
          >
            <Input placeholder="例如: zer0teams/docker-manager, zer0teams/docker-manager:1.0" />
          </Form.Item>
          <Form.Item
            name="tag"
            label="标签"
            rules={[{ required: true, message: '请输入标签' }]}
          >
            <Input placeholder="例如: latest, 8.0, alpine, 1.0" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 修改标签对话框 */}
      <Modal
        title="修改镜像标签"
        open={tagModalVisible}
        onCancel={() => {
          setTagModalVisible(false);
          tagForm.resetFields();
        }}
        onOk={() => tagForm.submit()}
        confirmLoading={tagImageMutation.isLoading}
      >
        <Form
          form={tagForm}
          layout="vertical"
          onFinish={handleTagImage}
        >
          <Form.Item
            name="newTag"
            label="新标签"
            rules={[{ required: true, message: '请输入新标签' }]}
          >
            <Input placeholder="例如: zer0teams/docker-manager:1.0" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 镜像详情抽屉 */}
      <Drawer
        title="镜像详细信息"
        placement="right"
        width={600}
        open={imageInfoVisible}
        onClose={() => setImageInfoVisible(false)}
      >
        {imageInfo && (
          <div>
            <Title level={4}>基本信息</Title>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="镜像ID">
                <Text code>{imageInfo.id || '未知'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="架构">
                <Tag>{imageInfo.architecture || '未知'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="操作系统">
                <Tag>{imageInfo.os || '未知'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Docker版本">
                {imageInfo.dockerVersion || '未知'}
              </Descriptions.Item>
              <Descriptions.Item label="作者">
                {imageInfo.author || '未知'}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {formatDate(imageInfo.created || '')}
              </Descriptions.Item>
              <Descriptions.Item label="大小">
                {formatSize(imageInfo.size?.toString() || '0')}
              </Descriptions.Item>
              <Descriptions.Item label="虚拟大小">
                {formatSize(imageInfo.virtualSize?.toString() || '0')}
              </Descriptions.Item>
            </Descriptions>

            <Divider />

            <Title level={4}>标签信息</Title>
            <div>
              <Text strong>仓库标签:</Text>
              <div style={{ marginTop: 8 }}>
                {imageInfo.repoTags?.map((tag, index) => (
                  <Tag key={index} color="blue" style={{ marginBottom: 4 }}>
                    {tag}
                  </Tag>
                )) || <Text type="secondary">无标签</Text>}
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <Text strong>仓库摘要:</Text>
              <div style={{ marginTop: 8 }}>
                {imageInfo.repoDigests?.map((digest, index) => (
                  <Tag key={index} color="green" style={{ marginBottom: 4 }}>
                    {digest}
                  </Tag>
                )) || <Text type="secondary">无摘要</Text>}
              </div>
            </div>

            <Divider />

            <Title level={4}>配置信息</Title>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="工作目录">
                {imageInfo.config?.WorkingDir || '/'}
              </Descriptions.Item>
              <Descriptions.Item label="入口点">
                <Text code>{imageInfo.config?.Entrypoint?.join(' ') || '无'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="默认命令">
                <Text code>{imageInfo.config?.Cmd?.join(' ') || '无'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="暴露端口">
                {imageInfo.config?.ExposedPorts ? 
                  Object.keys(imageInfo.config.ExposedPorts).join(', ') : '无'
                }
              </Descriptions.Item>
            </Descriptions>

            {imageInfo.config?.Env && imageInfo.config.Env.length > 0 && (
              <>
                <Divider />
                <Title level={4}>环境变量</Title>
                <div style={{ maxHeight: 200, overflow: 'auto' }}>
                  {imageInfo.config.Env.map((env: string, index: number) => (
                    <Tag key={index} style={{ marginBottom: 4, display: 'block' }}>
                      {env}
                    </Tag>
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

export default ImagesManagement;
