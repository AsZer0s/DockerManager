import express from 'express';
import telegramBotService from '../services/telegramBot.js';
import database from '../config/database.js';
import logger, { createModuleLogger, logError } from '../utils/logger.js';

// 创建Telegram模块日志器
const moduleLogger = createModuleLogger('telegram');

const router = express.Router();

// 发送验证码
router.post('/send-code', async (req, res) => {
  try {
    const { telegramId } = req.body;

    // 记录发送验证码操作开始
    moduleLogger.info('Sending verification code', {
      telegramId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    if (!telegramId) {
      moduleLogger.warn('Verification code send denied - missing telegram ID', {
        ip: req.ip
      });
      return res.status(400).json({
        success: false,
        message: 'Telegram ID 不能为空'
      });
    }

    // 检查是否已经有用户绑定了这个 Telegram ID
    const existingUser = await database.db.get(
      'SELECT * FROM users WHERE telegram_id = ?',
      [telegramId]
    );

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: '该 Telegram ID 已被其他用户绑定'
      });
    }

    // 发送验证码（不需要检查用户是否存在，因为这是绑定过程）
    const result = await telegramBotService.sendVerificationCode(
      telegramId, 
      'User' // 临时用户名，验证成功后会更新
    );

    if (result.success) {
      // 记录验证码发送成功
      moduleLogger.info('Verification code sent successfully', {
        telegramId,
        ip: req.ip
      });

      res.json({
        success: true,
        message: '验证码已发送'
      });
    } else {
      // 记录验证码发送失败
      moduleLogger.error('Verification code send failed', {
        telegramId,
        error: result.error,
        message: result.message,
        ip: req.ip
      });

      if (result.error === 'SEND_FAILED') {
        res.status(400).json({
          success: false,
          message: result.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: result.message
        });
      }
    }
  } catch (error) {
    logError('telegram', error, req);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
});

