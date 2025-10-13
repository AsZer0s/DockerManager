import { logRequest } from '../utils/logger.js';

// 路由到模块的映射
const routeToModule = {
  '/api/containers': 'docker',
  '/api/images': 'docker', 
  '/api/volumes': 'docker',
  '/api/networks': 'docker',
  '/api/ssh': 'ssh',
  '/api/ssh-session': 'ssh',
  '/api/telegram': 'telegram',
  '/api/telegram-verification': 'telegram',
  '/api/telegram-webapp': 'telegram',
  '/api/auth': 'system',
  '/api/servers': 'system',
  '/api/monitoring': 'system',
  '/api/system': 'system',
  '/api/settings': 'system',
  '/api/user-management': 'system',
  '/api/polling': 'system',
  '/api/network': 'system',
  '/api/templates': 'system'
};

// 根据路径确定模块
const getModuleFromPath = (path) => {
  // 精确匹配
  if (routeToModule[path]) {
    return routeToModule[path];
  }
  
  // 前缀匹配
  for (const [route, module] of Object.entries(routeToModule)) {
    if (path.startsWith(route)) {
      return module;
    }
  }
  
  // 默认返回system模块
  return 'system';
};

// HTTP请求日志中间件
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // 拦截响应方法以捕获响应体
  const originalJson = res.json;
  const originalSend = res.send;
  let responseBody = null;
  
  res.json = function(body) {
    responseBody = body;
    return originalJson.call(this, body);
  };
  
  res.send = function(body) {
    responseBody = body;
    return originalSend.call(this, body);
  };
  
  // 监听响应结束事件
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    const module = getModuleFromPath(req.path);
    
    // 记录请求日志
    logRequest(module, req, res, `${responseTime}ms`, responseBody);
  });
  
  next();
};

export default requestLogger;
