import crypto from 'crypto';

class Encryption {
  constructor() {
    this.algorithm = 'aes-256-cbc';
    this.key = null;
  }

  initialize() {
    const keyString = process.env.ENCRYPTION_KEY;
    
    // 检查密钥是否存在且有效（32个字符的十六进制字符串）
    const isValidKey = keyString && 
                      keyString.length === 32 && 
                      /^[0-9a-fA-F]+$/.test(keyString);
    
    if (!isValidKey) {
      throw new Error('ENCRYPTION_KEY 未设置或格式无效。请在 .env 文件中设置一个32个字符的十六进制字符串作为 ENCRYPTION_KEY。');
    }
    
    console.log('✅ 使用现有的 ENCRYPTION_KEY');
    console.log('🔑 ENCRYPTION_KEY:', keyString);
    
    // 将字符串转换为 Buffer
    this.key = Buffer.from(keyString, 'utf8');
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
