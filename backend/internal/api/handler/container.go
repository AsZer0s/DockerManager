package handler

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"docker-pulse/internal/model"
	"docker-pulse/internal/ssh"

	"github.com/gin-gonic/gin"
	"github.com/patrickmn/go-cache"
	"gorm.io/gorm"
)

const (
	containerCacheKeyPrefix = "containers_server_"
	containerCacheTTL       = 5 * time.Minute
	containerCacheCleanup   = 10 * time.Minute
)

// Cache for container lists
var containerCache = cache.New(containerCacheTTL, containerCacheCleanup)

// ListContainers handles fetching a list of Docker containers for a given server
func ListContainers(db *gorm.DB) gin.HandlerFunc {
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

		cacheKey := fmt.Sprintf("%s%d", containerCacheKeyPrefix, serverID)

		// 尝试从缓存中获取
		if cachedContainers, found := containerCache.Get(cacheKey); found {
			c.JSON(http.StatusOK, cachedContainers)
			return
		}

		// 缓存未命中，从 SSH 获取
		sshClient, err := ssh.NewSSHClient(server.IP, server.Port, server.Username, server.AuthMode, server.Secret)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to create SSH client: %v", err)})
			return
		}

		output, err := sshClient.GetContainers()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get containers from server: %v", err)})
			return
		}

		containers := parseContainerOutput(output, uint(serverID), userID.(uint))

		// 存入缓存
		containerCache.Set(cacheKey, model.ContainerListResponse{Containers: containers, Total: len(containers)}, containerCacheTTL)

		c.JSON(http.StatusOK, model.ContainerListResponse{Containers: containers, Total: len(containers)})
	}
}

// ContainerAction handles starting, stopping, restarting, or removing a Docker container
func ContainerAction(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req model.ContainerActionRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		userID, _ := c.Get("userID")
		userRole, _ := c.Get("role")

		// 权限检查
		if userRole != "admin" {
			var permission model.ServerPermission
			if err := db.Where("user_id = ? AND server_id = ?", userID, req.ServerID).First(&permission).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					c.JSON(http.StatusForbidden, gin.H{"error": "access to this server is denied"})
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check permissions"})
				return
			}

			// Check access level
			switch req.Action {
			case "remove":
				if permission.AccessLevel != model.AccessLevelFull {
					c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions: 'full' access required for removal"})
					return
				}
			case "start", "stop", "restart", "pull":
				if permission.AccessLevel != model.AccessLevelManage && permission.AccessLevel != model.AccessLevelFull {
					c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions: 'manage' access required for this action"})
					return
				}
			default:
				c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions for this action"})
				return
			}
		}

		var server model.Server
		if err := db.First(&server, req.ServerID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch server from DB"})
			return
		}

		sshClient, err := ssh.NewSSHClient(server.IP, server.Port, server.Username, server.AuthMode, server.Secret)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to create SSH client: %v", err)})
			return
		}

		err = sshClient.ExecuteContainerAction(req.ContainerID, req.Action)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to execute container action: %v", err)})
			return
		}

		// 操作成功后，清除缓存以确保下次请求获取最新数据
		cacheKey := fmt.Sprintf("%s%d", containerCacheKeyPrefix, req.ServerID)
		containerCache.Delete(cacheKey)

		c.JSON(http.StatusOK, gin.H{"message": fmt.Sprintf("container %s %sed successfully", req.ContainerID, req.Action)})
	}
}

// GetContainerLogs handles fetching logs for a specific Docker container
func GetContainerLogs(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		serverIDStr := c.Param("id")
		containerID := c.Param("containerID")
		tail := c.DefaultQuery("tail", "all") // Default to all logs

		serverID, err := strconv.ParseUint(serverIDStr, 10, 32)
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
				if errors.Is(err, gorm.ErrRecordNotFound) {
					c.JSON(http.StatusForbidden, gin.H{"error": "access to this server is denied"})
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check permissions"})
				return
			}
			// TODO: Add more granular container-level permissions if needed
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

		sshClient, err := ssh.NewSSHClient(server.IP, server.Port, server.Username, server.AuthMode, server.Secret)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to create SSH client: %v", err)})
			return
		}

		logs, err := sshClient.GetContainerLogs(containerID, tail)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get container logs: %v", err)})
			return
		}

		c.JSON(http.StatusOK, model.ContainerLogResponse{Logs: logs})
	}
}

