package handler

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time" // Import time package for cache TTL

	"docker-pulse/internal/model"
	"docker-pulse/internal/ssh"

	"github.com/gin-gonic/gin"
	"github.com/patrickmn/go-cache" // Import go-cache
	"gorm.io/gorm"
)

const (
	serverCacheKeyPrefix = "servers_user_"
	serverCacheTTL       = 5 * time.Minute
	serverCacheCleanup   = 10 * time.Minute
)

// Cache for server lists and individual servers
var serverCache = cache.New(serverCacheTTL, serverCacheCleanup)

// GetServerStats handles fetching real-time statistics for a single server
func GetServerStats(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		serverID, err := strconv.ParseUint(id, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid server ID"})
			return
		}

		userID, _ := c.Get("userID")
		userRole, _ := c.Get("role")

		// 权限检查：非管理员必须拥有显式权限
		if userRole != "admin" {
			var permission model.ServerPermission
			if err := db.Where("user_id = ? AND server_id = ?", userID, serverID).First(&permission).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					c.JSON(http.StatusForbidden, gin.H{"error": "access to this server is denied"})
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check permissions"})
				return
			}
		}

		var server model.Server
		if err := db.First(&server, serverID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch server from DB"})
			return
		}

		// Create SSH client
		sshClient, err := ssh.NewSSHClient(server.IP, server.Port, server.Username, server.AuthMode, server.Secret)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to create SSH client: %v", err)})
			return
		}

		// Get ping targets from config
		var pingTargets string
		var config model.Config
		if err := db.Where("key = ?", model.ConfigKeyPingTargets).First(&config).Error; err == nil {
			pingTargets = config.Value
		}

		// Get real-time stats
		stats, err := sshClient.GetServerRealtimeStats(pingTargets)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get server stats: %v", err)})
			return
		}

		c.JSON(http.StatusOK, stats)
	}
}

// CreateServer handles creating a new server entry
func CreateServer(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			Name     string `json:"name" binding:"required"`
			IP       string `json:"ip" binding:"required"`
			Port     int    `json:"port"`
			Username string `json:"username" binding:"required"`
			AuthMode string `json:"auth_mode" binding:"required"`
			Secret   string `json:"secret" binding:"required"`
		}

		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Get current user ID from context
		userID, exists := c.Get("userID")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
			return
		}
		currentUserID := userID.(uint)

		server := model.Server{
			Name:     input.Name,
			IP:       input.IP,
			Port:     input.Port,
			Username: input.Username,
			AuthMode: input.AuthMode,
			Secret:   input.Secret,
		}

		// Use a transaction to ensure atomicity
		err := db.Transaction(func(tx *gorm.DB) error {
			// 1. Create the server
			if err := tx.Create(&server).Error; err != nil {
				return err
			}

			// 2. Assign permission to the user who created the server
			permission := model.ServerPermission{
				UserID:      currentUserID,
				ServerID:    server.ID,
				AccessLevel: model.AccessLevelFull,
			}

			if err := tx.Create(&permission).Error; err != nil {
				return err
			}

			return nil
		})

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create server and assign permissions"})
			return
		}

		c.JSON(http.StatusCreated, server)
	}
}

// ListServers handles listing servers based on user permissions
func ListServers(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, _ := c.Get("userID")
		userRole, _ := c.Get("role")

		var servers []model.Server
		cacheKey := fmt.Sprintf("%s%d", serverCacheKeyPrefix, userID)

		// 尝试从缓存中获取
		if cachedServers, found := serverCache.Get(cacheKey); found {
			c.JSON(http.StatusOK, cachedServers)
			return
		}

		if userRole == "admin" {
			// Admins get all servers
			if err := db.Find(&servers).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch servers for admin"})
				return
			}
		} else {
			// Regular users get only permitted servers
			var permissions []model.ServerPermission
			if err := db.Where("user_id = ?", userID).Find(&permissions).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch user permissions"})
				return
			}

			if len(permissions) == 0 {
				// No permissions, return empty list
				c.JSON(http.StatusOK, []model.Server{})
				return
			}

			serverIDs := make([]uint, len(permissions))
			for i, p := range permissions {
				serverIDs[i] = p.ServerID
			}

			if err := db.Where("id IN ?", serverIDs).Find(&servers).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch permitted servers"})
				return
			}
		}

		// 存入缓存
		serverCache.Set(cacheKey, servers, serverCacheTTL)

		c.JSON(http.StatusOK, servers)
	}
}

