import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Encryption {
  constructor() {
    this.algorithm = 'aes-256-cbc';
    this.key = null;
  }

  initialize() {
    let keyString = process.env.ENCRYPTION_KEY;
    
    if (!keyString || keyString.length !== 32) {
      console.log('⚠️  ENCRYPTION_KEY 不符合要求，正在自动生成新的密钥...');
      
      // 生成32个字符的随机字符串
      keyString = this.generateRandomString(16); // 16字节 = 32个十六进制字符
      
      // 更新环境变量
      process.env.ENCRYPTION_KEY = keyString;
      
      // 更新 .env 文件
      this.updateEnvFile(keyString);
      
      console.log('✅ 已自动生成新的 ENCRYPTION_KEY');
      console.log('🔑 新的 ENCRYPTION_KEY:', keyString);
      console.log('📝 已更新 .env 文件，请妥善保存此密钥！');
    }
    
    // 将字符串转换为 Buffer
    this.key = Buffer.from(keyString, 'utf8');
  }

  /**
   * 更新 .env 文件中的 ENCRYPTION_KEY
   * @param {string} newKey - 新的密钥
   */
  updateEnvFile(newKey) {
    try {
      const envPath = path.join(__dirname, '../.env');
      
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf8');
        
        // 替换或添加 ENCRYPTION_KEY
        if (envContent.includes('ENCRYPTION_KEY=')) {
          envContent = envContent.replace(
            /ENCRYPTION_KEY=.*/,
            `ENCRYPTION_KEY=${newKey}`
          );
        } else {
          envContent += `\nENCRYPTION_KEY=${newKey}\n`;
        }
        
        fs.writeFileSync(envPath, envContent, 'utf8');
        console.log('📄 .env 文件已更新');
      } else {
        console.log('⚠️  未找到 .env 文件，请手动添加 ENCRYPTION_KEY');
      }
    } catch (error) {
      console.error('❌ 更新 .env 文件失败:', error.message);
      console.log('⚠️  请手动将以下内容添加到 .env 文件中:');
      console.log(`ENCRYPTION_KEY=${newKey}`);
    }
  }

  /**
   * 加密数据
   * @param {string} text - 要加密的文本
   * @returns {string} - 加密后的字符串 (iv:encryptedData)
   */
  encrypt(text) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      return `${iv.toString('hex')}:${encrypted}`;
    } catch (error) {
      throw new Error(`加密失败: ${error.message}`);
    }
  }

  /**
   * 解密数据
   * @param {string} encryptedData - 加密的字符串
   * @returns {string} - 解密后的文本
   */
  decrypt(encryptedData) {
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 2) {
        throw new Error('无效的加密数据格式');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];

      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error(`解密失败: ${error.message}`);
    }
  }

  /**
   * 生成随机字符串
   * @param {number} length - 字符串长度
   * @returns {string} - 随机字符串
   */
  generateRandomString(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * 生成哈希值
   * @param {string} data - 要哈希的数据
   * @param {string} algorithm - 哈希算法 (默认: sha256)
   * @returns {string} - 哈希值
   */
  hash(data, algorithm = 'sha256') {
    return crypto.createHash(algorithm).update(data).digest('hex');
  }

  /**
   * 验证哈希值
   * @param {string} data - 原始数据
   * @param {string} hash - 哈希值
   * @param {string} algorithm - 哈希算法
   * @returns {boolean} - 是否匹配
   */
  verifyHash(data, hash, algorithm = 'sha256') {
    const dataHash = this.hash(data, algorithm);
    return crypto.timingSafeEqual(Buffer.from(dataHash), Buffer.from(hash));
  }
}

export default new Encryption();
