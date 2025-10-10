import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  Row,
  Col,
  Tag,
  Popconfirm,
  message,
  Typography,
  Descriptions,
  Divider,
  Tooltip,
  Badge
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  DisconnectOutlined,
  ReloadOutlined,
  ApiOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { dockerNetworkAPI } from '../../services/api';
import { useGlobalServers } from '../../hooks/useGlobalServers';

const { Option } = Select;
const { Text, Title } = Typography;

interface DockerNetwork {
  Id: string;
  Name: string;
  Driver: string;
  Scope: string;
  IPAM: {
    Driver: string;
    Config: Array<{
      Subnet: string;
      Gateway: string;
    }>;
  };
  Containers: Record<string, {
    Name: string;
    EndpointID: string;
    MacAddress: string;
    IPv4Address: string;
    IPv6Address: string;
  }>;
  Created: string;
  Internal: boolean;
  Attachable: boolean;
  Ingress: boolean;
  Labels: Record<string, string>;
}

const NetworksManagement: React.FC = () => {
  const [selectedServer, setSelectedServer] = useState<number | null>(null);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [connectModalVisible, setConnectModalVisible] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<DockerNetwork | null>(null);
  const [createForm] = Form.useForm();
  const [connectForm] = Form.useForm();
  const queryClient = useQueryClient();

  const { data: serversData } = useGlobalServers();
  const servers = serversData?.data?.servers || [];

  // 获取网络列表
  const { data: networksData, isLoading, refetch } = useQuery(
    ['networks', selectedServer],
    () => dockerNetworkAPI.getNetworks(selectedServer!),
    {
      enabled: !!selectedServer,
      refetchInterval: 30000,
    }
  );

  const networks = Array.isArray(networksData?.data?.data) ? networksData.data.data : [];

  // 创建网络
  const createNetworkMutation = useMutation(
    (data: any) => dockerNetworkAPI.createNetwork(selectedServer!, data),
    {
      onSuccess: () => {
        message.success('网络创建成功');
        setCreateModalVisible(false);
        createForm.resetFields();
        queryClient.invalidateQueries(['networks', selectedServer]);
      },
      onError: (error: any) => {
        message.error(`创建网络失败: ${error.response?.data?.message || error.message}`);
      },
    }
  );

  // 删除网络
  const removeNetworkMutation = useMutation(
    (networkId: string) => dockerNetworkAPI.removeNetwork(selectedServer!, networkId),
    {
      onSuccess: () => {
        message.success('网络删除成功');
        queryClient.invalidateQueries(['networks', selectedServer]);
      },
      onError: (error: any) => {
        message.error(`删除网络失败: ${error.response?.data?.message || error.message}`);
      },
    }
  );

  // 连接容器到网络
  const connectContainerMutation = useMutation(
    ({ networkId, containerId, options }: { networkId: string; containerId: string; options?: any }) =>
      dockerNetworkAPI.connectContainer(selectedServer!, networkId, containerId, options),
    {
      onSuccess: () => {
        message.success('容器连接网络成功');
        setConnectModalVisible(false);
        connectForm.resetFields();
        queryClient.invalidateQueries(['networks', selectedServer]);
      },
      onError: (error: any) => {
        message.error(`连接容器失败: ${error.response?.data?.message || error.message}`);
      },
    }
  );

  // 断开容器与网络连接
  const disconnectContainerMutation = useMutation(
    ({ networkId, containerId }: { networkId: string; containerId: string }) =>
      dockerNetworkAPI.disconnectContainer(selectedServer!, networkId, containerId),
    {
      onSuccess: () => {
        message.success('容器断开网络成功');
        queryClient.invalidateQueries(['networks', selectedServer]);
      },
      onError: (error: any) => {
        message.error(`断开容器失败: ${error.response?.data?.message || error.message}`);
      },
    }
  );

  // 清理未使用网络
  const pruneNetworksMutation = useMutation(
    () => dockerNetworkAPI.pruneNetworks(selectedServer!),
    {
      onSuccess: (response) => {
        message.success(response.data.message);
        queryClient.invalidateQueries(['networks', selectedServer]);
      },
      onError: (error: any) => {
        message.error(`清理网络失败: ${error.response?.data?.message || error.message}`);
      },
    }
  );

  const handleCreateNetwork = (values: any) => {
    createNetworkMutation.mutate(values);
  };

  const handleRemoveNetwork = (networkId: string) => {
    removeNetworkMutation.mutate(networkId);
  };

  const handleConnectContainer = (values: any) => {
    if (!selectedNetwork) return;
    connectContainerMutation.mutate({
      networkId: selectedNetwork.Id,
      containerId: values.containerId,
      options: values.options
    });
  };

  const handleDisconnectContainer = (networkId: string, containerId: string) => {
    disconnectContainerMutation.mutate({ networkId, containerId });
  };

  const handlePruneNetworks = () => {
    Modal.confirm({
      title: '确认清理未使用网络',
      content: '此操作将删除所有未使用的网络，是否继续？',
      onOk: () => pruneNetworksMutation.mutate(),
    });
  };

  const columns = [
    {
      title: '网络名称',
      dataIndex: 'Name',
      key: 'Name',
      align: 'center' as const,
      render: (name: string, record: DockerNetwork) => (
        <Space>
          <Text strong>{name}</Text>
          {record.Internal && <Tag color="orange">内部</Tag>}
          {record.Ingress && <Tag color="blue">入口</Tag>}
        </Space>
      ),
    },
    {
      title: '驱动',
      dataIndex: 'Driver',
      key: 'Driver',
      align: 'center' as const,
      render: (driver: string) => (
        <Tag color={driver === 'bridge' ? 'green' : driver === 'overlay' ? 'blue' : 'default'}>
          {driver}
        </Tag>
      ),
    },
    {
      title: '作用域',
      dataIndex: 'Scope',
      key: 'Scope',
      align: 'center' as const,
      render: (scope: string) => (
        <Tag color={scope === 'local' ? 'green' : 'blue'}>{scope}</Tag>
      ),
    },
    {
      title: '已连接容器',
      key: 'Containers',
      align: 'center' as const,
      render: (record: DockerNetwork) => (
        <Badge count={Object.keys(record.Containers || {}).length} showZero color="blue" />
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'Created',
      key: 'Created',
      align: 'center' as const,
      render: (created: string) => new Date(created).toLocaleString(),
    },
    {
      title: '操作',
      key: 'actions',
      align: 'center' as const,
      render: (record: DockerNetwork) => (
        <Space>
          <Tooltip title="查看详情">
            <Button
              icon={<InfoCircleOutlined />}
              onClick={() => {
                setSelectedNetwork(record);
                setDetailModalVisible(true);
              }}
            />
          </Tooltip>
          <Tooltip title="连接容器">
            <Button
              icon={<LinkOutlined />}
              onClick={() => {
                setSelectedNetwork(record);
                setConnectModalVisible(true);
              }}
            />
          </Tooltip>
          {!['bridge', 'host', 'none'].includes(record.Name) && (
            <Popconfirm
              title="确认删除网络"
              description="删除后无法恢复，是否继续？"
              onConfirm={() => handleRemoveNetwork(record.Id)}
              okText="确认"
              cancelText="取消"
            >
              <Tooltip title="删除网络">
                <Button danger icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          )}
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
                创建网络
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => refetch()}
                disabled={!selectedServer}
              >
                刷新
              </Button>
              <Button
                icon={<ApiOutlined />}
                onClick={handlePruneNetworks}
                disabled={!selectedServer}
                loading={pruneNetworksMutation.isLoading}
              >
                清理未使用
              </Button>
            </Space>
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={networks}
          rowKey={(record) => record.Id || `network-${record.Name}`}
          loading={isLoading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 个网络`,
          }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      {/* 创建网络模态框 */}
      <Modal
        title="创建网络"
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
          onFinish={handleCreateNetwork}
        >
          <Form.Item
            name="Name"
            label="网络名称"
            rules={[{ required: true, message: '请输入网络名称' }]}
          >
            <Input placeholder="例如: my-network" />
          </Form.Item>

          <Form.Item
            name="Driver"
            label="驱动类型"
            initialValue="bridge"
          >
            <Select>
              <Option value="bridge">bridge</Option>
              <Option value="overlay">overlay</Option>
              <Option value="host">host</Option>
              <Option value="macvlan">macvlan</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="Internal"
            label="内部网络"
            valuePropName="checked"
          >
            <Input type="checkbox" />
          </Form.Item>

          <Form.Item
            name="Attachable"
            label="可附加"
            valuePropName="checked"
          >
            <Input type="checkbox" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={createNetworkMutation.isLoading}>
                创建
              </Button>
              <Button onClick={() => setCreateModalVisible(false)}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 网络详情模态框 */}
      <Modal
        title="网络详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={800}
      >
        {selectedNetwork && (
          <div>
            <Descriptions column={2} bordered>
              <Descriptions.Item label="网络名称" span={2}>
                <Text strong>{selectedNetwork.Name}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="驱动">{selectedNetwork.Driver}</Descriptions.Item>
              <Descriptions.Item label="作用域">{selectedNetwork.Scope}</Descriptions.Item>
              <Descriptions.Item label="内部网络">
                <Tag color={selectedNetwork.Internal ? 'red' : 'green'}>
                  {selectedNetwork.Internal ? '是' : '否'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="可附加">
                <Tag color={selectedNetwork.Attachable ? 'green' : 'red'}>
                  {selectedNetwork.Attachable ? '是' : '否'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="创建时间" span={2}>
                {new Date(selectedNetwork.Created).toLocaleString()}
              </Descriptions.Item>
            </Descriptions>

            {selectedNetwork.IPAM && (
              <>
                <Divider>IPAM 配置</Divider>
                <Descriptions column={1} bordered>
                  <Descriptions.Item label="驱动">{selectedNetwork.IPAM.Driver}</Descriptions.Item>
                  {selectedNetwork.IPAM.Config?.map((config, index) => (
                    <Descriptions.Item key={index} label={`配置 ${index + 1}`}>
                      <div>
                        <div>子网: {config.Subnet}</div>
                        <div>网关: {config.Gateway}</div>
                      </div>
                    </Descriptions.Item>
                  ))}
                </Descriptions>
              </>
            )}

            {Object.keys(selectedNetwork.Containers || {}).length > 0 && (
              <>
                <Divider>已连接容器</Divider>
                <Table
                  dataSource={Object.entries(selectedNetwork?.Containers || {}).map(([id, container]) => ({
                    key: id,
                    name: container.Name,
                    ipv4: container.IPv4Address,
                    mac: container.MacAddress,
                  }))}
                  columns={[
                    { title: '容器名称', dataIndex: 'name' },
                    { title: 'IPv4地址', dataIndex: 'ipv4' },
                    { title: 'MAC地址', dataIndex: 'mac' },
                    {
                      title: '操作',
                      render: (_, record) => (
                        <Button
                          danger
                          size="small"
                          icon={<DisconnectOutlined />}
                          onClick={() => handleDisconnectContainer(selectedNetwork.Id, record.key)}
                        >
                          断开
                        </Button>
                      ),
                    },
                  ]}
                  pagination={false}
                  size="small"
                />
              </>
            )}
          </div>
        )}
      </Modal>

      {/* 连接容器模态框 */}
      <Modal
        title="连接容器到网络"
        open={connectModalVisible}
        onCancel={() => {
          setConnectModalVisible(false);
          connectForm.resetFields();
        }}
        footer={null}
      >
        <Form
          form={connectForm}
          layout="vertical"
          onFinish={handleConnectContainer}
        >
          <Form.Item
            name="containerId"
            label="容器ID"
            rules={[{ required: true, message: '请输入容器ID' }]}
          >
            <Input placeholder="容器ID或名称" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={connectContainerMutation.isLoading}>
                连接
              </Button>
              <Button onClick={() => setConnectModalVisible(false)}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default NetworksManagement;
