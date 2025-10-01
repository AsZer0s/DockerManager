import database from '../config/database.js';
import logger from '../utils/logger.js';

async function addTelegramUsernameField() {
  try {
    await database.connect();
    
    // 检查字段是否已存在
    const tableInfo = await database.query("PRAGMA table_info(users)");
    const hasTelegramUsername = tableInfo.rows.some(column => column.name === 'telegram_username');
    
    if (hasTelegramUsername) {
      logger.info('telegram_username 字段已存在，跳过迁移');
      return;
    }
    
    // 添加 telegram_username 字段
    await database.query(`
      ALTER TABLE users ADD COLUMN telegram_username TEXT
    `);
    
    logger.info('成功添加 telegram_username 字段到 users 表');
    
  } catch (error) {
    logger.error('添加 telegram_username 字段失败:', error);
    throw error;
  } finally {
    await database.disconnect();
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  addTelegramUsernameField()
    .then(() => {
      logger.info('数据库迁移完成');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('数据库迁移失败:', error);
      process.exit(1);
    });
}

export default addTelegramUsernameField;
