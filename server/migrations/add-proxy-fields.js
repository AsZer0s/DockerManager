/**
 * 数据库迁移：为servers表添加代理配置字段
 */

import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function addProxyFields() {
  try {
    console.log('🔄 开始数据库迁移：添加代理配置字段...');
    
    const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../data/database.sqlite');
    
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });
    
    // 检查字段是否已存在
    const tableInfo = await db.all("PRAGMA table_info(servers)");
    const existingColumns = tableInfo.map(col => col.name);
    
    const newColumns = [
      { name: 'ssh_port', type: 'INTEGER DEFAULT 22' },
      { name: 'proxy_enabled', type: 'BOOLEAN DEFAULT false' },
      { name: 'proxy_host', type: 'VARCHAR(255)' },
      { name: 'proxy_port', type: 'INTEGER DEFAULT 1080' },
      { name: 'proxy_username', type: 'VARCHAR(100)' },
      { name: 'proxy_password_encrypted', type: 'TEXT' }
    ];
    
    for (const column of newColumns) {
      if (!existingColumns.includes(column.name)) {
        console.log(`添加字段: ${column.name}`);
        await db.exec(`ALTER TABLE servers ADD COLUMN ${column.name} ${column.type}`);
      } else {
        console.log(`字段已存在: ${column.name}`);
      }
    }
    
    console.log('✅ 数据库迁移完成');
    await db.close();
  } catch (error) {
    console.error('❌ 数据库迁移失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  addProxyFields()
    .then(() => {
      console.log('迁移完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('迁移失败:', error);
      process.exit(1);
    });
}

export default addProxyFields;
