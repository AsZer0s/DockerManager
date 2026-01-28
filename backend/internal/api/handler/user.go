package handler

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors" // Add this import
	"fmt"    // Add this import
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"docker-pulse/internal/model"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// Claims represents the JWT claims
type Claims struct {
	UserID       uint   `json:"user_id"`
	Username     string `json:"username"`
	Role         string `json:"role"`
	TokenVersion int64  `json:"token_version"` // Used for token invalidation
	jwt.RegisteredClaims
}

func Login(db *gorm.DB, secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		var user model.User
		if err := db.Where("username = ?", input.Username).First(&user).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
			return
		}

		if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(input.Password)); err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
			return
		}

		// Create the JWT claims, which includes the user's info and expiry time
		expirationTime := time.Now().Add(24 * time.Hour)
		claims := &Claims{
			UserID:       user.ID,
			Username:     user.Username,
			Role:         user.Role,
			TokenVersion: user.TokenVersion,
			RegisteredClaims: jwt.RegisteredClaims{
				ExpiresAt: jwt.NewNumericDate(expirationTime),
			},
		}

		// Declare the token with the algorithm used for signing, and the claims
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

		// Create the JWT string
		tokenString, err := token.SignedString([]byte(secret))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not generate token"})
			return
		}

		// Update LastLogin field
		now := time.Now()
		user.LastLogin = &now
		db.Save(&user)

		c.JSON(http.StatusOK, gin.H{"token": tokenString, "role": user.Role})
	}
}

func ChangePassword(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			CurrentPassword string `json:"current_password"`
			NewPassword     string `json:"new_password"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Extract user from context (set by AuthMiddleware)
		userID, exists := c.Get("userID")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}

		var user model.User
		if err := db.First(&user, userID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}

		if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(input.CurrentPassword)); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Current password incorrect"})
			return
		}

		// Update password and increment token version to invalidate all existing tokens
		hashedPassword, err := model.HashPassword(input.NewPassword)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
			return
		}

		user.Password = hashedPassword
		user.TokenVersion++
		db.Save(&user)

		c.JSON(http.StatusOK, gin.H{"message": "Password updated successfully"})
	}
}

func ListUsers(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var users []model.User
		db.Find(&users)
		c.JSON(http.StatusOK, users)
	}
}

func CreateUser(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			Username   string `json:"username"`
			Password   string `json:"password"`
			Role       string `json:"role"`
			TelegramID int64  `json:"telegram_id"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		user := model.User{
			Username:   input.Username,
			Password:   input.Password, // BeforeCreate hook will hash this
			Role:       input.Role,
			TelegramID: input.TelegramID,
		}

		if err := db.Create(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not create user"})
			return
		}
		c.JSON(http.StatusCreated, user)
	}
}

func UpdateUser(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var user model.User
		if err := db.First(&user, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}

		var input struct {
			Username   string `json:"username"`
			Role       string `json:"role"`
			TelegramID int64  `json:"telegram_id"`
		}

		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Update only non-password fields
		user.Username = input.Username
		user.Role = input.Role
		user.TelegramID = input.TelegramID

		db.Save(&user)
		c.JSON(http.StatusOK, user)
	}
}

func DeleteUser(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		// Use a transaction to ensure atomicity
		err := db.Transaction(func(tx *gorm.DB) error {
			// Delete associated server permissions first
			if err := tx.Where("user_id = ?", id).Delete(&model.ServerPermission{}).Error; err != nil {
				return err
			}

			// Then delete the user record permanently
			if err := tx.Unscoped().Delete(&model.User{}, id).Error; err != nil {
				return err
			}

			return nil
		})

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete user and associated permissions"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "User deleted permanently"})
	}
}