// 验证验证码并绑定
router.post('/verify-code', async (req, res) => {
  try {
    const { telegramId, code } = req.body;

    // 记录验证码验证操作开始
    moduleLogger.info('Verifying verification code', {
      telegramId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    if (!telegramId || !code) {
      moduleLogger.warn('Verification code verification denied - missing parameters', {
        telegramId,
        code,
        ip: req.ip
      });
      return res.status(400).json({
        success: false,
        message: 'Telegram ID 和验证码不能为空'
      });
    }

    // 验证验证码
    const verificationResult = telegramBotService.verifyCode(telegramId, code);

    if (!verificationResult.success) {
      // 记录验证码验证失败
      moduleLogger.warn('Verification code verification failed', {
        telegramId,
        code,
        error: verificationResult.message,
        ip: req.ip
      });
      return res.status(400).json({
        success: false,
        message: verificationResult.message
      });
    }

    // 检查是否已经有用户绑定了这个 Telegram ID
    const existingUser = await database.db.get(
      'SELECT * FROM users WHERE telegram_id = ?',
      [telegramId]
    );

    if (existingUser) {
      moduleLogger.warn('Verification code verification denied - telegram ID already bound', {
        telegramId,
        existingUserId: existingUser.id,
        ip: req.ip
      });
      return res.status(400).json({
        success: false,
        message: '该 Telegram ID 已被其他用户绑定'
      });
    }

    // 记录验证码验证成功
    moduleLogger.info('Verification code verified successfully', {
      telegramId,
      ip: req.ip
    });

    // 这里需要获取当前登录用户的信息
    // 由于这是验证码验证，我们需要通过其他方式获取用户信息
    // 暂时返回成功，实际绑定需要在用户登录状态下进行
    res.json({
      success: true,
      message: '验证码验证成功，请完成绑定'
    });
  } catch (error) {
    logError('telegram', error, req);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
});

// 完成绑定（需要用户登录状态）
router.post('/complete-binding', async (req, res) => {
  try {
    const { telegramId, code, userId } = req.body;

    // 记录完成绑定操作开始
    moduleLogger.info('Completing telegram binding', {
      telegramId,
      userId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    if (!userId) {
      moduleLogger.warn('Telegram binding completion denied - missing user ID', {
        telegramId,
        ip: req.ip
      });
      return res.status(400).json({
        success: false,
        message: '用户ID不能为空'
      });
    }

    if (!telegramId || !code) {
      moduleLogger.warn('Telegram binding completion denied - missing parameters', {
        telegramId,
        code,
        userId,
        ip: req.ip
      });
      return res.status(400).json({
        success: false,
        message: 'Telegram ID 和验证码不能为空'
      });
    }

    // 验证验证码
    const verificationResult = telegramBotService.verifyCode(telegramId, code);

    if (!verificationResult.success) {
      return res.status(400).json({
        success: false,
        message: verificationResult.message
      });
    }

    // 检查是否已经有用户绑定了这个 Telegram ID
    const existingUser = await database.db.get(
      'SELECT * FROM users WHERE telegram_id = ?',
      [telegramId]
    );

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: '该 Telegram ID 已被其他用户绑定'
      });
    }

    // 获取Telegram用户信息
    let telegramUsername = null;
    try {
      const telegramUserInfo = await telegramBotService.getTelegramUserInfo(telegramId);
      telegramUsername = telegramUserInfo.displayName;
      logger.info(`获取到Telegram用户信息: ${telegramUsername}`);
    } catch (error) {
      logger.warn('获取Telegram用户信息失败:', error.message);
    }

    // 更新当前用户的 Telegram 绑定
    const updateResult = await database.db.run(
      'UPDATE users SET telegram_id = ?, telegram_username = ?, telegram_verified = 1, telegram_verified_at = ? WHERE id = ?',
      [telegramId, telegramUsername, new Date().toISOString(), userId]
    );

    logger.info(`数据库更新结果: 影响行数 ${updateResult.changes}`);

    // 验证更新是否成功
    const verifyUser = await database.db.get(
      'SELECT telegram_id, telegram_verified FROM users WHERE id = ?',
      [userId]
    );
    
    if (!verifyUser || verifyUser.telegram_id !== telegramId) {
      logger.error(`绑定验证失败: 期望 ${telegramId}, 实际 ${verifyUser?.telegram_id}`);
      return res.status(500).json({
        success: false,
        message: '绑定失败，请重试'
      });
    }

    // 记录绑定验证成功
    moduleLogger.info('Telegram binding verification successful', {
      userId,
      telegramId,
      ip: req.ip
    });

    // 获取用户信息
    const user = await database.db.get(
      'SELECT username, email FROM users WHERE id = ?',
      [userId]
    );

    // 记录绑定成功
    moduleLogger.info('Telegram binding completed successfully', {
      userId,
      username: user?.username,
      telegramId,
      ip: req.ip
    });

    // 发送绑定成功通知到 Telegram
    try {
      await telegramBotService.sendNotification(
        telegramId,
        `🎉 Telegram 绑定成功！\n\n` +
        `您的账户已成功绑定到 Telegram\n\n` +
        `用户名: ${user?.username || '未知'}\n` +
        `邮箱: ${user?.email || '未知'}\n` +
        `绑定时间: ${new Date().toLocaleString('zh-CN')}\n\n` +
        `现在您可以使用 DockerManager For Bot 的所有功能\n` +
        `发送 /start 开始使用`
      );
    } catch (error) {
      logger.warn('发送绑定成功通知失败:', error.message);
    }

    res.json({
      success: true,
      message: 'Telegram 绑定成功'
    });
  } catch (error) {
    logError('telegram', error, req);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
});

// 发送解绑验证码
router.post('/send-unbind-code', async (req, res) => {
  try {
    const { userId } = req.body;

    // 记录发送解绑验证码操作开始
    moduleLogger.info('Sending unbind verification code', {
      userId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    if (!userId) {
      moduleLogger.warn('Unbind verification code send denied - missing user ID', {
        ip: req.ip
      });
      return res.status(400).json({
        success: false,
        message: '用户ID不能为空'
      });
    }

    // 获取用户的 Telegram ID
    const user = await database.db.get(
      'SELECT telegram_id, username FROM users WHERE id = ?',
      [userId]
    );

    if (!user || !user.telegram_id) {
      return res.status(404).json({
        success: false,
        message: '用户未绑定 Telegram'
      });
    }

    // 发送验证码
    const result = await telegramBotService.sendVerificationCode(
      user.telegram_id, 
      user.username
    );

    if (result.success) {
    // 记录解绑验证码发送成功
    moduleLogger.info('Unbind verification code sent successfully', {
      userId,
      telegramId: user.telegram_id,
      ip: req.ip
    });

    res.json({
      success: true,
      message: '解绑验证码已发送'
    });
    } else {
      // 记录解绑验证码发送失败
      moduleLogger.error('Unbind verification code send failed', {
        userId,
        telegramId: user.telegram_id,
        error: result.error,
        message: result.message,
        ip: req.ip
      });

      if (result.error === 'SEND_FAILED') {
        res.status(400).json({
          success: false,
          message: result.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: result.message
        });
      }
    }
  } catch (error) {
    logError('telegram', error, req);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
});

// 验证解绑验证码并解除绑定
router.post('/verify-unbind-code', async (req, res) => {
  try {
    const { userId, code } = req.body;

    // 记录验证解绑验证码操作开始
    moduleLogger.info('Verifying unbind verification code', {
      userId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    if (!userId || !code) {
      moduleLogger.warn('Unbind verification code verification denied - missing parameters', {
        userId,
        code,
        ip: req.ip
      });
      return res.status(400).json({
        success: false,
        message: '用户ID和验证码不能为空'
      });
    }

    // 获取用户的 Telegram ID
    const user = await database.db.get(
      'SELECT telegram_id, username FROM users WHERE id = ?',
      [userId]
    );

    if (!user || !user.telegram_id) {
      return res.status(404).json({
        success: false,
        message: '用户未绑定 Telegram'
      });
    }

    // 验证验证码
    const verificationResult = telegramBotService.verifyCode(user.telegram_id, code);

    if (!verificationResult.success) {
      return res.status(400).json({
        success: false,
        message: verificationResult.message
      });
    }

    // 解除绑定
    await database.db.run(
      'UPDATE users SET telegram_id = NULL, telegram_username = NULL, telegram_verified = 0, telegram_verified_at = NULL WHERE id = ?',
      [userId]
    );

    // 记录解绑成功
    moduleLogger.info('Telegram unbinding completed successfully', {
      userId,
      username: user.username,
      telegramId: user.telegram_id,
      ip: req.ip
    });

    // 发送解绑成功通知到 Telegram
    try {
      await telegramBotService.sendNotification(
        user.telegram_id,
        `🔓 Telegram 绑定已解除\n\n` +
        `您的账户已成功解除 Telegram 绑定\n\n` +
        `用户名: ${user.username}\n` +
        `解绑时间: ${new Date().toLocaleString('zh-CN')}\n\n` +
        `期待与您再次相见`
      );
    } catch (error) {
      logger.warn('发送解绑成功通知失败:', error.message);
    }

    res.json({
      success: true,
      message: 'Telegram 解绑成功'
    });
  } catch (error) {
    logError('telegram', error, req);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
});

// 检查绑定状态
router.get('/binding-status/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;

    // 记录检查绑定状态操作开始
    moduleLogger.info('Checking telegram binding status', {
      telegramId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    const user = await database.db.get(
      'SELECT telegram_verified, telegram_verified_at FROM users WHERE telegram_id = ?',
      [telegramId]
    );

    if (!user) {
      moduleLogger.warn('Binding status check failed - user not found', {
        telegramId,
        ip: req.ip
      });
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    res.json({
      success: true,
      data: {
        isVerified: !!user.telegram_verified,
        verifiedAt: user.telegram_verified_at
      }
    });
  } catch (error) {
    logError('telegram', error, req);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
});

export default router;
