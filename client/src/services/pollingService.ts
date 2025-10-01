import api from './api';

interface PollingData {
  system?: any;
  servers?: any[];
  containers?: any;
  monitoring?: any;
}

interface PollingResponse {
  success: boolean;
  data: PollingData;
  timestamp: number;
}

class PollingService {
  private sessionId: string | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;
  private isPolling = false;
  private subscribers: Map<string, (data: PollingData) => void> = new Map();
  private subscriptions: string[] = [];
  private pollingIntervalMs = 3000; // 3秒轮询间隔

  /**
   * 开始轮询
   */
  async startPolling(subscriptions: string[] = []) {
    if (this.isPolling) {
      return;
    }

    try {
      // 订阅服务
      const response = await api.post('/polling/subscribe', {
        subscriptions
      });

      this.sessionId = response.data.sessionId;
      this.subscriptions = subscriptions;
      this.isPolling = true;

      console.log('🔄 HTTP轮询服务启动成功', { sessionId: this.sessionId });

      // 开始轮询
      this.startPollingLoop();

      return this.sessionId;
    } catch (error) {
      console.error('启动轮询失败:', error);
      throw error;
    }
  }

  /**
   * 停止轮询
   */
  async stopPolling() {
    if (!this.isPolling || !this.sessionId) {
      return;
    }

    try {
      // 取消订阅
      await api.delete(`/polling/subscribe/${this.sessionId}`);
    } catch (error) {
      console.error('取消订阅失败:', error);
    }

    // 清理状态
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    this.isPolling = false;
    this.sessionId = null;
    this.subscriptions = [];
    this.subscribers.clear();

    console.log('🔄 HTTP轮询服务已停止');
  }

  /**
   * 开始轮询循环
   */
  private startPollingLoop() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    // 立即执行一次
    this.pollData();

    // 设置定时轮询
    this.pollingInterval = setInterval(() => {
      this.pollData();
    }, this.pollingIntervalMs);
  }

  /**
   * 轮询数据
   */
  private async pollData() {
    if (!this.sessionId || !this.isPolling) {
      return;
    }

    try {
      const types = this.subscriptions.join(',');
      const response = await api.get<PollingResponse>(
        `/polling/data/${this.sessionId}?types=${types}`
      );

      if (response.data.success) {
        // 通知所有订阅者
        this.notifySubscribers(response.data.data);
      }
    } catch (error) {
      console.error('轮询数据失败:', error);
      
      // 如果是认证错误，停止轮询
      if (error.response?.status === 401) {
        console.log('认证失败，停止轮询');
        this.stopPolling();
      }
    }
  }

  /**
   * 订阅数据更新
   */
  subscribe(key: string, callback: (data: PollingData) => void) {
    this.subscribers.set(key, callback);
    console.log(`📡 订阅数据更新: ${key}`);
  }

  /**
   * 取消订阅
   */
  unsubscribe(key: string) {
    this.subscribers.delete(key);
    console.log(`📡 取消订阅: ${key}`);
  }

  /**
   * 通知所有订阅者
   */
  private notifySubscribers(data: PollingData) {
    this.subscribers.forEach((callback, key) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`通知订阅者 ${key} 失败:`, error);
      }
    });
  }

  /**
   * 设置轮询间隔
   */
  setPollingInterval(intervalMs: number) {
    this.pollingIntervalMs = intervalMs;
    
    // 如果正在轮询，重启轮询循环
    if (this.isPolling) {
      this.startPollingLoop();
    }
  }

  /**
   * 获取轮询状态
   */
  getStatus() {
    return {
      isPolling: this.isPolling,
      sessionId: this.sessionId,
      subscriptions: this.subscriptions,
      subscriberCount: this.subscribers.size,
      pollingInterval: this.pollingIntervalMs
    };
  }

  /**
   * 手动刷新数据
   */
  async refresh() {
    if (this.isPolling) {
      await this.pollData();
    }
  }
}

export default new PollingService();