// GetContainerDetails handles fetching detailed information for a specific Docker container
func GetContainerDetails(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		serverIDStr := c.Param("id")
		containerID := c.Param("containerID")

		serverID, err := strconv.ParseUint(serverIDStr, 10, 32)
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

		sshClient, err := ssh.NewSSHClient(server.IP, server.Port, server.Username, server.AuthMode, server.Secret)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to create SSH client: %v", err)})
			return
		}

		details, err := sshClient.GetContainerDetails(containerID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get container details: %v", err)})
			return
		}

		c.JSON(http.StatusOK, gin.H{"details": details})
	}
}

// CheckContainerImageUpdate handles checking if a container's image has an update
func CheckContainerImageUpdate(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		serverIDStr := c.Param("id")
		containerID := c.Param("containerID")

		serverID, err := strconv.ParseUint(serverIDStr, 10, 32)
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

		sshClient, err := ssh.NewSSHClient(server.IP, server.Port, server.Username, server.AuthMode, server.Secret)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to create SSH client: %v", err)})
			return
		}

		hasUpdate, err := sshClient.CheckForImageUpdate(containerID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to check for image update: %v", err)})
			return
		}

		c.JSON(http.StatusOK, gin.H{"has_update": hasUpdate})
	}
}

// ListContainerFiles handles fetching a list of files/directories inside a container
func ListContainerFiles(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		serverIDStr := c.Param("id")
		containerID := c.Param("containerID")
		path := c.DefaultQuery("path", "/") // Default path is root

		serverID, err := strconv.ParseUint(serverIDStr, 10, 32)
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

		sshClient, err := ssh.NewSSHClient(server.IP, server.Port, server.Username, server.AuthMode, server.Secret)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to create SSH client: %v", err)})
			return
		}

		files, err := sshClient.ListContainerFiles(containerID, path)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to list container files: %v", err)})
			return
		}

		c.JSON(http.StatusOK, model.FileListResponse{Path: path, Files: files})
	}
}

// GetContainerFileContent handles fetching the content of a file inside a container
func GetContainerFileContent(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		serverIDStr := c.Param("id")
		containerID := c.Param("containerID")
		path := c.Query("path") // Path is required

		if path == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "file path is required"})
			return
		}

		serverID, err := strconv.ParseUint(serverIDStr, 10, 32)
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

		sshClient, err := ssh.NewSSHClient(server.IP, server.Port, server.Username, server.AuthMode, server.Secret)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to create SSH client: %v", err)})
			return
		}

		content, err := sshClient.GetContainerFileContent(containerID, path)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get file content: %v", err)})
			return
		}

		c.JSON(http.StatusOK, model.FileContentResponse{Path: path, Content: content})
	}
}

// parseContainerOutput parses the raw output from "docker ps -a --format" into a slice of Container models
func parseContainerOutput(output string, serverID, userID uint) []model.Container {
	var containers []model.Container
	lines := strings.Split(strings.TrimSpace(output), "\n")

	for _, line := range lines {
		if line == "" {
			continue
		}
		parts := strings.Split(line, "|")
		if len(parts) != 7 {
			// Skip malformed lines
			continue
		}

		createdAt, err := time.Parse(time.RFC3339, parts[6]) // Assuming CreatedAt is in RFC3339 format
		if err != nil {
			createdAt = time.Now() // Fallback to current time if parsing fails
		}

		// Parse ports string
		ports := []string{}
		if parts[5] != "" {
			// Example: "0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp"
			portMappings := strings.Split(parts[5], ", ")
			for _, pm := range portMappings {
				ports = append(ports, strings.TrimSpace(pm))
			}
		}

		containers = append(containers, model.Container{
			ID:         parts[0],
			ServerID:   serverID,
			Name:       parts[1],
			Image:      parts[2],
			Status:     parts[3],
			State:      parts[4],
			Ports:      ports,
			CreatedAt:  createdAt,
			UserID:     userID,  // Assign current user as owner for now, refine with actual Docker labels if available
			Permission: "admin", // Default permission for now, refine with actual permission logic
		})
	}
	return containers
}
