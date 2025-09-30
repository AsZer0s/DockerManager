import express from 'express';

import logger from '../utils/logger.js';
import telegramBot from '../services/telegramBot.js';

const router = express.Router();

/**
 * @route POST /api/telegram/webhook
 * @desc Telegram Webhook 端点
 * @access Public
 */
router.post('/webhook', (req, res) => {
  try {
    // Telegram 机器人会自动处理 webhook 数据
    // 这里只是确认接收
    res.status(200).json({ status: 'ok' });
  } catch (error) {
    logger.error('Telegram webhook 处理失败:', error);
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
    logger.error('获取 Telegram 状态失败:', error);
    res.status(500).json({ error: '获取状态失败' });
  }
});

export default router;
