import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Row,
  Col,
  Tag,
  Popconfirm,
  message,
  notification,
  Typography,
  Descriptions,
  Divider,
  Tooltip,
  Switch,
  Checkbox,
  Select
} from 'antd';

const { Option } = Select;
import {
  PlusOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  DatabaseOutlined,
  FolderOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { volumeAPI } from '../../services/api';
import { useGlobalServers } from '../../hooks/useGlobalServers';

const { Text, Title } = Typography;

interface DockerVolume {
  Name: string;
  Driver: string;
  Mountpoint: string;
  CreatedAt: string;
  Labels: Record<string, string>;
  Scope: string;
  Options: Record<string, string>;
  UsageData?: {
    Size: number;
    RefCount: number;
  };
}

const VolumesManagement: React.FC = () => {
  const [selectedServer, setSelectedServer] = useState<number | null>(null);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedVolume, setSelectedVolume] = useState<DockerVolume | null>(null);
  const [createForm] = Form.useForm();
  const queryClient = useQueryClient();

  const { data: serversData } = useGlobalServers();
  const servers = serversData?.data?.servers || [];

  // 获取卷列表
  const { data: volumesData, isLoading, refetch } = useQuery(
    ['volumes', selectedServer],
    () => volumeAPI.getVolumes(selectedServer!),
    {
      enabled: !!selectedServer,
      refetchInterval: 30000,
    }
  );

  const volumes = Array.isArray(volumesData?.data?.data) ? volumesData.data.data : [];

  // 创建卷
  const createVolumeMutation = useMutation(
    (data: any) => volumeAPI.createVolume(selectedServer!, data),
    {
      onSuccess: () => {
        notification.success({
          message: '卷创建成功',
          description: '卷已成功创建',
          placement: 'topRight',
        });
        setCreateModalVisible(false);
        createForm.resetFields();
        queryClient.invalidateQueries(['volumes', selectedServer]);
      },
      onError: (error: any) => {
        notification.error({
          message: '创建卷失败',
          description: error.response?.data?.message || error.message,
          placement: 'topRight',
        });
      },
    }
  );

  // 删除卷
  const removeVolumeMutation = useMutation(
    ({ volumeName, force }: { volumeName: string; force?: boolean }) =>
      volumeAPI.removeVolume(selectedServer!, volumeName, force),
    {
      onSuccess: () => {
        notification.success({
          message: '卷删除成功',
          description: '卷已成功删除',
          placement: 'topRight',
        });
        queryClient.invalidateQueries(['volumes', selectedServer]);
      },
      onError: (error: any) => {
        notification.error({
          message: '删除卷失败',
          description: error.response?.data?.message || error.message,
          placement: 'topRight',
        });
      },
    }
  );

  // 清理未使用卷
  const pruneVolumesMutation = useMutation(
    () => volumeAPI.pruneVolumes(selectedServer!),
    {
      onSuccess: (response) => {
        notification.success({
          message: '清理卷成功',
          description: response.data.message,
          placement: 'topRight',
        });
        queryClient.invalidateQueries(['volumes', selectedServer]);
      },
      onError: (error: any) => {
        notification.error({
          message: '清理卷失败',
          description: error.response?.data?.message || error.message,
          placement: 'topRight',
        });
      },
    }
  );

  const handleCreateVolume = (values: any) => {
    createVolumeMutation.mutate(values);
  };

  const handleRemoveVolume = (volumeName: string, force = false) => {
    removeVolumeMutation.mutate({ volumeName, force });
  };

  const handlePruneVolumes = () => {
    Modal.confirm({
      title: '确认清理未使用卷',
      content: '此操作将删除所有未使用的卷，是否继续？',
      onOk: () => pruneVolumesMutation.mutate(),
    });
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const columns = [
    {
      title: '卷名称',
      dataIndex: 'Name',
      key: 'Name',
      align: 'center' as const,
      render: (name: string, record: DockerVolume) => (
        <Space>
          <Text strong>{name}</Text>
          {record.Scope === 'local' && <Tag color="green">本地</Tag>}
          {record.Scope === 'global' && <Tag color="blue">全局</Tag>}
        </Space>
      ),
    },
    {
      title: '驱动',
      dataIndex: 'Driver',
      key: 'Driver',
      align: 'center' as const,
      render: (driver: string) => (
        <Tag color={driver === 'local' ? 'green' : 'blue'}>{driver}</Tag>
      ),
    },
    {
      title: '挂载点',
      dataIndex: 'Mountpoint',
      key: 'Mountpoint',
      align: 'center' as const,
      render: (mountpoint: string) => (
        <Tooltip title={mountpoint}>
          <Text code style={{ maxWidth: 200, display: 'block' }}>
            {mountpoint && mountpoint.length > 30 ? `${mountpoint.substring(0, 30)}...` : mountpoint || '-'}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: '大小',
      key: 'Size',
      align: 'center' as const,
      render: (record: DockerVolume) => {
        if (record.UsageData?.Size) {
          return formatBytes(record.UsageData.Size);
        }
        return '-';
      },
    },
    {
      title: '引用计数',
      key: 'RefCount',
      align: 'center' as const,
      render: (record: DockerVolume) => {
        if (record.UsageData?.RefCount !== undefined) {
          return record.UsageData.RefCount;
        }
        return '-';
      },
    },
    {
      title: '创建时间',
      dataIndex: 'CreatedAt',
      key: 'CreatedAt',
      align: 'center' as const,
      render: (createdAt: string) => new Date(createdAt).toLocaleString(),
    },
    {
      title: '操作',
      key: 'actions',
      align: 'center' as const,
      render: (record: DockerVolume) => (
        <Space>
          <Tooltip title="查看详情">
            <Button
              icon={<InfoCircleOutlined />}
              onClick={() => {
                setSelectedVolume(record);
                setDetailModalVisible(true);
              }}
            />
          </Tooltip>
          <Popconfirm
            title="确认删除卷"
            description="删除后无法恢复，是否继续？"
            onConfirm={() => handleRemoveVolume(record.Name)}
            okText="确认"
            cancelText="取消"
          >
            <Tooltip title="删除卷">
              <Button danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
          <Popconfirm
            title="强制删除卷"
            description="强制删除可能正在使用的卷，是否继续？"
            onConfirm={() => handleRemoveVolume(record.Name, true)}
            okText="强制删除"
            cancelText="取消"
          >
            <Tooltip title="强制删除">
              <Button danger icon={<DeleteOutlined />} size="small" />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

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
              ))}
            </Select>
          </Col>
          <Col span={18}>
            <Space>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setCreateModalVisible(true)}
                disabled={!selectedServer}
              >
                创建卷
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => refetch()}
                disabled={!selectedServer}
              >
                刷新
              </Button>
              <Button
                icon={<DatabaseOutlined />}
                onClick={handlePruneVolumes}
                disabled={!selectedServer}
                loading={pruneVolumesMutation.isLoading}
              >
                清理未使用
              </Button>
            </Space>
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={volumes}
          rowKey={(record) => record.Name || `volume-${record.Driver}`}
          loading={isLoading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 个卷`,
          }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      {/* 创建卷模态框 */}
      <Modal
        title="创建卷"
        open={createModalVisible}
        onCancel={() => {
          setCreateModalVisible(false);
          createForm.resetFields();
        }}
        footer={null}
        width={600}
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreateVolume}
        >
          <Form.Item
            name="Name"
            label="卷名称"
            rules={[{ required: true, message: '请输入卷名称' }]}
          >
            <Input placeholder="例如: my-volume" />
          </Form.Item>

          <Form.Item
            name="Driver"
            label="驱动类型"
            initialValue="local"
          >
            <Select>
              <Option value="local">local</Option>
              <Option value="nfs">nfs</Option>
              <Option value="cifs">cifs</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="DriverOpts"
            label="驱动选项"
          >
            <Input.TextArea
              placeholder='例如: {"type":"nfs","o":"addr=192.168.1.100","device":":/path/to/dir"}'
              rows={3}
            />
          </Form.Item>

          <Form.Item
            name="Labels"
            label="标签"
          >
            <Input.TextArea
              placeholder='例如: {"project":"myapp","environment":"production"}'
              rows={2}
            />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={createVolumeMutation.isLoading}>
                创建
              </Button>
              <Button onClick={() => setCreateModalVisible(false)}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 卷详情模态框 */}
      <Modal
        title="卷详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={800}
      >
        {selectedVolume && (
          <div>
            <Descriptions column={2} bordered>
              <Descriptions.Item label="卷名称" span={2}>
                <Text strong>{selectedVolume.Name}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="驱动">{selectedVolume.Driver}</Descriptions.Item>
              <Descriptions.Item label="作用域">
                <Tag color={selectedVolume.Scope === 'local' ? 'green' : 'blue'}>
                  {selectedVolume.Scope}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="挂载点" span={2}>
                <Text code>{selectedVolume.Mountpoint}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="创建时间" span={2}>
                {new Date(selectedVolume.CreatedAt).toLocaleString()}
              </Descriptions.Item>
            </Descriptions>

            {selectedVolume.UsageData && (
              <>
                <Divider>使用情况</Divider>
                <Descriptions column={2} bordered>
                  <Descriptions.Item label="大小">
                    {formatBytes(selectedVolume.UsageData.Size)}
                  </Descriptions.Item>
                  <Descriptions.Item label="引用计数">
                    {selectedVolume.UsageData.RefCount}
                  </Descriptions.Item>
                </Descriptions>
              </>
            )}

            {Object.keys(selectedVolume.Options || {}).length > 0 && (
              <>
                <Divider>驱动选项</Divider>
                <Descriptions column={1} bordered>
                  {Object.entries(selectedVolume.Options).map(([key, value]) => (
                    <Descriptions.Item key={key} label={key}>
                      <Text code>{value}</Text>
                    </Descriptions.Item>
                  ))}
                </Descriptions>
              </>
            )}

            {Object.keys(selectedVolume.Labels || {}).length > 0 && (
              <>
                <Divider>标签</Divider>
                <div>
                  {Object.entries(selectedVolume.Labels).map(([key, value]) => (
                    <Tag key={key} color="blue">
                      {key}: {value}
                    </Tag>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default VolumesManagement;