func ResetUserPassword(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Check if the requesting user is an admin
		requesterRole, exists := c.Get("role")
		if !exists || requesterRole != "admin" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Forbidden: Only administrators can reset passwords"})
			return
		}

		id := c.Param("id")
		var input struct {
			NewPassword string `json:"new_password"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		var user model.User
		if err := db.First(&user, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}

		// Update password and increment token version to invalidate all existing tokens
		hashedPassword, err := model.HashPassword(input.NewPassword)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
			return
		}

		user.Password = hashedPassword
		user.TokenVersion++
		db.Save(&user)

		c.JSON(http.StatusOK, gin.H{"message": "User password reset successfully"})
	}
}

// validateTelegramData validates the data received from Telegram WebApp
func validateTelegramData(data string, botToken string) (map[string]string, error) {
	params, err := url.ParseQuery(data)
	if err != nil {
		return nil, err
	}

	hash := params.Get("hash")
	if hash == "" {
		return nil, errors.New("hash parameter missing")
	}

	// Collect all check strings except 'hash'
	var checkStrings []string
	for key, values := range params {
		if key != "hash" {
			// Assuming single value per key for Telegram data
			checkStrings = append(checkStrings, fmt.Sprintf("%s=%s", key, values[0]))
		}
	}
	sort.Strings(checkStrings)
	dataCheckString := strings.Join(checkStrings, "\n")

	// Calculate secret key
	keyMAC := hmac.New(sha256.New, []byte("WebAppData"))
	keyMAC.Write([]byte(botToken))
	secretKey := keyMAC.Sum(nil)

	// Calculate hash of dataCheckString
	h := hmac.New(sha256.New, secretKey)
	h.Write([]byte(dataCheckString))
	calculatedHash := hex.EncodeToString(h.Sum(nil))

	if calculatedHash != hash {
		return nil, errors.New("data validation failed: hash mismatch")
	}

	// Extract user data
	userData := make(map[string]string)
	if userJSON := params.Get("user"); userJSON != "" {
		// Simple JSON parsing to extract ID, assuming user data is a simple JSON string
		// In a real scenario, use a proper JSON unmarshaler. For simplicity, we extract ID here.
		// Example: "{"id":123456789,"is_bot":false,"first_name":"Cline","username":"cline_dev","language_code":"en"}"

		// Find ID
		idIndex := strings.Index(userJSON, `"id":`)
		if idIndex != -1 {
			start := idIndex + 5
			end := strings.Index(userJSON[start:], ",")
			if end == -1 {
				end = strings.Index(userJSON[start:], "}")
			}
			if end != -1 {
				idStr := userJSON[start : start+end]
				userData["id"] = idStr
			}
		}
	}

	return userData, nil
}

// BindTelegram handles binding the current authenticated user to a Telegram ID
func BindTelegram(db *gorm.DB, botToken string) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			InitData string `json:"init_data"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request data"})
			return
		}

		if botToken == "" {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Telegram Bot Token is not configured"})
			return
		}

		// 1. Validate Telegram data
		userData, err := validateTelegramData(input.InitData, botToken)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		telegramIDStr, ok := userData["id"]
		if !ok || telegramIDStr == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Telegram user ID not found in data"})
			return
		}

		telegramID, err := strconv.ParseInt(telegramIDStr, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid Telegram ID format"})
			return
		}

		// 2. Check if Telegram ID is already bound to another user
		var existingUser model.User
		// Exclude the current user from the check
		currentUserID, _ := c.Get("userID")

		if err := db.Where("telegram_id = ? AND id != ?", telegramID, currentUserID).First(&existingUser).Error; err == nil {
			c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("Telegram ID %d is already bound to user %s", telegramID, existingUser.Username)})
			return
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error during check"})
			return
		}

		// 3. Bind Telegram ID to current user
		var user model.User
		if err := db.First(&user, currentUserID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}

		user.TelegramID = telegramID
		db.Save(&user)

		c.JSON(http.StatusOK, gin.H{"message": "Telegram ID bound successfully", "telegram_id": telegramID})
	}
}

func GetUserPermissions(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.Param("id")
		var permissions []model.ServerPermission
		if err := db.Where("user_id = ?", userID).Find(&permissions).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch permissions"})
			return
		}
		c.JSON(http.StatusOK, permissions)
	}
}

func UpdateUserPermissions(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDStr := c.Param("id")
		userID, err := strconv.ParseUint(userIDStr, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
			return
		}

		var input struct {
			Permissions []struct {
				ServerID    uint   `json:"server_id"`
				AccessLevel string `json:"access_level"`
			} `json:"permissions"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		err = db.Transaction(func(tx *gorm.DB) error {
			// Remove existing permissions
			if err := tx.Unscoped().Where("user_id = ?", userID).Delete(&model.ServerPermission{}).Error; err != nil {
				fmt.Printf("Error deleting existing permissions for user %d: %v\n", userID, err)
				return err
			}

			// Add new permissions
			for _, p := range input.Permissions {
				accessLevel := p.AccessLevel
				if accessLevel == "" {
					accessLevel = model.AccessLevelRead // Default to read-only if not specified
				}

				permission := model.ServerPermission{
					UserID:      uint(userID),
					ServerID:    p.ServerID,
					AccessLevel: accessLevel,
				}
				if err := tx.Create(&permission).Error; err != nil {
					fmt.Printf("Error creating new permission for user %d, server %d: %v\n", userID, p.ServerID, err)
					return err
				}
			}
			return nil
		})

		if err != nil {
			fmt.Printf("Transaction failed for user %d permissions update: %v\n", userID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update permissions", "details": err.Error()})
			return
		}

		// Clear server list cache for this specific user
		cacheKey := fmt.Sprintf("servers_user_%d", userID)
		serverCache.Delete(cacheKey)

		c.JSON(http.StatusOK, gin.H{"message": "Permissions updated successfully"})
	}
}
