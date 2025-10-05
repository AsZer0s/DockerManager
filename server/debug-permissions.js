#!/usr/bin/env node

/**
 * 调试用户权限脚本
 * 用于检查用户是否有正确的服务器权限
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 数据库路径
const dbPath = path.join(__dirname, 'data', 'database.sqlite');

// 创建数据库连接
const db = new sqlite3.Database(dbPath);

async function checkUserPermissions(userId, serverId) {
  return new Promise((resolve, reject) => {
    console.log(`\n🔍 检查用户 ${userId} 对服务器 ${serverId} 的权限...\n`);
    
    // 1. 检查用户是否存在
    db.get('SELECT id, username, role FROM users WHERE id = ?', [userId], (err, user) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (!user) {
        console.log('❌ 用户不存在');
        resolve(null);
        return;
      }
      
      console.log(`👤 用户信息:`);
      console.log(`   ID: ${user.id}`);
      console.log(`   用户名: ${user.username}`);
      console.log(`   角色: ${user.role}`);
      
      // 2. 检查服务器是否存在
      db.get('SELECT id, name, host, is_active FROM servers WHERE id = ?', [serverId], (err, server) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (!server) {
          console.log('❌ 服务器不存在');
          resolve(null);
          return;
        }
        
        console.log(`\n🖥️  服务器信息:`);
        console.log(`   ID: ${server.id}`);
        console.log(`   名称: ${server.name}`);
        console.log(`   主机: ${server.host}`);
        console.log(`   状态: ${server.is_active ? '活跃' : '禁用'}`);
        
        // 3. 检查用户权限
        db.get(
          'SELECT can_view, can_control, can_ssh, hide_sensitive_info FROM user_server_permissions WHERE user_id = ? AND server_id = ?',
          [userId, serverId],
          (err, permission) => {
            if (err) {
              reject(err);
              return;
            }
            
            console.log(`\n🔐 权限信息:`);
            if (!permission) {
              console.log('❌ 没有权限记录');
              console.log('💡 建议: 请联系管理员为用户分配服务器权限');
            } else {
              console.log(`   查看权限: ${permission.can_view ? '✅ 有' : '❌ 无'}`);
              console.log(`   控制权限: ${permission.can_control ? '✅ 有' : '❌ 无'}`);
              console.log(`   SSH权限: ${permission.can_ssh ? '✅ 有' : '❌ 无'}`);
              console.log(`   隐藏敏感信息: ${permission.hide_sensitive_info ? '是' : '否'}`);
              
              if (!permission.can_view) {
                console.log('⚠️  用户没有查看权限，无法查看容器日志');
              }
            }
            
            // 4. 如果是管理员，显示所有权限
            if (user.role === 'admin') {
              console.log(`\n👑 管理员权限:`);
              console.log('   管理员拥有所有服务器的完全访问权限');
            }
            
            resolve({ user, server, permission });
          }
        );
      });
    });
  });
}

async function listAllPermissions() {
  return new Promise((resolve, reject) => {
    console.log('\n📋 所有用户权限列表:\n');
    
    db.all(`
      SELECT 
        u.id as user_id,
        u.username,
        u.role,
        s.id as server_id,
        s.name as server_name,
        p.can_view,
        p.can_control,
        p.can_ssh,
        p.hide_sensitive_info
      FROM users u
      LEFT JOIN user_server_permissions p ON u.id = p.user_id
      LEFT JOIN servers s ON p.server_id = s.id
      ORDER BY u.username, s.name
    `, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (rows.length === 0) {
        console.log('没有找到任何权限记录');
        resolve([]);
        return;
      }
      
      let currentUser = null;
      rows.forEach(row => {
        if (currentUser !== row.user_id) {
          currentUser = row.user_id;
          console.log(`\n👤 ${row.username} (${row.role})`);
        }
        
        if (row.server_id) {
          console.log(`   🖥️  ${row.server_name} (ID: ${row.server_id})`);
          console.log(`      查看: ${row.can_view ? '✅' : '❌'} | 控制: ${row.can_control ? '✅' : '❌'} | SSH: ${row.can_ssh ? '✅' : '❌'}`);
        } else {
          console.log(`   ⚠️  没有分配任何服务器权限`);
        }
      });
      
      resolve(rows);
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  
  try {
    if (args.length === 0) {
      // 显示所有权限
      await listAllPermissions();
    } else if (args.length === 2) {
      // 检查特定用户的权限
      const userId = parseInt(args[0]);
      const serverId = parseInt(args[1]);
      
      if (isNaN(userId) || isNaN(serverId)) {
        console.log('❌ 请提供有效的用户ID和服务器ID');
        console.log('用法: node debug-permissions.js [用户ID] [服务器ID]');
        console.log('或者: node debug-permissions.js (显示所有权限)');
        return;
      }
      
      await checkUserPermissions(userId, serverId);
    } else {
      console.log('❌ 参数错误');
      console.log('用法: node debug-permissions.js [用户ID] [服务器ID]');
      console.log('或者: node debug-permissions.js (显示所有权限)');
      return;
    }
  } catch (error) {
    console.error('❌ 错误:', error.message);
  } finally {
    db.close();
  }
}

// 运行脚本
main();
