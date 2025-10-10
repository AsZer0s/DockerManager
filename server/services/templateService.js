import logger from '../utils/logger.js';
import database from '../config/database.js';
import orchestrationService from './orchestrationService.js';
import yaml from 'js-yaml';

class TemplateService {
  constructor() {
    this.categories = [
      'web', 'database', 'cache', 'cms', 'monitoring', 
      'development', 'message-queue', 'storage', 'security', 'other'
    ];
  }

  /**
   * 获取模板列表
   * @param {number} userId - 用户 ID
   * @param {boolean} isPublic - 是否只获取公开模板
   * @returns {Promise<Array>} 模板列表
   */
  async getTemplates(userId, isPublic = false) {
    try {
      let query = `
        SELECT t.*, u.username as created_by_name
        FROM container_templates t
        LEFT JOIN users u ON t.created_by = u.id
        WHERE 1=1
      `;
      const params = [];

      if (isPublic) {
        query += ' AND t.is_public = 1';
      } else {
        query += ' AND (t.is_public = 1 OR t.created_by = ?)';
        params.push(userId);
      }

      query += ' ORDER BY t.created_at DESC';

      const result = await database.query(query, params);
      return result.rows.map(row => ({
        ...row,
        config: JSON.parse(row.config),
        dependencies: JSON.parse(row.dependencies || '[]')
      }));
    } catch (error) {
      logger.error('获取模板列表失败:', error);
      throw error;
    }
  }

  /**
   * 获取模板详情
   * @param {number} templateId - 模板 ID
   * @returns {Promise<Object>} 模板详情
   */
  async getTemplate(templateId) {
    try {
      const result = await database.query(`
        SELECT t.*, u.username as created_by_name
        FROM container_templates t
        LEFT JOIN users u ON t.created_by = u.id
        WHERE t.id = ?
      `, [templateId]);

      if (result.rows.length === 0) {
        throw new Error('模板不存在');
      }

      const template = result.rows[0];
      return {
        ...template,
        config: JSON.parse(template.config),
        dependencies: JSON.parse(template.dependencies || '[]')
      };
    } catch (error) {
      logger.error(`获取模板详情失败 (模板 ${templateId}):`, error);
      throw error;
    }
  }

