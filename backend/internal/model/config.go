package model

import "gorm.io/gorm"

type Config struct {
	gorm.Model
	Key   string `gorm:"uniqueIndex;not null"`
	Value string `gorm:"type:text"`
}

const (
	ConfigKeyTelegramBotToken  = "telegram_bot_token"
	ConfigKeyTelegramWebAppURL = "telegram_web_app_url"
	ConfigKeyPingTargets       = "ping_targets"
)
