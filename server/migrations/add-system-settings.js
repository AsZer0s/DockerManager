import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function addSystemSettingsTable() {
  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../data/database.sqlite');
  
  try {
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    // 检查表是否已存在
    const tableExists = await db.get(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='system_settings'
    `);

    if (tableExists) {
      logger.info('system_settings 表已存在，跳过创建');
      await db.close();
      return;
    }

    // 创建 system_settings 表
    await db.exec(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key VARCHAR(100) NOT NULL UNIQUE,
        settings TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    logger.info('system_settings 表创建成功');
    await db.close();
  } catch (error) {
    logger.error('创建 system_settings 表失败:', error);
    throw error;
  }
}

// 如果直接运行此文件，执行迁移
if (import.meta.url === `file://${process.argv[1]}`) {
  addSystemSettingsTable()
    .then(() => {
      console.log('✅ system_settings 表迁移完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ system_settings 表迁移失败:', error);
      process.exit(1);
    });
}

export default addSystemSettingsTable;
