import jwtManager from './jwt.js';
import database from '../config/database.js';
import logger from './logger.js';

/**
 * 中间件：验证 JWT 令牌
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @param {Function} next - Express next 函数
 */
export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: '未授权',
        message: '缺少认证令牌'
      });
    }

    const token = authHeader.substring(7);
    
    try {
      const decoded = jwtManager.verify(token);
      
      // 获取用户信息
      const result = await database.query(
        'SELECT id, username, email, role, telegram_id, avatar, phone, bio, is_active FROM users WHERE id = $1 AND is_active = 1',
        [decoded.userId]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          error: '令牌无效',
          message: '用户不存在或已禁用'
        });
      }

      req.user = result.rows[0];
      next();
    } catch (jwtError) {
      return res.status(401).json({
        error: '令牌无效',
        message: '令牌已过期或格式错误'
      });
    }
  } catch (error) {
    logger.error('令牌验证失败:', error);
    res.status(500).json({
      error: '验证失败',
      message: '服务器内部错误'
    });
  }
};

/**
 * 中间件：验证管理员权限
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @param {Function} next - Express next 函数
 */
export const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({
      error: '权限不足',
      message: '需要管理员权限'
    });
  }
};

/**
 * 中间件：验证用户权限（管理员或用户本人）
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @param {Function} next - Express next 函数
 */
export const requireUserOrAdmin = (req, res, next) => {
  const userId = parseInt(req.params.userId || req.params.id);
  
  if (req.user && (req.user.role === 'admin' || req.user.id === userId)) {
    next();
  } else {
    res.status(403).json({
      error: '权限不足',
      message: '只能访问自己的资源或需要管理员权限'
    });
  }
};

/**
 * 中间件：验证服务器访问权限
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @param {Function} next - Express next 函数
 */
export const requireServerAccess = async (req, res, next) => {
  try {
    const serverId = parseInt(req.params.serverId || req.params.id);
    
    if (req.user.role === 'admin') {
      // 管理员可以访问所有服务器
      next();
      return;
    }

    // 检查用户是否有服务器访问权限
    const result = await database.query(
      'SELECT can_view FROM user_server_permissions WHERE user_id = $1 AND server_id = $2',
      [req.user.id, serverId]
    );

    if (result.rows.length === 0 || !result.rows[0].can_view) {
      return res.status(403).json({
        error: '权限不足',
        message: '没有访问此服务器的权限'
      });
    }

    next();
  } catch (error) {
    logger.error('服务器权限验证失败:', error);
    res.status(500).json({
      error: '权限验证失败',
      message: '服务器内部错误'
    });
  }
};

/**
 * 中间件：验证服务器控制权限
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @param {Function} next - Express next 函数
 */
export const requireServerControl = async (req, res, next) => {
  try {
    const serverId = parseInt(req.params.serverId || req.params.id);
    
    if (req.user.role === 'admin') {
      // 管理员可以控制所有服务器
      next();
      return;
    }

    // 检查用户是否有服务器控制权限
    const result = await database.query(
      'SELECT can_control FROM user_server_permissions WHERE user_id = $1 AND server_id = $2',
      [req.user.id, serverId]
    );

    if (result.rows.length === 0 || !result.rows[0].can_control) {
      return res.status(403).json({
        error: '权限不足',
        message: '没有控制此服务器的权限'
      });
    }

    next();
  } catch (error) {
    logger.error('服务器控制权限验证失败:', error);
    res.status(500).json({
      error: '权限验证失败',
      message: '服务器内部错误'
    });
  }
};

/**
 * 中间件：验证SSH权限
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @param {Function} next - Express next 函数
 */
export const requireSSHAccess = async (req, res, next) => {
  try {
    const serverId = parseInt(req.params.serverId || req.params.id);
    
    if (req.user.role === 'admin') {
      // 管理员可以SSH到所有服务器
      next();
      return;
    }

    // 检查用户是否有SSH权限
    const result = await database.query(
      'SELECT can_ssh FROM user_server_permissions WHERE user_id = $1 AND server_id = $2',
      [req.user.id, serverId]
    );

    if (result.rows.length === 0 || !result.rows[0].can_ssh) {
      return res.status(403).json({
        error: '权限不足',
        message: '没有SSH访问此服务器的权限'
      });
    }

    next();
  } catch (error) {
    logger.error('SSH权限验证失败:', error);
    res.status(500).json({
      error: '权限验证失败',
      message: '服务器内部错误'
    });
  }
};
