import React, { useState, useEffect } from 'react';
import { Card, Alert, Typography, Space, Button } from 'antd';

const { Title, Text } = Typography;

const TelegramDebug: React.FC = () => {
  const [debugInfo, setDebugInfo] = useState<any>({});

  useEffect(() => {
    const gatherDebugInfo = () => {
      const info = {
        userAgent: navigator.userAgent,
        url: window.location.href,
        referrer: document.referrer,
        hasTelegram: !!(window as any).Telegram,
        hasWebApp: !!(window as any).Telegram?.WebApp,
        telegramObject: (window as any).Telegram,
        searchParams: window.location.search,
        hash: window.location.hash,
        protocol: window.location.protocol,
        host: window.location.host,
        pathname: window.location.pathname,
        timestamp: new Date().toISOString()
      };
      
      setDebugInfo(info);
    };

    // 立即收集信息
    gatherDebugInfo();

    // 每2秒重新检查一次
    const interval = setInterval(gatherDebugInfo, 2000);

    return () => clearInterval(interval);
  }, []);

  const isTelegramEnvironment = () => {
    const ua = navigator.userAgent.toLowerCase();
    const hasTelegramUA = ua.includes('telegram');
    const hasWebAppData = window.location.search.includes('tgWebAppData');
    const hasTelegramReferrer = document.referrer.includes('telegram');
    const hasTelegramObject = !!(window as any).Telegram?.WebApp;
    const hasInitData = !!(window as any).Telegram?.WebApp?.initData;
    
    // 使用严格的检测逻辑
    const isStrictTelegram = (
      typeof (window as any).Telegram !== 'undefined' &&
      typeof (window as any).Telegram.WebApp !== 'undefined' &&
      !!(window as any).Telegram.WebApp.initData
    );
    
    return {
      hasTelegramUA,
      hasWebAppData,
      hasTelegramReferrer,
      hasTelegramObject,
      hasInitData,
      isStrictTelegram,
      overall: isStrictTelegram
    };
  };

  const environment = isTelegramEnvironment();

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <Title level={2}>Telegram Web App 调试信息</Title>
      
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card title="环境检测结果">
          <Space direction="vertical">
            <Text strong>总体检测: {environment.overall ? '✅ 是 Telegram 环境' : '❌ 不是 Telegram 环境'}</Text>
            <Text>严格检测: {environment.isStrictTelegram ? '✅' : '❌'}</Text>
            <Text>User Agent 包含 Telegram: {environment.hasTelegramUA ? '✅' : '❌'}</Text>
            <Text>URL 包含 tgWebAppData: {environment.hasWebAppData ? '✅' : '❌'}</Text>
            <Text>Referrer 包含 telegram: {environment.hasTelegramReferrer ? '✅' : '❌'}</Text>
            <Text>window.Telegram.WebApp 存在: {environment.hasTelegramObject ? '✅' : '❌'}</Text>
            <Text>initData 存在: {environment.hasInitData ? '✅' : '❌'}</Text>
          </Space>
        </Card>

        <Card title="详细信息">
          <pre style={{ 
            background: '#f5f5f5', 
            padding: '16px', 
            borderRadius: '4px',
            overflow: 'auto',
            fontSize: '12px'
          }}>
            {JSON.stringify(debugInfo, null, 2)}
          </pre>
        </Card>

        <Card title="操作">
          <Space>
            <Button 
              type="primary" 
              onClick={() => window.location.reload()}
            >
              刷新页面
            </Button>
            <Button 
              onClick={() => {
                console.log('Debug Info:', debugInfo);
                console.log('Environment:', environment);
              }}
            >
              输出到控制台
            </Button>
          </Space>
        </Card>

        {environment.overall && (
          <Alert
            type="success"
            message="检测到 Telegram 环境"
            description="如果您仍然看到错误，可能是 Telegram Web App 脚本加载问题。"
          />
        )}

        {!environment.overall && (
          <Alert
            type="warning"
            message="未检测到 Telegram 环境"
            description="请确保您在 Telegram 应用中打开此页面。"
          />
        )}
      </Space>
    </div>
  );
};

export default TelegramDebug;
