import axios from 'axios';

const API_BASE_URL = '/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

let onUnauthorizedCallback: (() => void) | null = null;

export const setUnauthorizedCallback = (callback: () => void) => {
  onUnauthorizedCallback = callback;
};

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('jwt_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      if (onUnauthorizedCallback) {
        onUnauthorizedCallback();
      } else {
        console.error('401 Unauthorized: onUnauthorizedCallback not set.');
      }
    }
    return Promise.reject(error);
  }
);

export interface Server {
  ID: number; // Use ID from gorm.Model
  CreatedAt: string;
  UpdatedAt: string;
  DeletedAt: string | null;
  name: string;
  ip: string;
  port: number;
  username: string;
  auth_mode: string;
}

export interface ServerPayload extends Omit<Server, 'ID' | 'CreatedAt' | 'UpdatedAt' | 'DeletedAt'> {
  secret: string;
}

export interface ServerStats {
  status: 'online' | 'offline' | 'loading';
  cpu_usage: number;
  ram_usage: number;
  docker_version: string;
  uptime: string;
  running_containers: number;
  total_containers: number;
  latency: number;
  latency_map: Record<string, number>;
}

export interface Container {
  id: string;
  server_id: number;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string[];
  created_at: string;
  user_id: number;
  permission: string;
}

export interface ContainerListResponse {
  containers: Container[];
  total: number;
}

export interface ContainerActionRequest {
  server_id: number;
  container_id: string;
  action: 'start' | 'stop' | 'restart' | 'remove';
}

export interface ContainerLogResponse {
  logs: string;
}

export interface ContainerDetailsResponse {
  details: string; // Raw JSON string from docker inspect
}

export interface ContainerImageUpdateResponse {
  has_update: boolean;
}

export interface FileEntry {
  name: string;
  size: number;
  mode: string;
  is_dir: boolean;
  is_symlink: boolean; // Added to handle symbolic links
  mod_time: string; // ISO 8601 string
  permissions: string; // Octal string, e.g., "755"
}

export interface FileListResponse {
  path: string;
  files: FileEntry[];
}

export interface FileContentResponse {
  path: string;
  content: string;
}

export const containerApi = {
  listContainers: (serverId: string) => api.get<ContainerListResponse>(`/servers/${serverId}/containers`),
  containerAction: (req: ContainerActionRequest) => api.post(`/servers/${req.server_id}/containers/action`, req),
  getContainerLogs: (serverId: string, containerId: string, tail: string = 'all') => api.get<ContainerLogResponse>(`/servers/${serverId}/containers/${containerId}/logs?tail=${tail}`),
  getContainerDetails: (serverId: string, containerId: string) => api.get<ContainerDetailsResponse>(`/servers/${serverId}/containers/${containerId}/details`),
  checkContainerImageUpdate: (serverId: string, containerId: string) => api.get<ContainerImageUpdateResponse>(`/servers/${serverId}/containers/${containerId}/check-update`),

  // File Management
  listContainerFiles: (serverId: string, containerId: string, path: string = '/') =>
    api.get<FileListResponse>(`/servers/${serverId}/containers/${containerId}/files`, { params: { path } }),

  getContainerFileContent: (serverId: string, containerId: string, path: string) =>
    api.get<FileContentResponse>(`/servers/${serverId}/containers/${containerId}/files/content`, { params: { path } }),
};

export const serverApi = {
  listServers: () => api.get<Server[]>('/servers'),
  createServer: (server: ServerPayload) => api.post<Server>('/servers', server),
  getServer: (id: string) => api.get<Server>(`/servers/${id}`),
  updateServer: (id: string, server: Partial<ServerPayload>) => api.put<Server>(`/servers/${id}`, server),
  deleteServer: (id: string) => api.delete(`/servers/${id}`),
  getServerStats: (id: string) => api.get<ServerStats>(`/servers/${id}/stats`),
};

// Export individual methods for easier use in components
export const { get, post, put, delete: del } = api;

export default api;