  /**
   * 创建模板
   * @param {Object} templateData - 模板数据
   * @returns {Promise<Object>} 创建的模板
   */
  async createTemplate(templateData) {
    try {
      const {
        name,
        description,
        type = 'custom',
        category,
        icon,
        config,
        compose_file,
        dependencies = [],
        created_by,
        is_public = false
      } = templateData;

      // 验证模板数据
      this.validateTemplateData(templateData);

      const result = await database.query(`
        INSERT INTO container_templates 
        (name, description, type, category, icon, config, compose_file, dependencies, created_by, is_public)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        name,
        description,
        type,
        category,
        icon,
        JSON.stringify(config),
        compose_file,
        JSON.stringify(dependencies),
        created_by,
        is_public
      ]);

      const templateId = result.lastID;
      return await this.getTemplate(templateId);
    } catch (error) {
      logger.error('创建模板失败:', error);
      throw error;
    }
  }

  /**
   * 更新模板
   * @param {number} templateId - 模板 ID
   * @param {Object} templateData - 模板数据
   * @returns {Promise<Object>} 更新后的模板
   */
  async updateTemplate(templateId, templateData) {
    try {
      const {
        name,
        description,
        category,
        icon,
        config,
        compose_file,
        dependencies,
        is_public
      } = templateData;

      // 验证模板数据
      this.validateTemplateData(templateData);

      const updateFields = [];
      const params = [];

      if (name !== undefined) {
        updateFields.push('name = ?');
        params.push(name);
      }
      if (description !== undefined) {
        updateFields.push('description = ?');
        params.push(description);
      }
      if (category !== undefined) {
        updateFields.push('category = ?');
        params.push(category);
      }
      if (icon !== undefined) {
        updateFields.push('icon = ?');
        params.push(icon);
      }
      if (config !== undefined) {
        updateFields.push('config = ?');
        params.push(JSON.stringify(config));
      }
      if (compose_file !== undefined) {
        updateFields.push('compose_file = ?');
        params.push(compose_file);
      }
      if (dependencies !== undefined) {
        updateFields.push('dependencies = ?');
        params.push(JSON.stringify(dependencies));
      }
      if (is_public !== undefined) {
        updateFields.push('is_public = ?');
        params.push(is_public);
      }

      if (updateFields.length === 0) {
        throw new Error('没有需要更新的字段');
      }

      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      params.push(templateId);

      await database.query(`
        UPDATE container_templates 
        SET ${updateFields.join(', ')}
        WHERE id = ?
      `, params);

      return await this.getTemplate(templateId);
    } catch (error) {
      logger.error(`更新模板失败 (模板 ${templateId}):`, error);
      throw error;
    }
  }

  /**
   * 删除模板
   * @param {number} templateId - 模板 ID
   * @returns {Promise<boolean>} 删除结果
   */
  async deleteTemplate(templateId) {
    try {
      const result = await database.query(
        'DELETE FROM container_templates WHERE id = ?',
        [templateId]
      );

      if (result.changes === 0) {
        throw new Error('模板不存在');
      }

      logger.info(`模板 ${templateId} 删除成功`);
      return true;
    } catch (error) {
      logger.error(`删除模板失败 (模板 ${templateId}):`, error);
      throw error;
    }
  }

  /**
   * 导出模板
   * @param {number} templateId - 模板 ID
   * @returns {Promise<Object>} 导出的模板数据
   */
  async exportTemplate(templateId) {
    try {
      const template = await this.getTemplate(templateId);
      
      return {
        name: template.name,
        description: template.description,
        type: template.type,
        category: template.category,
        icon: template.icon,
        config: template.config,
        compose_file: template.compose_file,
        dependencies: template.dependencies,
        version: '1.0',
        exported_at: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`导出模板失败 (模板 ${templateId}):`, error);
      throw error;
    }
  }

  /**
   * 导入模板
   * @param {Object} templateData - 模板数据
   * @param {number} userId - 用户 ID
   * @returns {Promise<Object>} 导入的模板
   */
  async importTemplate(templateData, userId) {
    try {
      // 验证导入的模板数据
      this.validateImportedTemplate(templateData);

      const importData = {
        name: templateData.name,
        description: templateData.description,
        type: templateData.type || 'custom',
        category: templateData.category,
        icon: templateData.icon,
        config: templateData.config,
        compose_file: templateData.compose_file,
        dependencies: templateData.dependencies || [],
        created_by: userId,
        is_public: false // 导入的模板默认为私有
      };

      return await this.createTemplate(importData);
    } catch (error) {
      logger.error('导入模板失败:', error);
      throw error;
    }
  }

  /**
   * 部署模板
   * @param {number} templateId - 模板 ID
   * @param {number} serverId - 服务器 ID
   * @param {Object} params - 部署参数
   * @returns {Promise<Object>} 部署结果
   */
  async deployTemplate(templateId, serverId, params = {}) {
    try {
      const template = await this.getTemplate(templateId);
      
      // 记录部署开始
      const deploymentResult = await database.query(`
        INSERT INTO template_deployments (template_id, server_id, user_id, status)
        VALUES (?, ?, ?, 'deploying')
      `, [templateId, serverId, params.userId]);

      const deploymentId = deploymentResult.lastID;

      try {
        let result;
        
        if (template.compose_file) {
          // 使用 Docker Compose 部署
          result = await orchestrationService.deployCompose(
            serverId, 
            template.compose_file, 
            params.projectName || template.name.toLowerCase().replace(/\s+/g, '-')
          );
        } else {
          // 使用单个容器配置部署
          result = await this.deploySingleContainer(template, serverId, params);
        }

        // 更新部署状态
        await database.query(`
          UPDATE template_deployments 
          SET status = 'completed', containers = ?
          WHERE id = ?
        `, [JSON.stringify(result.containers || []), deploymentId]);

        return {
          success: true,
          deploymentId,
          message: '模板部署成功',
          containers: result.containers
        };
      } catch (deployError) {
        // 更新部署状态为失败
        await database.query(`
          UPDATE template_deployments 
          SET status = 'failed'
          WHERE id = ?
        `, [deploymentId]);

        throw deployError;
      }
    } catch (error) {
      logger.error(`部署模板失败 (模板 ${templateId}, 服务器 ${serverId}):`, error);
      throw error;
    }
  }

  /**
   * 部署单个容器
   * @param {Object} template - 模板数据
   * @param {number} serverId - 服务器 ID
   * @param {Object} params - 部署参数
   * @returns {Promise<Object>} 部署结果
   */
  async deploySingleContainer(template, serverId, params) {
    try {
      const config = template.config;
      const containerName = params.containerName || `${template.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
      
      // 构建 docker run 命令
      let command = `docker run -d --name ${containerName}`;
      
      // 添加端口映射
      if (config.ports && config.ports.length > 0) {
        config.ports.forEach(port => {
          command += ` -p ${port}`;
        });
      }
      
      // 添加卷映射
      if (config.volumes && config.volumes.length > 0) {
        config.volumes.forEach(volume => {
          command += ` -v ${volume}`;
        });
      }
      
      // 添加环境变量
      if (config.environment && Object.keys(config.environment).length > 0) {
        Object.entries(config.environment).forEach(([key, value]) => {
          command += ` -e ${key}=${value}`;
        });
      }
      
      // 添加重启策略
      if (config.restart) {
        command += ` --restart ${config.restart}`;
      }
      
      // 添加镜像
      command += ` ${config.image}`;
      
      // 执行命令
      const sshConnectionPool = (await import('./sshConnectionPool.js')).default;
      const output = await sshConnectionPool.executeCommand(serverId, command, 300000);
      
      return {
        success: true,
        containerName,
        output,
        containers: [containerName]
      };
    } catch (error) {
      logger.error('部署单个容器失败:', error);
      throw error;
    }
  }

  /**
   * 验证Compose文件
   * @param {string} composeContent - Compose文件内容
   * @returns {Promise<Object>} 验证结果
   */
  async validateComposeFile(composeContent) {
    try {
      if (!composeContent.trim()) {
        throw new Error('Compose文件内容不能为空');
      }

      // 使用js-yaml解析YAML内容
      const composeData = yaml.load(composeContent);
      
      if (!composeData) {
        throw new Error('Compose文件格式错误');
      }

      // 检查是否包含services部分
      if (!composeData.services) {
        throw new Error('Compose文件必须包含services部分');
      }

      // 检查services是否为对象
      if (typeof composeData.services !== 'object') {
        throw new Error('services必须是一个对象');
      }

      // 检查是否有服务定义
      const serviceNames = Object.keys(composeData.services);
      if (serviceNames.length === 0) {
        throw new Error('至少需要定义一个服务');
      }

      // 验证每个服务的基本结构
      for (const serviceName of serviceNames) {
        const service = composeData.services[serviceName];
        if (!service.image && !service.build) {
          throw new Error(`服务 ${serviceName} 必须指定 image 或 build`);
        }
      }

      return {
        valid: true,
        message: 'Compose文件格式正确',
        services: serviceNames,
        version: composeData.version || '3.8'
      };
    } catch (error) {
      logger.error('验证Compose文件失败:', error);
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * 获取部署记录
   * @param {number} userId - 用户 ID
   * @returns {Promise<Array>} 部署记录
   */
  async getDeployments(userId) {
    try {
      const result = await database.query(`
        SELECT d.*, t.name as template_name, s.name as server_name
        FROM template_deployments d
        LEFT JOIN container_templates t ON d.template_id = t.id
        LEFT JOIN servers s ON d.server_id = s.id
        WHERE d.user_id = ?
        ORDER BY d.deployed_at DESC
      `, [userId]);

      // 如果没有部署记录，返回空数组
      if (!result.rows || result.rows.length === 0) {
        return [];
      }

      return result.rows.map(row => ({
        ...row,
        containers: JSON.parse(row.containers || '[]')
      }));
    } catch (error) {
      logger.error('获取部署记录失败:', error);
      // 如果查询失败，返回空数组而不是抛出错误
      return [];
    }
  }

  /**
   * 获取部署状态
   * @param {number} deploymentId - 部署 ID
   * @returns {Promise<Object>} 部署状态
   */
  async getDeploymentStatus(deploymentId) {
    try {
      const result = await database.query(`
        SELECT d.*, t.name as template_name, s.name as server_name
        FROM template_deployments d
        JOIN container_templates t ON d.template_id = t.id
        JOIN servers s ON d.server_id = s.id
        WHERE d.id = ?
      `, [deploymentId]);

      if (result.rows.length === 0) {
        throw new Error('部署记录不存在');
      }

      const deployment = result.rows[0];
      return {
        ...deployment,
        containers: JSON.parse(deployment.containers || '[]')
      };
    } catch (error) {
      logger.error(`获取部署状态失败 (部署 ${deploymentId}):`, error);
      throw error;
    }
  }

  /**
   * 验证模板数据
   * @param {Object} templateData - 模板数据
   */
  validateTemplateData(templateData) {
    if (!templateData.name || templateData.name.trim() === '') {
      throw new Error('模板名称不能为空');
    }

    if (!templateData.config) {
      throw new Error('模板配置不能为空');
    }

    if (templateData.category && !this.categories.includes(templateData.category)) {
      throw new Error(`无效的分类: ${templateData.category}`);
    }
  }

  /**
   * 验证导入的模板数据
   * @param {Object} templateData - 导入的模板数据
   */
  validateImportedTemplate(templateData) {
    if (!templateData.name) {
      throw new Error('导入的模板缺少名称');
    }

    if (!templateData.config) {
      throw new Error('导入的模板缺少配置');
    }

    // 检查版本兼容性
    if (templateData.version && templateData.version !== '1.0') {
      logger.warn(`模板版本 ${templateData.version} 可能与当前系统不兼容`);
    }
  }
}

export default new TemplateService();
