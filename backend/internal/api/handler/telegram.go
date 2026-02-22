package handler

import (
	"net/http"
	"strconv"

	"docker-pulse/internal/model"
	"docker-pulse/internal/ssh"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// GetTelegramUserInfo 获取当前 Telegram 用户的基本信息
func GetTelegramUserInfo(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, exists := c.Get("userID")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
			return
		}

		var user model.User
		if err := db.First(&user, userID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}

		// 获取用户拥有的服务器数量
		var serverCount int64
		if user.Role == "admin" {
			db.Model(&model.Server{}).Count(&serverCount)
		} else {
			var permissions []model.ServerPermission
			db.Where("user_id = ?", userID).Find(&permissions)
			serverCount = int64(len(permissions))
		}

		c.JSON(http.StatusOK, gin.H{
			"user_id":       user.ID,
			"username":      user.Username,
			"role":          user.Role,
			"telegram_id":   user.TelegramID,
			"server_count":  serverCount,
			"is_bound":      user.TelegramID != 0,
		})
	}
}

// GetTelegramServerList 获取 Telegram 用户可访问的服务器列表
func GetTelegramServerList(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, _ := c.Get("userID")
		userRole, _ := c.Get("role")

		var servers []model.Server
		if userRole == "admin" {
			if err := db.Find(&servers).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch servers"})
				return
			}
		} else {
			var permissions []model.ServerPermission
			if err := db.Where("user_id = ?", userID).Find(&permissions).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch permissions"})
				return
			}

			if len(permissions) == 0 {
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

		// 简化返回的服务器信息
		type TelegramServerInfo struct {
			ID   uint   `json:"id"`
			Name string `json:"name"`
			IP   string `json:"ip"`
		}

		result := make([]TelegramServerInfo, len(servers))
		for i, s := range servers {
			result[i] = TelegramServerInfo{
				ID:   s.ID,
				Name: s.Name,
				IP:   s.IP,
			}
		}

		c.JSON(http.StatusOK, result)
	}
}

// GetTelegramContainerStatus 获取指定服务器的容器状态（简化版）
func GetTelegramContainerStatus(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		serverID, err := strconv.ParseUint(id, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid server ID"})
			return
		}

		userID, _ := c.Get("userID")
		userRole, _ := c.Get("role")

		// 权限检查
		if userRole != "admin" {
			var permission model.ServerPermission
			if err := db.Where("user_id = ? AND server_id = ?", userID, serverID).First(&permission).Error; err != nil {
				c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
				return
			}
		}

		var server model.Server
		if err := db.First(&server, serverID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
			return
		}

		sshClient, err := ssh.NewSSHClient(server.IP, server.Port, server.Username, server.AuthMode, server.Secret)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to connect to server"})
			return
		}

		output, err := sshClient.GetContainers()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get containers"})
			return
		}

		containers := parseContainerOutput(output, uint(serverID), userID.(uint))

		// 简化返回的容器信息
		type TelegramContainerInfo struct {
			ID     string `json:"id"`
			Name   string `json:"name"`
			Status string `json:"status"`
			State  string `json:"state"`
		}

		result := make([]TelegramContainerInfo, len(containers))
		for i, container := range containers {
			result[i] = TelegramContainerInfo{
				ID:     container.ID,
				Name:   container.Name,
				Status: container.Status,
				State:  container.State,
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"server_name": server.Name,
			"containers":  result,
			"total":       len(result),
		})
	}
}

// GetTelegramServerStats 获取指定服务器的统计信息（简化版）
func GetTelegramServerStats(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		serverID, err := strconv.ParseUint(id, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid server ID"})
			return
		}

		userID, _ := c.Get("userID")
		userRole, _ := c.Get("role")

		// 权限检查
		if userRole != "admin" {
			var permission model.ServerPermission
			if err := db.Where("user_id = ? AND server_id = ?", userID, serverID).First(&permission).Error; err != nil {
				c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
				return
			}
		}

		var server model.Server
		if err := db.First(&server, serverID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
			return
		}

		sshClient, err := ssh.NewSSHClient(server.IP, server.Port, server.Username, server.AuthMode, server.Secret)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to connect to server"})
			return
		}

		var pingTargets string
		var config model.Config
		if err := db.Where("key = ?", model.ConfigKeyPingTargets).First(&config).Error; err == nil {
			pingTargets = config.Value
		}

		stats, err := sshClient.GetServerRealtimeStats(pingTargets)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get server stats"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"server_name":         server.Name,
			"status":              stats.Status,
			"cpu_usage":           stats.CPUUsage,
			"ram_usage":           stats.RAMUsage,
			"docker_version":      stats.DockerVersion,
			"uptime":              stats.Uptime,
			"running_containers":  stats.RunningContainers,
			"total_containers":    stats.TotalContainers,
			"latency":             stats.Latency,
		})
	}
}

// GetTelegramQuickSummary 获取 Telegram 快速摘要信息
func GetTelegramQuickSummary(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, _ := c.Get("userID")
		userRole, _ := c.Get("role")

		var servers []model.Server
		if userRole == "admin" {
			db.Find(&servers)
		} else {
			var permissions []model.ServerPermission
			db.Where("user_id = ?", userID).Find(&permissions)
			if len(permissions) == 0 {
				c.JSON(http.StatusOK, gin.H{
					"total_servers":     0,
					"online_servers":    0,
					"total_containers":  0,
					"running_containers": 0,
				})
				return
			}
			serverIDs := make([]uint, len(permissions))
			for i, p := range permissions {
				serverIDs[i] = p.ServerID
			}
			db.Where("id IN ?", serverIDs).Find(&servers)
		}

		totalServers := len(servers)
		onlineServers := 0
		totalContainers := 0
		runningContainers := 0

		// 获取每个服务器的状态
		for _, server := range servers {
			sshClient, err := ssh.NewSSHClient(server.IP, server.Port, server.Username, server.AuthMode, server.Secret)
			if err == nil {
				// 尝试获取状态
				output, err := sshClient.GetContainers()
				if err == nil {
					containers := parseContainerOutput(output, server.ID, userID.(uint))
					totalContainers += len(containers)
					for _, c := range containers {
						if c.State == "running" {
							runningContainers++
						}
					}
					onlineServers++
				}
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"total_servers":      totalServers,
			"online_servers":     onlineServers,
			"total_containers":   totalContainers,
			"running_containers": runningContainers,
		})
	}
}