// GetServer handles fetching a single server by ID, checking permissions
func GetServer(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		serverID, err := strconv.ParseUint(id, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid server ID"})
			return
		}

		userID, _ := c.Get("userID")
		userRole, _ := c.Get("role")

		// Admins can view any server
		if userRole != "admin" {
			// Regular users must have explicit permission
			var permission model.ServerPermission
			if err := db.Where("user_id = ? AND server_id = ?", userID, serverID).First(&permission).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					c.JSON(http.StatusForbidden, gin.H{"error": "access to this server is denied"})
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check permissions"})
				return
			}
		}

		var server model.Server
		cacheKey := fmt.Sprintf("server_%d", serverID)

		// 尝试从缓存中获取单个服务器
		if cachedServer, found := serverCache.Get(cacheKey); found {
			c.JSON(http.StatusOK, cachedServer)
			return
		}

		if err := db.First(&server, serverID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch server"})
			return
		}

		// 存入缓存
		serverCache.Set(cacheKey, server, serverCacheTTL)

		c.JSON(http.StatusOK, server)
	}
}

// UpdateServer handles updating an existing server entry
func UpdateServer(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		serverID, err := strconv.ParseUint(id, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid server ID"})
			return
		}

		var server model.Server
		if err := db.First(&server, serverID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch server"})
			return
		}

		var input struct {
			Name     string `json:"name"`
			IP       string `json:"ip"`
			Port     int    `json:"port"`
			Username string `json:"username"`
			AuthMode string `json:"auth_mode"`
			Secret   string `json:"secret"`
		}

		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Update fields if provided
		if input.Name != "" {
			server.Name = input.Name
		}
		if input.IP != "" {
			server.IP = input.IP
		}
		if input.Port != 0 {
			server.Port = input.Port
		}
		if input.Username != "" {
			server.Username = input.Username
		}
		if input.AuthMode != "" {
			server.AuthMode = input.AuthMode
		}
		if input.Secret != "" {
			server.Secret = input.Secret
		}

		if err := db.Save(&server).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update server"})
			return
		}

		// 更新成功后，清除所有相关缓存，以确保所有用户的列表都是最新的
		serverCache.Flush()

		c.JSON(http.StatusOK, server)
	}
}

// DeleteServer handles deleting a server entry
func DeleteServer(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		serverID, err := strconv.ParseUint(id, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid server ID"})
			return
		}

		if err := db.Delete(&model.Server{}, serverID).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete server"})
			return
		}

		// 删除成功后，刷新全部缓存
		serverCache.Flush()

		c.JSON(http.StatusOK, gin.H{"message": "server deleted successfully"})
	}
}

// GetStatsHistory retrieves historical latency data for specific servers and targets
func GetStatsHistory(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		serverIDsParam := c.Query("server_ids") // comma separated
		targetsParam := c.Query("targets")      // comma separated
		duration := c.Query("range")            // 1H, 24H, 7D, 1M

		var startTime time.Time
		now := time.Now()

		switch duration {
		case "1H":
			startTime = now.Add(-1 * time.Hour)
		case "24H":
			startTime = now.Add(-24 * time.Hour)
		case "7D":
			startTime = now.AddDate(0, 0, -7)
		case "1M":
			startTime = now.AddDate(0, -1, 0)
		default:
			startTime = now.Add(-24 * time.Hour) // Default 24H
		}

		query := db.Model(&model.StatsHistory{}).Where("timestamp >= ?", startTime)

		if serverIDsParam != "" {
			ids := strings.Split(serverIDsParam, ",")
			query = query.Where("server_id IN ?", ids)
		}

		if targetsParam != "" {
			targets := strings.Split(targetsParam, ",")
			query = query.Where("target IN ?", targets)
		}

		var rawResults []model.StatsHistory
		if err := query.Order("timestamp asc").Find(&rawResults).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch history"})
			return
		}

		type HistoryPoint struct {
			Name    string  `json:"name"`
			Latency float64 `json:"latency"`
		}

		resultMap := make(map[string][]float64)
		for _, r := range rawResults {
			var timeKey string
			if duration == "1H" || duration == "24H" {
				timeKey = r.Timestamp.Format("15:04")
			} else {
				timeKey = r.Timestamp.Format("01-02 15h")
			}
			resultMap[timeKey] = append(resultMap[timeKey], r.Latency)
		}

		var finalHistory []HistoryPoint
		seenKeys := make(map[string]bool)
		for _, r := range rawResults {
			var timeKey string
			if duration == "1H" || duration == "24H" {
				timeKey = r.Timestamp.Format("15:04")
			} else {
				timeKey = r.Timestamp.Format("01-02 15h")
			}
			if !seenKeys[timeKey] {
				lats := resultMap[timeKey]
				var sum float64
				for _, l := range lats {
					sum += l
				}
				finalHistory = append(finalHistory, HistoryPoint{
					Name:    timeKey,
					Latency: MathRound(sum/float64(len(lats)), 1),
				})
				seenKeys[timeKey] = true
			}
		}

		c.JSON(http.StatusOK, finalHistory)
	}
}

func MathRound(val float64, precision int) float64 {
	p := 1.0
	for i := 0; i < precision; i++ {
		p *= 10
	}
	return float64(int(val*p+0.5)) / p
}
