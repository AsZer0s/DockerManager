import express from 'express';

import logger, { createModuleLogger, logError } from '../utils/logger.js';
import telegramBot from '../services/telegramBot.js';

// 创建Telegram模块日志器
const moduleLogger = createModuleLogger('telegram');

const router = express.Router();

/**
 * @route POST /api/telegram/webhook
 * @desc Telegram Webhook 端点
 * @access Public
 */
router.post('/webhook', (req, res) => {
  try {
    // 记录Telegram webhook接收
    moduleLogger.info('Telegram webhook received', {
      body: req.body,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Telegram 机器人会自动处理 webhook 数据
    // 这里只是确认接收
    res.status(200).json({ status: 'ok' });
  } catch (error) {
    logError('telegram', error, req);
    res.status(500).json({ error: 'Webhook 处理失败' });
  }
});

/**
 * @route GET /api/telegram/status
 * @desc 获取 Telegram 机器人状态
 * @access Public
 */
router.get('/status', (req, res) => {
  try {
    res.json({
      status: telegramBot.isInitialized ? 'active' : 'inactive',
      initialized: telegramBot.isInitialized
    });
  } catch (error) {
    logError('telegram', error, req);
    res.status(500).json({ error: '获取状态失败' });
  }
});

export default router;
