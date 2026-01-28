package handler

import (
	"docker-pulse/internal/model"
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// GetTelegramConfig retrieves Telegram Bot Token and Web App URL from the database.
func GetTelegramConfig(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var botToken, webAppURL string

		// Fetch Bot Token
		var tokenConfig model.Config
		if err := db.Where("key = ?", model.ConfigKeyTelegramBotToken).First(&tokenConfig).Error; err != nil {
			if err != gorm.ErrRecordNotFound {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve Telegram Bot Token"})
				return
			}
			// If not found, it's not an error, just means it's not configured yet.
		} else {
			botToken = tokenConfig.Value
		}

		// Fetch Web App URL
		var urlConfig model.Config
		if err := db.Where("key = ?", model.ConfigKeyTelegramWebAppURL).First(&urlConfig).Error; err != nil {
			if err != gorm.ErrRecordNotFound {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve Telegram Web App URL"})
				return
			}
			// If not found, it's not an error.
		} else {
			webAppURL = urlConfig.Value
		}

		c.JSON(http.StatusOK, gin.H{
			"bot_token":   botToken,
			"web_app_url": webAppURL,
		})
	}
}

// UpdateTelegramConfig updates Telegram Bot Token and Web App URL in the database.
func UpdateTelegramConfig(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			BotToken  string `json:"bot_token"`
			WebAppURL string `json:"web_app_url"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Update or create Bot Token
		if err := db.Model(&model.Config{}).Where("key = ?", model.ConfigKeyTelegramBotToken).
			Assign(model.Config{Value: input.BotToken}).
			FirstOrCreate(&model.Config{}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update Telegram Bot Token"})
			return
		}

		// Update or create Web App URL
		if err := db.Model(&model.Config{}).Where("key = ?", model.ConfigKeyTelegramWebAppURL).
			Assign(model.Config{Value: input.WebAppURL}).
			FirstOrCreate(&model.Config{}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update Telegram Web App URL"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Telegram configuration updated successfully"})
	}
}

// GetLatencyConfig retrieves the ping targets from the database.
func GetLatencyConfig(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var pingTargets string
		var config model.Config
		if err := db.Where("key = ?", model.ConfigKeyPingTargets).First(&config).Error; err == nil {
			pingTargets = config.Value
		}
		c.JSON(http.StatusOK, gin.H{"ping_targets": pingTargets})
	}
}

// UpdateLatencyConfig updates the ping targets in the database.
func UpdateLatencyConfig(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			PingTargets string `json:"ping_targets"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if err := db.Model(&model.Config{}).Where("key = ?", model.ConfigKeyPingTargets).
			Assign(model.Config{Value: input.PingTargets}).
			FirstOrCreate(&model.Config{}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update ping targets"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Latency configuration updated successfully"})
	}
}
