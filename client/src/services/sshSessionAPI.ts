import api from './api';

export interface SSHSessionResult {
  command: string;
  output: string;
  error: string;
  timestamp: Date;
}

export interface SSHSessionInfo {
  sessionId: string;
  serverName: string;
  currentPath: string;
  createdAt: number;
  lastActivity: number;
}

class SSHSessionAPI {
  /**
   * 创建SSH会话
   */
  async createSession(serverId: number) {
    const response = await api.post('/ssh-session/create', {
      serverId
    });
    return response.data;
  }

  /**
   * 执行SSH命令
   */
  async executeCommand(sessionId: string, command: string): Promise<SSHSessionResult> {
    const response = await api.post('/ssh-session/execute', {
      sessionId,
      command
    });
    return response.data.result;
  }

  /**
   * 获取会话信息
   */
  async getSessionInfo(sessionId: string): Promise<SSHSessionInfo> {
    const response = await api.get(`/ssh-session/info/${sessionId}`);
    return response.data.sessionInfo;
  }

  /**
   * 关闭SSH会话
   */
  async closeSession(sessionId: string) {
    const response = await api.delete(`/ssh-session/close/${sessionId}`);
    return response.data;
  }

  /**
   * 获取服务统计
   */
  async getStats() {
    const response = await api.get('/ssh-session/stats');
    return response.data.stats;
  }
}

export default new SSHSessionAPI();
