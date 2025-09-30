import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class JWTManager {
  constructor() {
    this.secret = null;
  }

  initialize() {
    let secret = process.env.JWT_SECRET;
    
    if (!secret || secret === 'your_jwt_secret_key_here') {
      console.log('⚠️  JWT_SECRET 未设置或为占位符，正在自动生成新的密钥...');
      
      // 生成128位的随机字符串 (64字节 = 128个十六进制字符)
      secret = this.generateRandomString(64);
      
      // 更新环境变量
      process.env.JWT_SECRET = secret;
      
      // 更新 .env 文件
      this.updateEnvFile(secret);
      
      console.log('✅ 已自动生成新的 JWT_SECRET');
      console.log('🔑 新的 JWT_SECRET:', secret);
      console.log('📝 已更新 .env 文件，请妥善保存此密钥！');
    }
    
    this.secret = secret;
  }

  /**
   * 更新 .env 文件中的 JWT_SECRET
   * @param {string} newSecret - 新的密钥
   */
  updateEnvFile(newSecret) {
    try {
      const envPath = path.join(__dirname, '../.env');
      
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf8');
        
        // 替换或添加 JWT_SECRET
        if (envContent.includes('JWT_SECRET=')) {
          envContent = envContent.replace(
            /JWT_SECRET=.*/,
            `JWT_SECRET=${newSecret}`
          );
        } else {
          envContent += `\nJWT_SECRET=${newSecret}\n`;
        }
        
        fs.writeFileSync(envPath, envContent, 'utf8');
        console.log('📄 .env 文件已更新');
      } else {
        console.log('⚠️  未找到 .env 文件，请手动添加 JWT_SECRET');
      }
    } catch (error) {
      console.error('❌ 更新 .env 文件失败:', error.message);
      console.log('⚠️  请手动将以下内容添加到 .env 文件中:');
      console.log(`JWT_SECRET=${newSecret}`);
    }
  }

  /**
   * 生成随机字符串
   * @param {number} length - 字符串长度（字节数）
   * @returns {string} - 随机字符串
   */
  generateRandomString(length = 64) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * 生成 JWT 令牌
   * @param {Object} payload - 载荷数据
   * @param {string} expiresIn - 过期时间
   * @returns {string} - JWT 令牌
   */
  sign(payload, expiresIn = '7d') {
    if (!this.secret) {
      throw new Error('JWT_SECRET 未初始化');
    }
    return jwt.sign(payload, this.secret, { expiresIn });
  }

  /**
   * 验证 JWT 令牌
   * @param {string} token - JWT 令牌
   * @returns {Object} - 解码后的载荷
   */
  verify(token) {
    if (!this.secret) {
      throw new Error('JWT_SECRET 未初始化');
    }
    return jwt.verify(token, this.secret);
  }

  /**
   * 解码 JWT 令牌（不验证签名）
   * @param {string} token - JWT 令牌
   * @returns {Object} - 解码后的载荷
   */
  decode(token) {
    return jwt.decode(token);
  }

  /**
   * 获取 JWT 密钥
   * @returns {string} - JWT 密钥
   */
  getSecret() {
    return this.secret;
  }
}

export default new JWTManager();
