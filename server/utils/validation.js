import Joi from 'joi';

// 用户验证规则
const userValidation = {
  register: Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).max(100).required(),
    telegramId: Joi.number().integer().optional()
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),

  update: Joi.object({
    username: Joi.string().alphanum().min(3).max(30).optional(),
    email: Joi.string().email().optional(),
    telegramId: Joi.number().integer().optional()
  })
};

// 服务器验证规则
const serverValidation = {
  create: Joi.object({
    name: Joi.string().min(1).max(100).required(),
    host: Joi.string().hostname().required(),
    port: Joi.number().integer().min(1).max(65535).default(22),
    username: Joi.string().min(1).max(100).required(),
    password: Joi.string().optional(),
    private_key: Joi.string().optional(),
    description: Joi.string().max(500).allow('', null).optional()
  }).custom((value, helpers) => {
    // 确保至少提供密码或私钥之一
    if (!value.password && !value.private_key) {
      return helpers.error('custom.authRequired');
    }
    return value;
  }).messages({
    'custom.authRequired': '必须提供密码或私钥进行认证'
  }),

  update: Joi.object({
    name: Joi.string().min(1).max(100).optional(),
    host: Joi.string().hostname().optional(),
    port: Joi.number().integer().min(1).max(65535).optional(),
    username: Joi.string().min(1).max(100).optional(),
    password: Joi.string().optional(),
    private_key: Joi.string().optional(),
    description: Joi.string().max(500).allow('', null).optional(),
    isActive: Joi.boolean().optional()
  }).custom((value, helpers) => {
    // 更新时，如果提供了认证信息，确保至少有一个
    if ((value.password !== undefined || value.private_key !== undefined) && 
        !value.password && !value.private_key) {
      return helpers.error('custom.authRequired');
    }
    return value;
  }).messages({
    'custom.authRequired': '必须提供密码或私钥进行认证'
  })
};

// 容器验证规则
const containerValidation = {
  action: Joi.object({
    action: Joi.string().valid('start', 'stop', 'restart', 'pause', 'unpause', 'kill', 'remove').required(),
    containerId: Joi.string().required()
  }),

  create: Joi.object({
    name: Joi.string().min(1).max(255).required(),
    image: Joi.string().required(),
    ports: Joi.array().items(
      Joi.object({
        hostPort: Joi.number().integer().min(1).max(65535).required(),
        containerPort: Joi.number().integer().min(1).max(65535).required(),
        protocol: Joi.string().valid('tcp', 'udp').default('tcp')
      })
    ).optional(),
    volumes: Joi.array().items(
      Joi.object({
        hostPath: Joi.string().required(),
        containerPath: Joi.string().required(),
        mode: Joi.string().valid('rw', 'ro').default('rw')
      })
    ).optional(),
    environment: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
    command: Joi.string().optional(),
    restartPolicy: Joi.string().valid('no', 'always', 'on-failure', 'unless-stopped').default('no')
  })
};

// 用户权限验证规则
const permissionValidation = {
  update: Joi.object({
    canView: Joi.boolean().optional(),
    canControl: Joi.boolean().optional(),
    canSsh: Joi.boolean().optional(),
    hideSensitiveInfo: Joi.boolean().optional()
  })
};

// 监控验证规则
const monitoringValidation = {
  getData: Joi.object({
    timeRange: Joi.string().valid('1h', '6h', '24h', '7d', '30d').default('24h'),
    interval: Joi.string().valid('1m', '5m', '15m', '1h').default('5m')
  }),
  getServerData: Joi.object({
    timeRange: Joi.string().valid('1h', '6h', '24h', '7d', '30d').default('24h'),
    interval: Joi.string().valid('1m', '5m', '15m', '1h').default('5m')
  }),
  getContainerData: Joi.object({
    timeRange: Joi.string().valid('1h', '6h', '24h', '7d', '30d').default('24h'),
    interval: Joi.string().valid('1m', '5m', '15m', '1h').default('5m')
  })
};

// 通用验证规则
const commonValidation = {
  id: Joi.object({
    id: Joi.number().integer().positive().required()
  }),
  serverId: Joi.object({
    serverId: Joi.number().integer().positive().required()
  }),
  containerId: Joi.object({
    containerId: Joi.string().required()
  }),
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sortBy: Joi.string().optional(),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  })
};

// 验证中间件
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        error: '验证失败',
        details: errors
      });
    }

    req[property] = value;
    next();
  };
};

// 验证查询参数
const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        error: '查询参数验证失败',
        details: errors
      });
    }

    req.query = value;
    next();
  };
};

// 验证路径参数
const validateParams = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.') || 'id',
        message: detail.message
      }));

      return res.status(400).json({
        error: '路径参数验证失败',
        details: errors
      });
    }

    req.params = value;
    next();
  };
};

export {
  userValidation,
  serverValidation,
  containerValidation,
  permissionValidation,
  monitoringValidation,
  commonValidation,
  validate,
  validateQuery,
  validateParams
};
