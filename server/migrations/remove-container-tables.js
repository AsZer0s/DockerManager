import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function removeContainerTables() {
  const dbPath = process.env.DATABASE_PATH || 
    path.join(__dirname, '../data/database.sqlite');
  
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  console.log('🗑️  开始删除容器相关表...');

  // 删除表
  await db.run('DROP TABLE IF EXISTS user_containers');
  await db.run('DROP TABLE IF EXISTS container_monitoring');
  await db.run('DROP TABLE IF EXISTS containers');
  
  // 删除相关索引
  await db.run('DROP INDEX IF EXISTS idx_containers_server_id');
  await db.run('DROP INDEX IF EXISTS idx_containers_container_id');
  await db.run('DROP INDEX IF EXISTS idx_container_monitoring_server_id');
  await db.run('DROP INDEX IF EXISTS idx_container_monitoring_container_id');
  await db.run('DROP INDEX IF EXISTS idx_container_monitoring_timestamp');
  await db.run('DROP INDEX IF EXISTS idx_user_containers_user_id');
  await db.run('DROP INDEX IF EXISTS idx_user_containers_container_id');

  await db.close();
  console.log('✅ 容器相关表删除完成');
}

removeContainerTables().catch(console.error);
